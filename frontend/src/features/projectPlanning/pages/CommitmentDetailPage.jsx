import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeft, Plus } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../../components/ui/tabs";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { Skeleton } from "../../../components/ui/skeleton";
import { CommitmentStatusBadge } from "../components/CommitmentStatusBadge";
import { ChangeOrderCard } from "../components/ChangeOrderCard";
import { LineItemTable } from "../components/LineItemTable";
import { LienWaiverRow } from "../components/LienWaiverRow";
import { ProcurementDocumentsPanel } from "../components/ProcurementDocumentsPanel";
import { useCommitment, useChangeOrders, usePayApps, useProcMutation } from "../hooks/useProcurement";
import { useAuth } from "../../../context/AuthContext";
import { formatApiErrorDetail } from "../../../api/client";

const fmt = (n) => `₹${Number(n || 0).toLocaleString("en-IN")}`;

const Cell = ({ label, value, testId }) => (
  <div className="surface p-4" data-testid={testId}>
    <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400 font-semibold">{label}</div>
    <div className="font-heading font-semibold text-lg mt-1.5 leading-none text-slate-900 dark:text-slate-100">{value ?? "—"}</div>
  </div>
);

export default function CommitmentDetailPage() {
  const { id, type, commitmentId } = useParams();
  const { isAdmin, canWrite } = useAuth();
  const { data: c, isLoading } = useCommitment(type, commitmentId);
  const { data: cos } = useChangeOrders(type, commitmentId);
  const { data: payApps } = usePayApps(type, commitmentId);
  const mut = useProcMutation(type, commitmentId, id);
  const [coForm, setCoForm] = useState({ reason: "", amount: "" });
  const [paForm, setPaForm] = useState({ amount_this_period: "" });

  const act = async (call, ok) => {
    try { await mut.mutateAsync(call); toast.success(ok); }
    catch (e) { toast.error(formatApiErrorDetail(e.response?.data?.detail) || e.message); }
  };

  if (isLoading || !c)
    return <div className="p-4 sm:p-8"><Skeleton className="h-16 bg-slate-200 dark:bg-slate-800 rounded-md w-1/2" /></div>;

  const base = type === "po" ? `/purchase-orders/${commitmentId}` : `/subcontracts/${commitmentId}`;

  return (
    <div className="p-4 sm:p-8" data-testid="commitment-detail-page">
      <Link to={`/admin/projects/${id}/procurement`} data-testid="back-to-procurement" className="inline-flex items-center gap-1.5 text-xs uppercase tracking-[0.15em] font-semibold text-slate-500 dark:text-slate-400 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-400 transition-colors mb-4">
        <ArrowLeft size={14} strokeWidth={2.5} /> Procurement
      </Link>
      <div className="flex flex-wrap items-center gap-3 mb-2">
        <h1 className="font-heading font-bold text-4xl uppercase leading-none" data-testid="commitment-title">{c.number}</h1>
        <CommitmentStatusBadge status={c.status} />
        {c.pending_approval && <span className="text-[11px] uppercase tracking-wide text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10 px-2 py-0.5 font-semibold">Pending Items</span>}
      </div>
      <div className="text-sm text-slate-500 dark:text-slate-400 mb-6">{c.vendor_name} · {type === "po" ? "Purchase Order" : "Subcontract"} · Cost code {c.cost_code || "—"}</div>

      <Tabs defaultValue="overview">
        <TabsList className="tab-strip w-fit h-auto justify-start mb-4 bg-slate-100 dark:bg-slate-900/60">
          {["overview", "change-orders", "pay-apps", "documents"].map((t) => (
            <TabsTrigger key={t} value={t} data-testid={`ctab-${t}`}
              className="rounded-md px-4 py-2 text-[11px] uppercase tracking-[0.15em] font-semibold text-slate-500 dark:text-slate-400 data-[state=active]:text-slate-900 dark:data-[state=active]:text-slate-100 transition-colors whitespace-nowrap">
              {t.replace("-", " ")}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="overview" className="mt-6 space-y-6" data-testid="ctab-overview-content">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Cell label="Vendor" value={c.vendor_name} testId="cd-vendor" />
            <Cell label="Original Amount" value={fmt(c.original_amount)} testId="cd-original" />
            <Cell label="Committed (Revised)" value={fmt(c.committed_amount)} testId="cd-committed" />
            <Cell label="Change Orders" value={fmt(c.change_orders_total)} testId="cd-cos" />
            {type === "subcontract" && <Cell label="Retainage %" value={`${c.retainage_pct}%`} testId="cd-retainage" />}
            <Cell label={type === "po" ? "Issue Date" : "Start Date"} value={type === "po" ? c.issue_date : c.start_date} testId="cd-date1" />
            <Cell label={type === "po" ? "Expected Delivery" : "End Date"} value={type === "po" ? c.expected_delivery_date : c.end_date} testId="cd-date2" />
            {c.vendor && <Cell label="Vendor Insurance" value={c.vendor.insurance_current ? `Valid to ${c.vendor.insurance_expiry}` : "EXPIRED"} testId="cd-insurance" />}
          </div>
          {isAdmin && (
            <div className="flex gap-3 flex-wrap">
              {type === "po" && c.status !== "Approved" && c.status !== "Cancelled" && (
                <Button data-testid="approve-commitment" onClick={() => act({ url: `${base}/approve` }, "PO approved")}
                  className="rounded-md bg-green-600 hover:bg-green-700 text-slate-900 dark:text-slate-100 font-bold uppercase tracking-wide">Approve PO</Button>
              )}
              {type === "subcontract" && c.status !== "Executed" && (
                <>
                  <Button data-testid="approve-commitment" onClick={() => act({ url: `${base}/approve` }, "Subcontract approved")}
                    className="rounded-md bg-green-600 hover:bg-green-700 text-slate-900 dark:text-slate-100 font-bold uppercase tracking-wide">Approve</Button>
                  <Button data-testid="execute-commitment" onClick={() => act({ url: `${base}/execute` }, "Subcontract executed")}
                    className="rounded-md bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-100 text-white dark:text-slate-900 font-bold uppercase tracking-wide">Execute</Button>
                </>
              )}
              {type === "po" && c.status !== "Cancelled" && (
                <Button variant="outline" data-testid="cancel-commitment" onClick={() => act({ url: `${base}/cancel` }, "PO cancelled")}
                  className="rounded-md border-red-500/50 text-red-600 dark:text-red-400 hover:bg-red-50 dark:bg-red-500/10 dark:hover:bg-red-500/10 uppercase tracking-wide">Cancel</Button>
              )}
            </div>
          )}
          {type === "po" && (
            <div>
              <div className="text-[11px] uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400 font-semibold mb-3">PO Line Items</div>
              <LineItemTable testId="po-line-items" items={c.line_items} canWrite={canWrite}
                columns={[
                  { key: "item_description", label: "Description" }, { key: "unit", label: "Unit" },
                  { key: "quantity", label: "Qty", num: true }, { key: "unit_price", label: "Unit Price", money: true },
                  { key: "line_total", label: "Total", money: true }, { key: "received_quantity", label: "Received", num: true }]}
                addFields={["item_description", "unit", "quantity", "unit_price"]}
                onAdd={(d) => act({ url: `${base}/line-items`, data: { item_description: d.item_description || "", unit: d.unit, quantity: Number(d.quantity || 0), unit_price: Number(d.unit_price || 0) } }, "Line item added")}
                onDelete={(liId) => act({ method: "delete", url: `/po-line-items/${liId}` }, "Line item removed")} />
            </div>
          )}
        </TabsContent>

        <TabsContent value="change-orders" className="mt-6 space-y-4" data-testid="ctab-cos-content">
          {canWrite && (
            <div className="surface p-4 flex flex-wrap items-end gap-3">
              <div className="flex-1 min-w-[220px]">
                <div className="text-[10px] uppercase tracking-[0.15em] text-slate-500 dark:text-slate-400 mb-1">Reason</div>
                <Input data-testid="co-reason-input" value={coForm.reason} onChange={(e) => setCoForm({ ...coForm, reason: e.target.value })}
                  className="bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 rounded-md h-9" />
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-[0.15em] text-slate-500 dark:text-slate-400 mb-1">Amount (₹, +/−)</div>
                <Input data-testid="co-amount-input" type="number" value={coForm.amount} onChange={(e) => setCoForm({ ...coForm, amount: e.target.value })}
                  className="bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 rounded-md h-9 w-40" />
              </div>
              <Button data-testid="co-submit" disabled={!coForm.reason.trim() || !coForm.amount}
                onClick={async () => { await act({ url: `/commitments/${type}/${commitmentId}/change-orders`, data: { reason: coForm.reason.trim(), amount: Number(coForm.amount) } }, "Change order created"); setCoForm({ reason: "", amount: "" }); }}
                className="rounded-md bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-100 text-white dark:text-slate-900 font-bold uppercase tracking-wide h-9">
                <Plus size={14} strokeWidth={3} /> New CO
              </Button>
            </div>
          )}
          {(cos || []).map((co) => (
            <ChangeOrderCard key={co.id} co={co} isAdmin={isAdmin}
              onDecide={(co2, status) => act({ method: "patch", url: `/change-orders/${co2.id}`, data: { status } }, `Change order ${status.toLowerCase()}`)} />
          ))}
          {(!cos || cos.length === 0) && <div className="border border-slate-200 dark:border-slate-800 p-8 text-center text-xs text-slate-500 dark:text-slate-400" data-testid="cos-empty">No change orders.</div>}
        </TabsContent>

        <TabsContent value="pay-apps" className="mt-6 space-y-4" data-testid="ctab-payapps-content">
          {canWrite && (
            <div className="surface p-4 flex flex-wrap items-end gap-3">
              <div>
                <div className="text-[10px] uppercase tracking-[0.15em] text-slate-500 dark:text-slate-400 mb-1">Amount this period (₹)</div>
                <Input data-testid="payapp-amount-input" type="number" value={paForm.amount_this_period}
                  onChange={(e) => setPaForm({ amount_this_period: e.target.value })}
                  className="bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 rounded-md h-9 w-48" />
              </div>
              <Button data-testid="payapp-create" disabled={!paForm.amount_this_period}
                onClick={async () => { await act({ url: `/commitments/${type}/${commitmentId}/pay-applications`, data: { amount_this_period: Number(paForm.amount_this_period) } }, "Pay application created"); setPaForm({ amount_this_period: "" }); }}
                className="rounded-md bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-100 text-white dark:text-slate-900 font-bold uppercase tracking-wide h-9">
                <Plus size={14} strokeWidth={3} /> New Pay App
              </Button>
              {type === "subcontract" && <span className="text-[11px] text-slate-500 dark:text-slate-400">Retainage {c.retainage_pct}% is withheld automatically</span>}
            </div>
          )}
          {(payApps || []).map((pa) => (
            <div key={pa.id} className="surface p-5 space-y-4" data-testid={`payapp-card-${pa.id}`}>
              <div className="flex flex-wrap items-center gap-3">
                <span className="font-heading font-bold text-xl text-blue-600 dark:text-blue-400">App #{pa.application_number}</span>
                <CommitmentStatusBadge status={pa.status} />
                <div className="ml-auto flex gap-2">
                  {canWrite && pa.status === "Draft" && (
                    <Button size="sm" data-testid={`payapp-submit-${pa.id}`} onClick={() => act({ url: `/pay-applications/${pa.id}/submit` }, "Pay app submitted")}
                      className="rounded-md bg-sky-600 hover:bg-sky-700 text-slate-900 dark:text-slate-100 text-xs uppercase h-8">Submit</Button>
                  )}
                  {isAdmin && ["Submitted", "UnderReview"].includes(pa.status) && (
                    <Button size="sm" data-testid={`payapp-approve-${pa.id}`} onClick={() => act({ url: `/pay-applications/${pa.id}/approve` }, "Pay app approved")}
                      className="rounded-md bg-green-600 hover:bg-green-700 text-slate-900 dark:text-slate-100 text-xs uppercase h-8">Approve</Button>
                  )}
                  {isAdmin && pa.status === "Approved" && (
                    <Button size="sm" data-testid={`payapp-paid-${pa.id}`} onClick={() => act({ url: `/pay-applications/${pa.id}/mark-paid` }, "Marked paid")}
                      className="rounded-md bg-green-700 hover:bg-green-800 text-slate-900 dark:text-slate-100 text-xs uppercase h-8">Mark Paid</Button>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3 text-sm">
                <div><span className="text-[10px] uppercase tracking-wide text-slate-500 dark:text-slate-400 block">This Period</span><span className="font-semibold text-slate-900 dark:text-slate-100">{fmt(pa.amount_this_period)}</span></div>
                <div><span className="text-[10px] uppercase tracking-wide text-slate-500 dark:text-slate-400 block">Retainage Held</span><span className="font-semibold text-amber-600 dark:text-amber-400" data-testid={`payapp-retainage-${pa.id}`}>{fmt(pa.retainage_held)}</span></div>
                <div><span className="text-[10px] uppercase tracking-wide text-slate-500 dark:text-slate-400 block">Amount Due</span><span className="font-semibold text-emerald-600 dark:text-emerald-400">{fmt(pa.amount_due)}</span></div>
              </div>
              <LineItemTable testId={`payapp-lines-${pa.id}`} items={pa.line_items} canWrite={canWrite && pa.status === "Draft"}
                columns={[
                  { key: "description", label: "Description" }, { key: "scheduled_value", label: "Scheduled", money: true },
                  { key: "previous_completed", label: "Previous", money: true }, { key: "this_period", label: "This Period", money: true },
                  { key: "materials_stored", label: "Stored", money: true }, { key: "pct_complete", label: "% Comp", pct: true }]}
                addFields={["description", "scheduled_value", "previous_completed", "this_period", "materials_stored"]}
                onAdd={(d) => act({ url: `/pay-applications/${pa.id}/line-items`, data: { description: d.description || "", scheduled_value: Number(d.scheduled_value || 0), previous_completed: Number(d.previous_completed || 0), this_period: Number(d.this_period || 0), materials_stored: Number(d.materials_stored || 0) } }, "Line added")} />
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400 font-semibold">Lien Waivers</span>
                  {canWrite && (
                    <button data-testid={`waiver-add-${pa.id}`}
                      onClick={() => act({ url: `/pay-applications/${pa.id}/lien-waivers`, data: { waiver_type: "ConditionalProgress", amount: pa.amount_due } }, "Lien waiver added")}
                      className="text-[10px] uppercase tracking-wide font-bold text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300">+ Add Waiver</button>
                  )}
                </div>
                {(pa.lien_waivers || []).map((w) => (
                  <LienWaiverRow key={w.id} waiver={w} canWrite={canWrite}
                    onUploaded={() => act({ method: "get", url: `/pay-applications/${pa.id}` }, "Waiver updated")} />
                ))}
              </div>
            </div>
          ))}
          {(!payApps || payApps.length === 0) && <div className="border border-slate-200 dark:border-slate-800 p-8 text-center text-xs text-slate-500 dark:text-slate-400" data-testid="payapps-empty">No pay applications.</div>}
        </TabsContent>

        <TabsContent value="documents" className="mt-6" data-testid="ctab-documents-content">
          <ProcurementDocumentsPanel type={type} id={commitmentId} canWrite={canWrite} isAdmin={isAdmin} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
