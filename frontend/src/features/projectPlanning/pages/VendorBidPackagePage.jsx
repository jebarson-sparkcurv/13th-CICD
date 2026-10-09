import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, Send } from "lucide-react";
import api, { formatApiErrorDetail } from "../../../api/client";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { CommitmentStatusBadge } from "../components/CommitmentStatusBadge";

const fmt = (n) => `₹${Number(n || 0).toLocaleString("en-IN")}`;

export const VendorQuoteLineItemForm = ({ item, row, onChange, disabled }) => (
  <div className="surface p-4" data-testid={`quote-item-${item.id}`}>
    <div className="flex flex-wrap items-center gap-3 mb-3">
      <span className="font-semibold text-slate-900 dark:text-slate-100">{item.item_description}</span>
      <span className="text-xs text-slate-500 dark:text-slate-400">Required: {item.quantity_required} {item.unit || ""}</span>
      {item.my_quote && <span className="ml-auto text-xs text-emerald-600 dark:text-emerald-400">Quoted {fmt(item.my_quote.line_total)}</span>}
    </div>
    <div className="flex flex-wrap gap-3">
      <div>
        <div className="text-[10px] uppercase tracking-[0.15em] text-slate-500 dark:text-slate-400 mb-1">Qty Offered</div>
        <Input data-testid={`quote-qty-${item.id}`} type="number" disabled={disabled} value={row.qty}
          onChange={(e) => onChange(item.id, "qty", e.target.value)} className="bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 rounded-md h-9 w-28" />
      </div>
      <div>
        <div className="text-[10px] uppercase tracking-[0.15em] text-slate-500 dark:text-slate-400 mb-1">Unit Price (₹) *</div>
        <Input data-testid={`quote-price-${item.id}`} type="number" disabled={disabled} value={row.price}
          onChange={(e) => onChange(item.id, "price", e.target.value)} className="bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 rounded-md h-9 w-32" />
      </div>
      <div>
        <div className="text-[10px] uppercase tracking-[0.15em] text-slate-500 dark:text-slate-400 mb-1">Lead Time (days)</div>
        <Input data-testid={`quote-lead-${item.id}`} type="number" disabled={disabled} value={row.lead}
          onChange={(e) => onChange(item.id, "lead", e.target.value)} className="bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 rounded-md h-9 w-28" />
      </div>
      {row.price !== "" && (
        <div className="ml-auto self-end pb-1 text-sm text-slate-600 dark:text-slate-400">
          Line total: <span className="font-semibold text-slate-900 dark:text-slate-100">{fmt(Number(row.qty || item.quantity_required) * Number(row.price))}</span>
        </div>
      )}
    </div>
  </div>
);

export default function VendorBidPackagePage() {
  const { id } = useParams();
  const qc = useQueryClient();
  const [rows, setRows] = useState({});
  const [saving, setSaving] = useState(false);
  const { data, isLoading } = useQuery({
    queryKey: ["vendorPackage", id],
    queryFn: () => api.get(`/vendor/bid-packages/${id}`).then((r) => r.data),
  });

  useEffect(() => {
    if (data)
      setRows(Object.fromEntries(data.line_items.map((li) => [li.id, {
        qty: li.my_quote ? String(li.my_quote.quantity_offered) : String(li.quantity_required || ""),
        price: li.my_quote ? String(li.my_quote.unit_price) : "",
        lead: li.my_quote?.lead_time_days != null ? String(li.my_quote.lead_time_days) : "",
      }])));
  }, [data]);

  const onChange = (liId, k, v) => setRows((r) => ({ ...r, [liId]: { ...r[liId], [k]: v } }));

  const closed = data && !["Open", "Draft"].includes(data.status);
  const pastDue = data?.bid_due_date && new Date(data.bid_due_date) < new Date(new Date().toDateString());
  const disabled = closed || pastDue;

  const submit = async () => {
    const quotes = data.line_items
      .filter((li) => rows[li.id]?.price !== "" && rows[li.id]?.price != null)
      .map((li) => ({
        bid_line_item_id: li.id,
        quantity_offered: Number(rows[li.id].qty || li.quantity_required || 0),
        unit_price: Number(rows[li.id].price),
        lead_time_days: rows[li.id].lead !== "" ? Number(rows[li.id].lead) : null,
      }));
    if (quotes.length === 0) { toast.error("Enter a unit price for at least one line item"); return; }
    setSaving(true);
    try {
      const { data: res } = await api.post(`/vendor/bid-packages/${id}/quote`, { quotes });
      toast.success(`Quote submitted — total ${fmt(res.amount)}`);
      qc.invalidateQueries({ queryKey: ["vendorPackage", id] });
      qc.invalidateQueries({ queryKey: ["vendorPackages"] });
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail) || e.message);
    } finally { setSaving(false); }
  };

  return (
    <div className="p-4 sm:p-8" data-testid="vendor-bid-package-page">
      <Link to="/portal/vendor/bid-packages" className="inline-flex items-center gap-1.5 text-xs uppercase tracking-[0.15em] font-semibold text-slate-500 dark:text-slate-400 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-400 mb-4">
        <ArrowLeft size={14} strokeWidth={2.5} /> Bid Invitations
      </Link>
      {isLoading && <div className="border border-slate-200 dark:border-slate-800 p-10 text-center text-slate-500 dark:text-slate-400">Loading…</div>}
      {data && (
        <>
          <div className="flex items-end justify-between flex-wrap gap-4 mb-2">
            <h1 className="font-heading font-bold text-4xl sm:text-5xl tracking-tight leading-none" data-testid="vendor-package-title">{data.title}</h1>
            <CommitmentStatusBadge status={data.status} />
          </div>
          <div className="text-sm text-slate-500 dark:text-slate-400 mb-1">{data.scope_description}</div>
          <div className="text-xs text-slate-500 dark:text-slate-400 mb-6">
            Bids due {data.bid_due_date || "—"}
            {data.my_bid_amount != null && <span className="ml-3 text-emerald-600 dark:text-emerald-400">Your current bid: {fmt(data.my_bid_amount)}</span>}
          </div>
          {disabled && (
            <div className="border border-red-200 dark:border-red-500/30 bg-red-50 dark:bg-red-500/10/60 dark:bg-red-500/5 text-red-600 dark:text-red-400 p-4 text-sm mb-6" data-testid="bidding-closed-banner">
              Bidding is {closed ? "closed" : "past the due date"} for this package. Quotes can no longer be submitted.
            </div>
          )}
          <div className="space-y-3 max-w-4xl">
            {data.line_items.map((li) => rows[li.id] && (
              <VendorQuoteLineItemForm key={li.id} item={li} row={rows[li.id]} onChange={onChange} disabled={disabled} />
            ))}
            {data.line_items.length === 0 && (
              <div className="border border-slate-200 dark:border-slate-800 p-10 text-center text-slate-500 dark:text-slate-400">No line items defined for this package yet.</div>
            )}
          </div>
          {!disabled && data.line_items.length > 0 && (
            <Button data-testid="submit-quote-button" disabled={saving} onClick={submit}
              className="mt-6 rounded-md bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-100 text-white dark:text-slate-900 font-bold uppercase tracking-wide">
              <Send size={14} strokeWidth={2.5} /> {data.my_bid_amount != null ? "Update Quote" : "Submit Quote"}
            </Button>
          )}
        </>
      )}
    </div>
  );
}
