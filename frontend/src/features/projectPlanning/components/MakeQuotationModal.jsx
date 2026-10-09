import { useMemo, useState, useEffect } from "react";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, X } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../../../components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../../components/ui/select";
import { Input } from "../../../components/ui/input";
import { Label } from "../../../components/ui/label";
import { Button } from "../../../components/ui/button";
import api, { formatApiErrorDetail } from "../../../api/client";

const fmt = (n) => `₹${Number(n || 0).toLocaleString("en-IN")}`;
const emptyRow = () => ({ product_id: "", quantity: "", unit_price: "", notes: "" });

export const MakeQuotationModal = ({ projectId, open, onOpenChange, onCreated }) => {
  const qc = useQueryClient();
  const [vendorId, setVendorId] = useState("");
  const [validUntil, setValidUntil] = useState("");
  const [rows, setRows] = useState([emptyRow()]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) { setVendorId(""); setValidUntil(""); setRows([emptyRow()]); }
  }, [open]);

  const { data: vendors } = useQuery({
    queryKey: ["vendors"],
    queryFn: () => api.get("/vendors").then((r) => r.data),
    enabled: open,
  });
  const { data: products } = useQuery({
    queryKey: ["products"],
    queryFn: () => api.get("/products").then((r) => r.data),
    enabled: open,
  });

  const setRow = (i, patch) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const pickProduct = (i, pid) => {
    if (!pid) return;
    const p = (products || []).find((x) => String(x.id) === pid);
    setRow(i, { product_id: pid, unit_price: p?.default_price != null ? String(p.default_price) : "" });
  };

  const total = useMemo(() => rows.reduce(
    (s, r) => s + (Number(r.quantity) > 0 && Number(r.unit_price) >= 0 ? Number(r.quantity) * Number(r.unit_price || 0) : 0), 0), [rows]);

  const submit = async () => {
    if (!vendorId) { toast.error("Select a vendor"); return; }
    const items = rows.filter((r) => r.product_id && Number(r.quantity) > 0)
      .map((r) => ({ product_id: Number(r.product_id), quantity: Number(r.quantity), unit_price: Number(r.unit_price || 0), notes: r.notes || null }));
    if (items.length === 0) { toast.error("Add at least one line item with product and quantity"); return; }
    setSaving(true);
    try {
      const res = await api.post(`/projects/${projectId}/quotations`, {
        vendor_id: Number(vendorId), valid_until: validUntil || null, line_items: items,
      });
      toast.success(`Quotation ${res.data.quotation_number} created`);
      qc.invalidateQueries({ queryKey: ["quotations", projectId] });
      onOpenChange(false);
      onCreated?.(res.data);
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || err.message);
    } finally { setSaving(false); }
  };

  const unitFor = (pid) => (products || []).find((x) => String(x.id) === pid)?.unit || "";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 rounded-md max-w-2xl" data-testid="make-quotation-modal">
        <DialogHeader>
          <DialogTitle className="font-heading text-2xl uppercase tracking-wide">Make Quotation</DialogTitle>
          <DialogDescription className="text-xs text-slate-500 dark:text-slate-400">Pick a vendor, then add product line items from the global catalog.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label className="text-xs uppercase tracking-[0.15em] text-slate-500 dark:text-slate-400">Vendor *</Label>
            <Select value={vendorId} onValueChange={(v) => { if (!v) return; setVendorId(v); }}>
              <SelectTrigger data-testid="mq-vendor-select" className="mt-1.5 bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 rounded-md">
                <SelectValue placeholder="Select vendor…" />
              </SelectTrigger>
              <SelectContent className="bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700">
                {(vendors || []).map((v) => <SelectItem key={v.id} value={String(v.id)}>{v.name} — {v.trade || v.vendor_type}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs uppercase tracking-[0.15em] text-slate-500 dark:text-slate-400">Valid Until</Label>
            <Input type="date" data-testid="mq-valid-until" value={validUntil} onChange={(e) => setValidUntil(e.target.value)}
              className="mt-1.5 bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 rounded-md" />
          </div>
        </div>

        <div className="space-y-2 max-h-72 overflow-y-auto pr-1" data-testid="mq-line-items">
          {rows.map((r, i) => (
            <div key={i} className="flex items-center gap-2 border border-slate-200 dark:border-slate-800 rounded-md p-2.5" data-testid={`mq-row-${i}`}>
              <div className="flex-1 min-w-0">
                <Select value={r.product_id} onValueChange={(v) => pickProduct(i, v)}>
                  <SelectTrigger data-testid={`mq-product-select-${i}`} className="bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 rounded-md h-9">
                    <SelectValue placeholder="Product…" />
                  </SelectTrigger>
                  <SelectContent className="bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700">
                    {(products || []).map((p) => (
                      <SelectItem key={p.id} value={String(p.id)}>{p.name} ({p.unit}){p.default_price != null ? ` — ${fmt(p.default_price)}` : ""}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Input type="number" min="0" placeholder={`Qty${r.product_id ? ` (${unitFor(r.product_id)})` : ""}`}
                value={r.quantity} onChange={(e) => setRow(i, { quantity: e.target.value })}
                data-testid={`mq-qty-${i}`} className="w-24 h-9 bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 rounded-md text-sm" />
              <Input type="number" min="0" step="0.01" placeholder="Unit ₹"
                value={r.unit_price} onChange={(e) => setRow(i, { unit_price: e.target.value })}
                data-testid={`mq-price-${i}`} className="w-28 h-9 bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 rounded-md text-sm" />
              <span className="w-24 text-right text-sm font-semibold shrink-0" data-testid={`mq-line-total-${i}`}>
                {Number(r.quantity) > 0 ? fmt(Number(r.quantity) * Number(r.unit_price || 0)) : "—"}
              </span>
              <Button size="sm" variant="ghost" data-testid={`mq-remove-row-${i}`} disabled={rows.length <= 1}
                onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}
                className="h-8 w-8 p-0 text-slate-400 hover:text-red-500"><X size={14} /></Button>
            </div>
          ))}
          {(products || []).length === 0 && (
            <div className="text-xs text-slate-500 dark:text-slate-400 border border-dashed border-slate-300 dark:border-slate-700 rounded-md p-5 text-center" data-testid="mq-no-products">
              No products in the catalog yet — add products from Procurement → Vendors first.
            </div>
          )}
        </div>
        <Button variant="outline" onClick={() => setRows((rs) => [...rs, emptyRow()])} data-testid="mq-add-row"
          className="rounded-md border-dashed border-slate-300 dark:border-slate-700 text-xs w-full">
          <Plus size={13} /> Add Line Item
        </Button>

        <div className="flex items-center justify-between border-t border-slate-200 dark:border-slate-800 pt-3">
          <div className="text-sm">Total: <span className="font-heading font-bold text-xl text-blue-600 dark:text-blue-400" data-testid="mq-total">{fmt(total)}</span></div>
          <Button onClick={submit} disabled={saving} data-testid="mq-submit"
            className="rounded-md bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-100 text-white dark:text-slate-900 font-bold uppercase tracking-wide text-xs">Create Quotation</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
