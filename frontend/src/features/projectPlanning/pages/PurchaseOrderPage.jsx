import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, Trash2, Plus, Printer, Download, Mail, MessageCircle, Ban, Send, ShieldCheck, IndianRupee } from "lucide-react";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { Label } from "../../../components/ui/label";
import { Textarea } from "../../../components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../../../components/ui/dialog";
import { useAuth } from "../../../context/AuthContext";
import api, { formatApiErrorDetail } from "../../../api/client";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../../components/ui/select";

const PAY_METHODS = ["BankTransfer", "Cash", "Cheque", "UPI"];
const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const emptyPay = () => ({ amount: "", payment_method: "BankTransfer", payment_date: todayISO(), reference_no: "", notes: "" });

const fmt = (n) => `₹${Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const parseNum = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const BASE = process.env.REACT_APP_BACKEND_URL || "";

const StatusBadge = ({ status }) => {
  const styles = {
    DRAFT: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
    ISSUED: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400",
    SENT: "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400",
    CANCELLED: "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400",
  };
  return (
    <span data-testid="po-status-badge"
      className={`inline-flex px-2.5 py-0.5 rounded-full text-[11px] font-semibold uppercase tracking-wide ${styles[status] || styles.DRAFT}`}>
      {status}
    </span>
  );
};

export default function PurchaseOrderPage() {
  const { id: projectId, quotationId } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { user } = useAuth();
  const canWrite = ["Admin", "ProcurementOfficer", "Accountant"].includes(user?.role);

  const [po, setPO] = useState(null);
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState([]);
  const [discount, setDiscount] = useState(0);
  const [tax, setTax] = useState(0);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [sendOpen, setSendOpen] = useState(null); // "email" | "whatsapp" | null
  const canPay = ["Admin", "Accountant"].includes(user?.role);
  const [payOpen, setPayOpen] = useState(false);
  const [pay, setPay] = useState(emptyPay());
  const [paying, setPaying] = useState(false);

  // Fetch quotation for read-only header context
  const { data: quotation } = useQuery({
    queryKey: ["quotation", quotationId],
    queryFn: () => api.get(`/quotations/${quotationId}`).then((r) => r.data),
  });

  const poId = po?.id;
  const { data: payData } = useQuery({
    queryKey: ["poPayments", poId],
    queryFn: () => api.get(`/quotation-purchase-orders/${poId}/payments`).then((r) => r.data),
    enabled: !!poId,
  });

  const openPay = () => {
    setPay({ ...emptyPay(), amount: String(po?.balance_due ?? "") });
    setPayOpen(true);
  };
  const submitPayment = async () => {
    const amt = Number(pay.amount);
    if (!(amt > 0)) { toast.error("Enter a valid amount"); return; }
    if (amt > Number(po.balance_due) + 0.005) { toast.error(`Amount is more than the balance due (${fmt(po.balance_due)})`); return; }
    setPaying(true);
    try {
      const { data } = await api.post(`/quotation-purchase-orders/${po.id}/payments`, {
        amount: amt, payment_method: pay.payment_method, payment_date: pay.payment_date || null,
        reference_no: pay.reference_no || null, notes: pay.notes || null,
      });
      setPO(data);
      toast.success(`${fmt(amt)} paid to ${data.vendor?.name || "vendor"} — added to the project balance sheet`);
      setPayOpen(false);
      qc.invalidateQueries({ queryKey: ["poPayments", po.id] });
      qc.invalidateQueries({ queryKey: ["quotation", quotationId] });
      qc.invalidateQueries({ queryKey: ["quotations"] });
      qc.invalidateQueries({ queryKey: ["projectBalanceSheet"] });
      qc.invalidateQueries({ queryKey: ["projectFinance"] });
      qc.invalidateQueries({ queryKey: ["vendorPayments", projectId] });
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || err.message);
    } finally { setPaying(false); }
  };

  // Load or create the PO for this quotation.
  const bootstrap = async () => {
    setLoading(true);
    try {
      const r = await api.get(`/quotations/${quotationId}/purchase-order`);
      let data = r.data;
      if (!data) {
        // no active PO — create one
        const cr = await api.post(`/quotations/${quotationId}/purchase-order`);
        data = cr.data;
        toast.success(`Purchase Order ${data.po_number} drafted from quotation`);
      }
      applyPO(data);
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || err.message);
    } finally {
      setLoading(false);
    }
  };

  const applyPO = (data) => {
    setPO(data);
    setItems((data.items || []).map((it) => ({
      id: it.id,
      quotation_item_id: it.quotation_item_id,
      item_name: it.item_name,
      description: it.description || "",
      quantity: String(it.quantity),
      unit_price: String(it.unit_price),
    })));
    setDiscount(Number(data.discount || 0));
    setTax(Number(data.tax || 0));
    setNotes(data.notes || "");
  };
	useEffect(() => {
  bootstrap();
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [quotationId]);
  // Live totals (backend still authoritative on save)
  const totals = useMemo(() => {
    const rows = items.map((it) => ({
      ...it, line_total: parseNum(it.quantity) * parseNum(it.unit_price),
    }));
    const subtotal = rows.reduce((s, r) => s + r.line_total, 0);
    const grand = Math.max(0, subtotal - parseNum(discount) + parseNum(tax));
    return { rows, subtotal, grand };
  }, [items, discount, tax]);

  const setItem = (i, patch) => setItems((arr) => arr.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
  const removeItem = (i) => setItems((arr) => arr.filter((_, idx) => idx !== i));
  const addItem = () => setItems((arr) => [...arr, {
    quotation_item_id: null, item_name: "", description: "", quantity: "1", unit_price: "0",
  }]);

  const validate = () => {
    if (items.length === 0) { toast.error("Add at least one item"); return false; }
    for (const it of items) {
      if (!(it.item_name || "").trim()) { toast.error("Every item needs a name"); return false; }
      if (parseNum(it.quantity) <= 0) { toast.error("Quantity must be greater than 0"); return false; }
      if (parseNum(it.unit_price) < 0) { toast.error("Unit price cannot be negative"); return false; }
    }
    if (parseNum(discount) < 0) { toast.error("Discount cannot be negative"); return false; }
    if (parseNum(tax) < 0) { toast.error("Tax cannot be negative"); return false; }
    return true;
  };

  const savePO = async ({ issue = false } = {}) => {
    if (!validate()) return null;
    setSaving(true);
    try {
      const payload = {
        discount: parseNum(discount), tax: parseNum(tax), notes,
        items: items.map((it) => ({
          quotation_item_id: it.quotation_item_id || null,
          item_name: it.item_name.trim(),
          description: it.description || null,
          quantity: parseNum(it.quantity),
          unit_price: parseNum(it.unit_price),
        })),
        ...(issue ? { status: "ISSUED" } : {}),
      };
      const r = await api.put(`/quotation-purchase-orders/${po.id}`, payload);
      applyPO(r.data);
      qc.invalidateQueries({ queryKey: ["quotations", projectId] });
      qc.invalidateQueries({ queryKey: ["quotation", quotationId] });
      toast.success(issue ? "Purchase Order issued" : "Draft saved");
      return r.data;
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || err.message);
      return null;
    } finally {
      setSaving(false);
    }
  };

  const issueAndPreview = async () => {
    const saved = await savePO({ issue: true });
    if (saved) window.open(`${BASE}/api/quotation-purchase-orders/${saved.id}/pdf`, "_blank");
  };

  const openPDF = (download = false) => {
    const url = `${BASE}/api/quotation-purchase-orders/${po.id}/pdf${download ? "?download=1" : ""}`;
    window.open(url, "_blank");
  };

  const doCancel = async () => {
    try {
      const r = await api.post(`/quotation-purchase-orders/${po.id}/cancel`);
      applyPO(r.data);
      qc.invalidateQueries({ queryKey: ["quotations", projectId] });
      toast.success("Purchase Order cancelled");
      setCancelOpen(false);
      navigate(`/admin/projects/${projectId}/procurement/quotations/${quotationId}`);
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || err.message);
    }
  };

  const doSend = async () => {
    try {
      if (sendOpen === "email") {
        const r = await api.post(`/quotation-purchase-orders/${po.id}/send-email`);
        toast.success(`Emailed to ${r.data.sent_to}`);
        applyPO(r.data.po);
      } else if (sendOpen === "whatsapp") {
        const r = await api.post(`/quotation-purchase-orders/${po.id}/send-whatsapp`);
        if (r.data.wa_link) window.open(r.data.wa_link, "_blank");
        toast.success(`WhatsApp opened for ${r.data.sent_to}`);
        applyPO(r.data.po);
      }
      qc.invalidateQueries({ queryKey: ["quotations", projectId] });
      setSendOpen(null);
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || err.message);
    }
  };

  if (loading || !po) {
    return <div className="p-4 sm:p-8 text-sm text-slate-500 dark:text-slate-400" data-testid="po-loading">Loading purchase order…</div>;
  }

  const readOnly = po.status === "CANCELLED" || !canWrite;
  const vendor = po.vendor || {};
  const canEmail = !!(vendor.email || "").trim();
  const canWhatsapp = !!(vendor.phone || "").trim();

  return (
    <div className="p-4 sm:p-8 print:p-0" data-testid="purchase-order-page">
      <div className="print:hidden">
        <Link to={`/admin/projects/${projectId}/procurement/quotations/${quotationId}`}
          data-testid="back-to-quotation"
          className="inline-flex items-center gap-1.5 text-xs uppercase tracking-[0.15em] font-semibold text-slate-500 dark:text-slate-400 hover:text-blue-600 transition-colors mb-4">
          <ArrowLeft size={14} strokeWidth={2.5} /> Back to Quotation
        </Link>
      </div>

      <div className="flex items-end justify-between flex-wrap gap-4 mb-6">
        <div>
          <div className="text-amber-600 dark:text-amber-400 text-[11px] uppercase tracking-[0.3em] font-semibold mb-1">Purchase Order</div>
          <h1 className="font-heading font-bold text-4xl tracking-tight leading-none" data-testid="po-number">{po.po_number}</h1>
          <div className="flex items-center gap-3 mt-2 text-sm text-slate-600 dark:text-slate-400 flex-wrap">
            <span>Ref: {po.quotation_number}</span>
            <span>·</span>
            <span>{po.order_date}</span>
            <StatusBadge status={po.status} />
          </div>
        </div>
        {po.status === "CANCELLED" && (
          <div className="border border-red-300 dark:border-red-500/40 bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-400 px-3 py-2 rounded-md text-xs uppercase tracking-wide font-semibold flex items-center gap-1.5"
               data-testid="po-cancelled-banner">
            <Ban size={13} /> Cancelled on {po.cancelled_at ? new Date(po.cancelled_at).toLocaleString() : ""}
          </div>
        )}
      </div>

      <div className="grid md:grid-cols-2 gap-4 mb-8">
        <div className="border border-slate-200 dark:border-slate-800 p-4 rounded-md" data-testid="po-vendor-block">
          <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400 font-semibold mb-1">Vendor</div>
          <div className="font-heading font-semibold text-lg text-slate-900 dark:text-slate-100">{vendor.name || "—"}</div>
          <div className="text-xs text-slate-600 dark:text-slate-400 mt-1">
            {vendor.email && <div>Email: <span data-testid="po-vendor-email">{vendor.email}</span></div>}
            {vendor.phone && <div>Phone: <span data-testid="po-vendor-phone">{vendor.phone}</span></div>}
            {vendor.address && <div>{vendor.address}</div>}
          </div>
        </div>
        <div className="border border-slate-200 dark:border-slate-800 p-4 rounded-md" data-testid="po-project-block">
          <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400 font-semibold mb-1">Project</div>
          <div className="font-heading font-semibold text-lg text-slate-900 dark:text-slate-100">{po.project_name || "—"}</div>
          {quotation?.status && <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">Quotation status: {quotation.status}</div>}
        </div>
      </div>

      <div className="border border-slate-200 dark:border-slate-800 overflow-x-auto mb-6">
        <table className="w-full text-sm" data-testid="po-items-table">
          <thead>
            <tr className="text-left text-[10px] uppercase tracking-[0.15em] text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
              <th className="px-3 py-2">Item</th>
              <th className="px-3 py-2">Description</th>
              <th className="px-3 py-2 w-24">Qty</th>
              <th className="px-3 py-2 w-36 text-right">Unit Price</th>
              <th className="px-3 py-2 w-36 text-right">Total</th>
              {!readOnly && <th className="px-3 py-2 w-8"></th>}
            </tr>
          </thead>
          <tbody>
            {totals.rows.map((it, i) => (
              <tr key={i} data-testid={`po-item-row-${i}`} className="border-b border-slate-100 dark:border-slate-800/60">
                <td className="px-3 py-2">
                  <Input value={it.item_name} disabled={readOnly}
                    data-testid={`po-item-name-${i}`}
                    onChange={(e) => setItem(i, { item_name: e.target.value })}
                    className="h-9 text-sm bg-white dark:bg-slate-900" />
                </td>
                <td className="px-3 py-2">
                  <Input value={it.description} disabled={readOnly}
                    data-testid={`po-item-desc-${i}`}
                    onChange={(e) => setItem(i, { description: e.target.value })}
                    className="h-9 text-sm bg-white dark:bg-slate-900" />
                </td>
                <td className="px-3 py-2">
                  <Input type="number" min="0" step="0.01" value={it.quantity} disabled={readOnly}
                    data-testid={`po-item-qty-${i}`}
                    onChange={(e) => setItem(i, { quantity: e.target.value })}
                    className="h-9 text-sm bg-white dark:bg-slate-900" />
                </td>
                <td className="px-3 py-2">
                  <Input type="number" min="0" step="0.01" value={it.unit_price} disabled={readOnly}
                    data-testid={`po-item-price-${i}`}
                    onChange={(e) => setItem(i, { unit_price: e.target.value })}
                    className="h-9 text-sm text-right bg-white dark:bg-slate-900" />
                </td>
                <td className="px-3 py-2 text-right font-semibold tabular-nums" data-testid={`po-item-total-${i}`}>
                  {fmt(it.line_total)}
                </td>
                {!readOnly && (
                  <td className="px-3 py-2 text-right">
                    <button type="button" onClick={() => removeItem(i)}
                      data-testid={`po-remove-item-${i}`}
                      disabled={items.length <= 1}
                      className="text-slate-400 hover:text-rose-500 disabled:opacity-40">
                      <Trash2 size={14} />
                    </button>
                  </td>
                )}
              </tr>
            ))}
            {!readOnly && (
              <tr>
                <td colSpan={6} className="px-3 py-2">
                  <button type="button" onClick={addItem} data-testid="po-add-item"
                    className="inline-flex items-center gap-1 text-[11px] uppercase tracking-[0.12em] font-bold text-slate-900 dark:text-slate-100 hover:text-amber-600 dark:hover:text-amber-400">
                    <Plus size={12} strokeWidth={3} /> Add Item
                  </button>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="grid md:grid-cols-2 gap-6 mb-8">
        <div>
          <Label className="text-xs uppercase tracking-[0.15em] text-slate-500 dark:text-slate-400">Notes / Terms</Label>
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={5} disabled={readOnly}
            data-testid="po-notes" className="mt-1.5 bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 rounded-md text-sm" />
        </div>
        <div className="border border-slate-200 dark:border-slate-800 rounded-md p-4 bg-slate-50 dark:bg-slate-900/60" data-testid="po-summary">
          <SummaryRow label="Subtotal" testid="po-subtotal" value={fmt(totals.subtotal)} />
          <SummaryRow label="Discount (₹)" testid="po-discount">
            <Input type="number" min="0" step="0.01" value={discount} disabled={readOnly}
              data-testid="po-discount-input"
              onChange={(e) => setDiscount(e.target.value)}
              className="h-8 w-32 text-right text-sm bg-white dark:bg-slate-900" />
          </SummaryRow>
          <SummaryRow label="Tax (₹)" testid="po-tax">
            <Input type="number" min="0" step="0.01" value={tax} disabled={readOnly}
              data-testid="po-tax-input"
              onChange={(e) => setTax(e.target.value)}
              className="h-8 w-32 text-right text-sm bg-white dark:bg-slate-900" />
          </SummaryRow>
          <div className="border-t border-slate-300 dark:border-slate-700 mt-3 pt-3 flex items-center justify-between">
            <span className="text-xs uppercase tracking-[0.15em] font-bold text-slate-900 dark:text-slate-100">Grand Total</span>
            <span data-testid="po-grand-total" className="font-heading font-bold text-2xl text-amber-600 dark:text-amber-400 tabular-nums">{fmt(totals.grand)}</span>
          </div>
        </div>
      </div>

      {(po.status === "ISSUED" || po.status === "SENT" || (po.amount_paid || 0) > 0) && (
        <div className="border border-slate-200 dark:border-slate-800 rounded-md p-4 mb-6 print:hidden" data-testid="po-payments-panel">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-6 flex-wrap">
              <div>
                <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400 font-semibold">Paid to vendor</div>
                <div className="font-heading font-bold text-xl text-emerald-600 dark:text-emerald-400 tabular-nums" data-testid="po-amount-paid">{fmt(po.amount_paid)}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400 font-semibold">Balance due</div>
                <div className={`font-heading font-bold text-xl tabular-nums ${po.balance_due > 0 ? "text-rose-600 dark:text-rose-400" : "text-slate-400"}`} data-testid="po-balance-due">{fmt(po.balance_due)}</div>
              </div>
              <span data-testid="po-payment-status" className={`inline-flex px-2.5 py-0.5 rounded-full text-[11px] font-semibold uppercase tracking-wide ${
                po.payment_status === "Paid" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400"
                  : po.payment_status === "Partially Paid" ? "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400"
                    : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"}`}>{po.payment_status}</span>
            </div>
            {canPay && po.status !== "CANCELLED" && po.balance_due > 0 && (
              <Button onClick={openPay} data-testid="po-record-payment-btn"
                className="rounded-md bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold uppercase tracking-wide">
                <IndianRupee size={14} /> Record Payment
              </Button>
            )}
          </div>
          {(payData?.payments || []).length > 0 && (
            <table className="w-full text-sm mt-4" data-testid="po-payments-table">
              <thead>
                <tr className="text-left text-[10px] uppercase tracking-[0.15em] text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                  <th className="py-1.5">Date</th><th className="py-1.5">Method</th><th className="py-1.5">Reference</th>
                  <th className="py-1.5">Notes</th><th className="py-1.5">By</th><th className="py-1.5 text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {payData.payments.map((p) => (
                  <tr key={p.id} className="border-b border-slate-100 dark:border-slate-800/60" data-testid={`po-payment-${p.id}`}>
                    <td className="py-2">{p.payment_date}</td>
                    <td className="py-2">{p.payment_method}</td>
                    <td className="py-2 text-slate-500">{p.reference_no || "—"}</td>
                    <td className="py-2 text-slate-500 text-xs">{p.notes || "—"}</td>
                    <td className="py-2 text-slate-500 text-xs">{p.recorded_by || "—"}</td>
                    <td className="py-2 text-right font-semibold tabular-nums">{fmt(p.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 print:hidden" data-testid="po-actions">
        {!readOnly && (
          <>
            {!(po.amount_paid > 0) && <Button variant="outline" onClick={() => setCancelOpen(true)} data-testid="po-cancel-btn"
              className="rounded-md border-red-300 dark:border-red-500/40 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 text-xs font-bold uppercase tracking-wide">
              <Ban size={14} /> Cancel
            </Button>}
            <Button variant="outline" onClick={() => savePO({ issue: false })} disabled={saving}
              data-testid="po-save-draft-btn"
              className="rounded-md border-slate-300 dark:border-slate-700 text-xs font-bold uppercase tracking-wide">
              Save Draft
            </Button>
            <Button onClick={issueAndPreview} disabled={saving}
              data-testid="po-issue-btn"
              className="rounded-md bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-100 text-white dark:text-slate-900 text-xs font-bold uppercase tracking-wide">
              <ShieldCheck size={14} /> Purchase Order
            </Button>
          </>
        )}
        {po.status !== "CANCELLED" && (po.status === "ISSUED" || po.status === "SENT") && (
          <>
            <Button variant="outline" onClick={() => window.print()} data-testid="po-print-btn"
              className="rounded-md border-slate-300 dark:border-slate-700 text-xs font-bold uppercase tracking-wide">
              <Printer size={14} /> Print
            </Button>
            <Button variant="outline" onClick={() => openPDF(true)} data-testid="po-download-btn"
              className="rounded-md border-slate-300 dark:border-slate-700 text-xs font-bold uppercase tracking-wide">
              <Download size={14} /> Download
            </Button>
            <Button variant="outline" onClick={() => setSendOpen("email")} disabled={!canEmail}
              data-testid="po-email-btn"
              title={canEmail ? "" : "Vendor has no email on file"}
              className="rounded-md border-slate-300 dark:border-slate-700 text-blue-700 dark:text-blue-400 text-xs font-bold uppercase tracking-wide">
              <Mail size={14} /> Email
            </Button>
            <Button variant="outline" onClick={() => setSendOpen("whatsapp")} disabled={!canWhatsapp}
              data-testid="po-whatsapp-btn"
              title={canWhatsapp ? "" : "Vendor has no phone on file"}
              className="rounded-md border-slate-300 dark:border-slate-700 text-emerald-700 dark:text-emerald-400 text-xs font-bold uppercase tracking-wide">
              <MessageCircle size={14} /> WhatsApp
            </Button>
          </>
        )}
      </div>

      <Dialog open={payOpen} onOpenChange={setPayOpen}>
        <DialogContent className="bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 rounded-md max-w-sm" data-testid="po-payment-modal">
          <DialogHeader>
            <DialogTitle className="font-heading text-xl uppercase tracking-wide">Record Vendor Payment</DialogTitle>
            <DialogDescription className="text-xs text-slate-500 dark:text-slate-400">
              Against {po.po_number} — {vendor.name}. Balance due {fmt(po.balance_due)}. Appears on the project balance sheet.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs uppercase tracking-[0.15em] text-slate-500 dark:text-slate-400">Amount (₹) *</Label>
              <Input type="number" min="0" step="0.01" max={po.balance_due} value={pay.amount}
                onChange={(e) => setPay((p) => ({ ...p, amount: e.target.value }))} data-testid="po-pay-amount"
                className="mt-1.5 bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 rounded-md" />
              <div className="flex gap-2 mt-1.5">
                {[["Full balance", po.balance_due], ["50%", Math.round(po.balance_due * 50) / 100]].map(([l, v]) => (
                  <button key={l} type="button" onClick={() => setPay((p) => ({ ...p, amount: String(v) }))}
                    className="text-[11px] font-semibold text-amber-600 dark:text-amber-400 hover:underline">{l}</button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs uppercase tracking-[0.15em] text-slate-500 dark:text-slate-400">Method</Label>
                <Select value={pay.payment_method} onValueChange={(v) => { if (v) setPay((p) => ({ ...p, payment_method: v })); }}>
                  <SelectTrigger data-testid="po-pay-method" className="mt-1.5 bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 rounded-md"><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700">
                    {PAY_METHODS.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs uppercase tracking-[0.15em] text-slate-500 dark:text-slate-400">Date</Label>
                <Input type="date" max={todayISO()} value={pay.payment_date} onChange={(e) => setPay((p) => ({ ...p, payment_date: e.target.value }))}
                  data-testid="po-pay-date" className="mt-1.5 bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 rounded-md" />
              </div>
            </div>
            <div>
              <Label className="text-xs uppercase tracking-[0.15em] text-slate-500 dark:text-slate-400">Reference No. (UTR / cheque no.)</Label>
              <Input value={pay.reference_no} onChange={(e) => setPay((p) => ({ ...p, reference_no: e.target.value }))}
                data-testid="po-pay-reference" className="mt-1.5 bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 rounded-md" />
            </div>
            <div>
              <Label className="text-xs uppercase tracking-[0.15em] text-slate-500 dark:text-slate-400">Notes</Label>
              <Input value={pay.notes} onChange={(e) => setPay((p) => ({ ...p, notes: e.target.value }))}
                placeholder="e.g. Advance 50%" data-testid="po-pay-notes"
                className="mt-1.5 bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 rounded-md" />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setPayOpen(false)} className="rounded-md border-slate-300 dark:border-slate-700">Cancel</Button>
            <Button onClick={submitPayment} disabled={paying} data-testid="po-pay-submit"
              className="rounded-md bg-emerald-600 hover:bg-emerald-700 text-white font-semibold uppercase tracking-wide text-xs">
              {paying ? "Saving…" : "Record Payment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <DialogContent className="bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 rounded-md max-w-sm" data-testid="po-cancel-dialog">
          <DialogHeader>
            <DialogTitle className="font-heading text-xl uppercase tracking-wide">Cancel Purchase Order?</DialogTitle>
            <DialogDescription className="text-xs text-slate-500 dark:text-slate-400">
              Are you sure you want to cancel this purchase order? This cannot be undone — but the record will remain visible with a Cancelled badge.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setCancelOpen(false)} data-testid="po-cancel-abort"
              className="rounded-md border-slate-300 dark:border-slate-700 text-xs uppercase tracking-wide">
              Keep PO
            </Button>
            <Button onClick={doCancel} data-testid="po-cancel-confirm"
              className="rounded-md bg-red-600 hover:bg-red-700 text-white text-xs font-bold uppercase tracking-wide">
              <Ban size={13} /> Yes, Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!sendOpen} onOpenChange={(o) => !o && setSendOpen(null)}>
        <DialogContent className="bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 rounded-md max-w-sm" data-testid="po-send-dialog">
          <DialogHeader>
            <DialogTitle className="font-heading text-xl uppercase tracking-wide">
              Send via {sendOpen}
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500 dark:text-slate-400">
              Contact is read live from the vendor record.
            </DialogDescription>
          </DialogHeader>
          <div className="border border-slate-200 dark:border-slate-800 rounded-md p-3 text-sm">
            <div className="text-[10px] uppercase tracking-[0.15em] text-slate-500 dark:text-slate-400 font-semibold mb-1">
              {sendOpen === "email" ? "Vendor Email" : "Vendor Phone"}
            </div>
            <div className="font-semibold" data-testid="po-send-target">
              {sendOpen === "email" ? (vendor.email || "Not on file") : (vendor.phone || "Not on file")}
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setSendOpen(null)} data-testid="po-send-cancel"
              className="rounded-md border-slate-300 dark:border-slate-700 text-xs uppercase tracking-wide">Cancel</Button>
            <Button onClick={doSend} data-testid="po-send-confirm"
              className="rounded-md bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-100 text-white dark:text-slate-900 text-xs font-bold uppercase tracking-wide">
              <Send size={13} /> Send
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

const SummaryRow = ({ label, value, children, testid }) => (
  <div className="flex items-center justify-between py-1.5" data-testid={testid}>
    <span className="text-xs text-slate-600 dark:text-slate-400">{label}</span>
    {children || <span className="text-sm font-semibold tabular-nums">{value}</span>}
  </div>
);
