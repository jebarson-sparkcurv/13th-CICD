import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, Printer, MessageCircle, Mail, IndianRupee, History } from "lucide-react";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { Label } from "../../../components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../../../components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../../components/ui/select";
import { useAuth } from "../../../context/AuthContext";
import api, { formatApiErrorDetail } from "../../../api/client";
import { QuotationStatusBadge } from "../components/QuotationsSection";

const fmt = (n) => `₹${Number(n || 0).toLocaleString("en-IN")}`;
const METHODS = ["BankTransfer", "Cash", "Cheque", "UPI"];

export default function QuotationDetailPage() {
  const { id, quotationId } = useParams();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [sendChannel, setSendChannel] = useState(null);
  const [sending, setSending] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [pay, setPay] = useState({ amount: "", payment_method: "BankTransfer", reference_no: "", notes: "" });
  const [paying, setPaying] = useState(false);
  const canPay = ["Admin", "Accountant"].includes(user?.role);

  const { data: q } = useQuery({
    queryKey: ["quotation", quotationId],
    queryFn: () => api.get(`/quotations/${quotationId}`).then((r) => r.data),
  });
  const { data: vendor } = useQuery({
    queryKey: ["vendor", q?.vendor_id],
    queryFn: () => api.get(`/vendors/${q.vendor_id}`).then((r) => r.data),
    enabled: !!q?.vendor_id,
  });
  const { data: log } = useQuery({
    queryKey: ["quotationShareLog", quotationId],
    queryFn: () => api.get(`/quotations/${quotationId}/share-log`).then((r) => r.data),
  });

  const openPrint = async () => {
    try {
      const r = await api.get(`/quotations/${quotationId}/print`);
      const w = window.open("", "_blank");
      w.document.write(r.data);
      w.document.close();
    } catch { toast.error("Could not load print view"); }
  };

  const send = async () => {
    setSending(true);
    try {
      const r = await api.post(`/quotations/${quotationId}/send`, { channel: sendChannel });
      if (r.data.wa_link) window.open(r.data.wa_link, "_blank");
      if (r.data.status === "sent") toast.success(`Sent via ${sendChannel} to ${r.data.sent_to}`);
      else toast.error(`Email delivery failed (logged in share history) — check SMTP settings`);
      setSendChannel(null);
      qc.invalidateQueries({ queryKey: ["quotationShareLog", quotationId] });
      qc.invalidateQueries({ queryKey: ["quotation", quotationId] });
      qc.invalidateQueries({ queryKey: ["quotations", id] });
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || err.message);
    } finally { setSending(false); }
  };

  const setStatus = async (status) => {
    if (!status) return;
    try {
      await api.patch(`/quotations/${quotationId}`, { status });
      toast.success(`Status set to ${status}`);
      qc.invalidateQueries({ queryKey: ["quotation", quotationId] });
      qc.invalidateQueries({ queryKey: ["quotations", id] });
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || err.message);
    }
  };

  const submitPayment = async () => {
    if (!(Number(pay.amount) > 0)) { toast.error("Enter a valid amount"); return; }
    setPaying(true);
    try {
      await api.post(`/projects/${id}/vendor-payments`, {
        vendor_id: q.vendor_id, amount: Number(pay.amount), payment_method: pay.payment_method,
        reference_no: pay.reference_no || null, notes: pay.notes || null, quotation_id: Number(quotationId),
      });
      toast.success("Payment recorded — reflected in the project balance sheet");
      setPayOpen(false);
      setPay({ amount: "", payment_method: "BankTransfer", reference_no: "", notes: "" });
      qc.invalidateQueries({ queryKey: ["projectBalanceSheet"] });
      qc.invalidateQueries({ queryKey: ["projectFinance"] });
      qc.invalidateQueries({ queryKey: ["vendorPayments", id] });
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || err.message);
    } finally { setPaying(false); }
  };

  if (!q) return <div className="p-4 sm:p-8 text-sm text-slate-500 dark:text-slate-400">Loading quotation…</div>;

  const contact = sendChannel === "whatsapp" ? vendor?.phone : vendor?.email;

  return (
    <div className="p-4 sm:p-8" data-testid="quotation-detail-page">
      <Link to={`/admin/projects/${id}/procurement`} data-testid="back-to-procurement"
        className="inline-flex items-center gap-1.5 text-xs uppercase tracking-[0.15em] font-semibold text-slate-500 dark:text-slate-400 hover:text-blue-600 transition-colors mb-4">
        <ArrowLeft size={14} strokeWidth={2.5} /> Procurement
      </Link>

      <div className="flex items-end justify-between flex-wrap gap-4 mb-6">
        <div>
          <div className="text-blue-600 dark:text-blue-400 text-[11px] uppercase tracking-[0.3em] font-semibold mb-1">Quotation</div>
          <h1 className="font-heading font-bold text-4xl tracking-tight leading-none" data-testid="quotation-number">{q.quotation_number}</h1>
          <div className="flex items-center gap-3 mt-2 text-sm text-slate-600 dark:text-slate-400">
            <span data-testid="quotation-vendor-name">{q.vendor_name}</span>
            <span>·</span><span>{q.quotation_date}</span>
            {q.valid_until && <><span>·</span><span>Valid until {q.valid_until}</span></>}
            <QuotationStatusBadge status={q.status} />
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Select value="" onValueChange={setStatus}>
            <SelectTrigger data-testid="quotation-status-select" className="w-36 h-9 bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 rounded-md text-xs">
              <SelectValue placeholder="Set status…" />
            </SelectTrigger>
            <SelectContent className="bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700">
              {["draft", "sent", "accepted", "rejected", "expired"].map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={openPrint} data-testid="quotation-print-button"
            className="rounded-md border-slate-300 dark:border-slate-700 text-xs font-semibold uppercase tracking-wide">
            <Printer size={14} /> Print
          </Button>
          <Button variant="outline" onClick={() => setSendChannel("whatsapp")} data-testid="quotation-send-whatsapp"
            className="rounded-md border-slate-300 dark:border-slate-700 text-xs font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
            <MessageCircle size={14} /> WhatsApp
          </Button>
          <Button variant="outline" onClick={() => setSendChannel("email")} data-testid="quotation-send-email"
            className="rounded-md border-slate-300 dark:border-slate-700 text-xs font-semibold uppercase tracking-wide text-blue-700 dark:text-blue-400">
            <Mail size={14} /> Email
          </Button>
          {canPay && q.purchase_order && q.purchase_order.status !== "CANCELLED" && (
            <Link to={`/admin/projects/${id}/procurement/quotations/${quotationId}/purchase-order`} data-testid="quotation-pay-on-po"
              className="inline-flex items-center gap-1.5 h-9 px-4 rounded-md bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-100 text-white dark:text-slate-900 text-xs font-bold uppercase tracking-wide">
              <IndianRupee size={14} /> Pay on {q.purchase_order.po_number}
            </Link>
          )}
          {canPay && !(q.purchase_order && q.purchase_order.status !== "CANCELLED") && (
            <Button onClick={() => { setPay((p) => ({ ...p, amount: String(q.quotation_total || "") })); setPayOpen(true); }}
              data-testid="quotation-record-payment"
              className="rounded-md bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-100 text-white dark:text-slate-900 text-xs font-bold uppercase tracking-wide">
              <IndianRupee size={14} /> Record Payment
            </Button>
          )}
        </div>
      </div>

      <div className="border border-slate-200 dark:border-slate-800 overflow-x-auto mb-8">
        <table className="w-full text-sm" data-testid="quotation-line-items-table">
          <thead>
            <tr className="text-left text-[10px] uppercase tracking-[0.15em] text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
              <th className="px-4 py-3">Product</th>
              <th className="px-4 py-3">Qty</th>
              <th className="px-4 py-3 text-right">Unit Price</th>
              <th className="px-4 py-3 text-right">Line Total</th>
            </tr>
          </thead>
          <tbody>
            {(q.line_items || []).map((li) => (
              <tr key={li.id} className="border-b border-slate-100 dark:border-slate-800/60" data-testid={`line-item-${li.id}`}>
                <td className="px-4 py-3">
                  <div className="font-semibold text-slate-900 dark:text-slate-100">{li.product_name}</div>
                  {li.notes && <div className="text-xs text-slate-500 dark:text-slate-400">{li.notes}</div>}
                </td>
                <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{li.quantity} {li.unit}</td>
                <td className="px-4 py-3 text-right text-slate-600 dark:text-slate-400">{fmt(li.unit_price)}</td>
                <td className="px-4 py-3 text-right font-semibold">{fmt(li.line_total)}</td>
              </tr>
            ))}
            <tr className="bg-slate-50 dark:bg-slate-950">
              <td colSpan={3} className="px-4 py-3 text-right font-bold uppercase text-xs tracking-wide">Quotation Total</td>
              <td className="px-4 py-3 text-right font-heading font-bold text-lg text-blue-600 dark:text-blue-400" data-testid="quotation-detail-total">{fmt(q.quotation_total)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400 font-semibold mb-3">
        <History size={13} /> Share History
      </div>
      <div className="border border-slate-200 dark:border-slate-800 rounded-md" data-testid="share-log">
        {(log || []).length === 0 ? (
          <div className="p-6 text-center text-xs text-slate-500 dark:text-slate-400" data-testid="share-log-empty">Not shared yet.</div>
        ) : (
          (log || []).map((s, i) => (
            <div key={i} className="flex items-center gap-3 px-4 py-2.5 border-b border-slate-100 dark:border-slate-800/60 last:border-b-0 text-sm" data-testid={`share-log-row-${i}`}>
              {s.channel === "whatsapp" ? <MessageCircle size={14} className="text-emerald-600" /> : <Mail size={14} className="text-blue-600" />}
              <span className="font-semibold capitalize">{s.channel}</span>
              <span className="text-slate-500 dark:text-slate-400 text-xs">to {s.sent_to}</span>
              <span className="text-slate-400 text-xs">by {s.sent_by}</span>
              <span className="ml-auto text-xs text-slate-500 dark:text-slate-400">{s.sent_at ? new Date(s.sent_at).toLocaleString() : ""}</span>
              <span className={`text-[11px] font-semibold uppercase ${s.status === "sent" ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>{s.status}</span>
            </div>
          ))
        )}
      </div>

      <Dialog open={!!sendChannel} onOpenChange={(o) => !o && setSendChannel(null)}>
        <DialogContent className="bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 rounded-md max-w-sm" data-testid="send-confirm-dialog">
          <DialogHeader>
            <DialogTitle className="font-heading text-xl uppercase tracking-wide">Send via {sendChannel}</DialogTitle>
            <DialogDescription className="text-xs text-slate-500 dark:text-slate-400">
              Contact is read live from the vendor record.
            </DialogDescription>
          </DialogHeader>
          <div className="border border-slate-200 dark:border-slate-800 rounded-md p-3 text-sm">
            <div className="text-[10px] uppercase tracking-[0.15em] text-slate-500 dark:text-slate-400 font-semibold mb-1">
              {sendChannel === "whatsapp" ? "Vendor Phone" : "Vendor Email"}
            </div>
            <div className="font-semibold" data-testid="send-contact-value">{contact || "Not on file"}</div>
          </div>
          {!contact && (
            <div className="text-xs text-red-600 dark:text-red-400" data-testid="send-no-contact-warning">
              This vendor has no {sendChannel === "whatsapp" ? "phone number" : "email"} on file. Add it in the Vendor record first.
            </div>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setSendChannel(null)} className="rounded-md border-slate-300 dark:border-slate-700" data-testid="send-cancel">Cancel</Button>
            <Button onClick={send} disabled={!contact || sending} data-testid="send-confirm"
              className="rounded-md bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-100 text-white dark:text-slate-900 font-semibold uppercase tracking-wide text-xs">
              {sending ? "Sending…" : "Send"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={payOpen} onOpenChange={setPayOpen}>
        <DialogContent className="bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 rounded-md max-w-sm" data-testid="vendor-payment-modal">
          <DialogHeader>
            <DialogTitle className="font-heading text-xl uppercase tracking-wide">Record Vendor Payment</DialogTitle>
            <DialogDescription className="text-xs text-slate-500 dark:text-slate-400">
              Against {q.quotation_number} — {q.vendor_name}. Appears immediately on the project balance sheet.
            </DialogDescription>
          </DialogHeader>
          <div>
            <Label className="text-xs uppercase tracking-[0.15em] text-slate-500 dark:text-slate-400">Amount (₹) *</Label>
            <Input type="number" min="0" step="0.01" value={pay.amount} onChange={(e) => setPay((p) => ({ ...p, amount: e.target.value }))}
              data-testid="vp-amount-input" className="mt-1.5 bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 rounded-md" />
          </div>
          <div>
            <Label className="text-xs uppercase tracking-[0.15em] text-slate-500 dark:text-slate-400">Payment Method</Label>
            <Select value={pay.payment_method} onValueChange={(v) => { if (!v) return; setPay((p) => ({ ...p, payment_method: v })); }}>
              <SelectTrigger data-testid="vp-method-select" className="mt-1.5 bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 rounded-md"><SelectValue /></SelectTrigger>
              <SelectContent className="bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700">
                {METHODS.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs uppercase tracking-[0.15em] text-slate-500 dark:text-slate-400">Reference No.</Label>
            <Input value={pay.reference_no} onChange={(e) => setPay((p) => ({ ...p, reference_no: e.target.value }))}
              data-testid="vp-reference-input" className="mt-1.5 bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 rounded-md" />
          </div>
          <div>
            <Label className="text-xs uppercase tracking-[0.15em] text-slate-500 dark:text-slate-400">Notes</Label>
            <Input value={pay.notes} onChange={(e) => setPay((p) => ({ ...p, notes: e.target.value }))}
              data-testid="vp-notes-input" className="mt-1.5 bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 rounded-md" />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" onClick={() => setPayOpen(false)} className="rounded-md border-slate-300 dark:border-slate-700" data-testid="vp-cancel">Cancel</Button>
            <Button onClick={submitPayment} disabled={paying} data-testid="vp-submit"
              className="rounded-md bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-100 text-white dark:text-slate-900 font-semibold uppercase tracking-wide text-xs">
              {paying ? "Saving…" : "Record Payment"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
