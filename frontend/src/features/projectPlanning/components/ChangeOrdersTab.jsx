import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, ChevronDown, ChevronUp, GitBranch, CalendarClock, FileDiff, Paperclip, FileText, FileDown, FileSpreadsheet, Info, IndianRupee } from "lucide-react";
import api, { assetUrl, formatApiErrorDetail } from "../../../api/client";
import { downloadFile } from "../utils/downloadFile";
import { useAuth } from "../../../context/AuthContext";
import { Button } from "../../../components/ui/button";
import { ChangeOrderStatusBadge } from "./ChangeOrderStatusBadge";
import { ChangeOrderFormModal } from "./ChangeOrderFormModal";

const fmt = (n) => `₹${Number(n || 0).toLocaleString("en-IN")}`;
const STATUSES = ["Draft", "Pending Client Review", "Revision Requested", "Approved", "Rejected"];
const CATEGORIES = ["Client Modification", "Rework", "Design Change", "Site Condition"];

const SummaryCell = ({ label, value, sub, accent, testId }) => (
  <div className="surface p-4" data-testid={testId}>
    <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400 font-semibold">{label}</div>
    <div className={`font-heading font-bold text-2xl mt-2 leading-none ${accent || "text-slate-900 dark:text-slate-100"}`}>{value}</div>
    {sub && <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-1.5">{sub}</div>}
  </div>
);

const ChangeOrderRow = ({ co, canDecide, canContract, canPay, onAction, onRevise, onRecordPayment }) => {
  const [open, setOpen] = useState(false);
  const decidable = ["Pending Client Review", "Revision Requested"].includes(co.status);
  const revisable = ["Draft", "Pending Client Review", "Revision Requested", "Rejected"].includes(co.status);
  return (
    <div className="surface" data-testid={`change-order-${co.id}`}>
      <div className="p-4 flex flex-wrap items-center gap-3 cursor-pointer" onClick={() => setOpen((o) => !o)} data-testid={`co-row-header-${co.id}`}>
        <span className="font-heading font-bold text-amber-600 dark:text-amber-400">{co.co_number}</span>
        <div className="flex-1 min-w-[180px]">
          <div className="font-semibold text-sm text-slate-900 dark:text-slate-100">{co.title}</div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
            {co.category}{co.phase_name ? ` · ${co.phase_name}` : ""} · by {co.requested_by} on {co.date_requested}
          </div>
        </div>
        <div className="text-right">
          <div className="font-heading font-bold text-lg text-slate-900 dark:text-slate-100">
            +{fmt(co.status === "Approved" && co.approved_cost != null ? co.approved_cost : co.estimated_cost)}
          </div>
          {co.estimated_time_impact_days > 0 && (
            <div className="text-[10px] text-slate-500 dark:text-slate-400 flex items-center gap-1 justify-end">
              <CalendarClock size={11} strokeWidth={2.5} /> +{co.estimated_time_impact_days} days
            </div>
          )}
        </div>
        <ChangeOrderStatusBadge status={co.status} />
        {co.paid_at && (
          <span className="inline-flex px-2 py-0.5 border border-emerald-400/60 text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10 text-[10px] uppercase tracking-[0.12em] font-bold" data-testid={`co-paid-badge-${co.id}`}>
            Paid
          </span>
        )}
        {co.attachments?.length > 0 && (
          <span className="flex items-center gap-0.5 text-[10px] text-slate-500 dark:text-slate-400" data-testid={`co-attach-count-${co.id}`}>
            <Paperclip size={11} strokeWidth={2.5} /> {co.attachments.length}
          </span>
        )}
        {open ? <ChevronUp size={16} className="text-slate-400" /> : <ChevronDown size={16} className="text-slate-400" />}
      </div>
      {open && (
        <div className="border-t border-slate-200 dark:border-slate-800 p-4 space-y-4" data-testid={`co-detail-${co.id}`}>
          {co.description && <p className="text-sm text-slate-600 dark:text-slate-300">{co.description}</p>}
          {co.status === "Approved" && (
            <div className="text-xs text-emerald-700 dark:text-emerald-400 font-semibold" data-testid={`co-approved-info-${co.id}`}>
              Approved by {co.approved_by} on {co.approval_date?.slice(0, 10)} at {fmt(co.approved_cost)}
            </div>
          )}
          {co.attachments?.length > 0 && (
            <div>
              <div className="text-[10px] uppercase tracking-[0.15em] text-slate-500 dark:text-slate-400 font-semibold mb-1.5 flex items-center gap-1.5">
                <Paperclip size={11} strokeWidth={2.5} /> Photos & Drawings · {co.attachments.length}
              </div>
              <div className="flex flex-wrap gap-2" data-testid={`co-attachments-${co.id}`}>
                {co.attachments.map((a, i) => (
                  <a key={i} href={assetUrl(a.url)} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}
                    data-testid={`co-attachment-${co.id}-${i}`} title={a.filename}>
                    {/\.pdf$/i.test(a.url || "") ? (
                      <div className="w-24 h-20 border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 flex flex-col items-center justify-center gap-1 hover:border-blue-400 transition-colors">
                        <FileText size={20} className="text-red-500" />
                        <span className="text-[9px] text-slate-500 dark:text-slate-400 px-1 truncate w-full text-center">{a.filename || "Document"}</span>
                      </div>
                    ) : (
                      <img src={assetUrl(a.url)} alt={a.filename || "attachment"}
                        className="w-24 h-20 object-cover border border-slate-200 dark:border-slate-700 hover:border-blue-400 transition-colors" />
                    )}
                  </a>
                ))}
              </div>
            </div>
          )}
          {co.revisions?.length > 0 && (
            <div>
              <div className="text-[10px] uppercase tracking-[0.15em] text-slate-500 dark:text-slate-400 font-semibold mb-1.5 flex items-center gap-1.5">
                <GitBranch size={11} strokeWidth={2.5} /> Estimate History
              </div>
              <div className="space-y-1">
                {co.revisions.map((r) => (
                  <div key={r.version} className="flex flex-wrap items-center gap-3 text-xs border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-3 py-1.5" data-testid={`co-revision-${co.id}-v${r.version}`}>
                    <span className="font-bold text-slate-700 dark:text-slate-300">v{r.version}</span>
                    <span className="font-semibold">{fmt(r.estimated_cost)}</span>
                    <span className="text-slate-500 dark:text-slate-400">+{r.estimated_time_impact_days}d</span>
                    {r.note && <span className="text-slate-500 dark:text-slate-400 italic">"{r.note}"</span>}
                    <span className="ml-auto text-slate-400 dark:text-slate-500">{r.by} · {r.at?.slice(0, 10)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {co.events?.length > 0 && (
            <div>
              <div className="text-[10px] uppercase tracking-[0.15em] text-slate-500 dark:text-slate-400 font-semibold mb-1.5">Activity</div>
              <div className="space-y-1">
                {co.events.map((e, i) => (
                  <div key={i} className="text-xs text-slate-500 dark:text-slate-400" data-testid={`co-event-${co.id}-${i}`}>
                    <span className="text-slate-700 dark:text-slate-300 font-semibold">{e.by}</span> — {e.action}
                    {e.comment && <span className="italic">: "{e.comment}"</span>}
                    <span className="ml-1.5 text-slate-400 dark:text-slate-500">{e.at?.slice(0, 16).replace("T", " ")}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className="flex flex-wrap gap-2 pt-1">
            {canDecide && decidable && (
              <>
                <Button size="sm" data-testid={`co-approve-btn-${co.id}`} onClick={() => onAction(co, "approve")}
                  className="rounded-md bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold uppercase tracking-wide h-8">Approve</Button>
                <Button size="sm" variant="outline" data-testid={`co-reject-btn-${co.id}`} onClick={() => onAction(co, "reject")}
                  className="rounded-md border-red-400/60 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 text-xs font-bold uppercase tracking-wide h-8">Reject</Button>
                {co.status === "Pending Client Review" && (
                  <Button size="sm" variant="outline" data-testid={`co-request-revision-btn-${co.id}`} onClick={() => onAction(co, "request-revision")}
                    className="rounded-md border-sky-400/60 text-sky-600 dark:text-sky-400 hover:bg-sky-50 dark:hover:bg-sky-500/10 text-xs font-bold uppercase tracking-wide h-8">Request Revision</Button>
                )}
              </>
            )}
            {canPay && co.status === "Approved" && !co.paid_at && (
              <Button size="sm" data-testid={`co-record-payment-${co.id}`} onClick={() => onRecordPayment(co)}
                className="rounded-md bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-100 text-white dark:text-slate-900 text-xs font-bold uppercase tracking-wide h-8">
                <IndianRupee size={12} strokeWidth={2.5} /> Record Payment
              </Button>
            )}
            {canContract && revisable && (
              <Button size="sm" variant="outline" data-testid={`co-revise-btn-${co.id}`} onClick={() => onRevise(co)}
                className="rounded-md border-slate-300 dark:border-slate-700 hover:border-blue-400 text-xs font-bold uppercase tracking-wide h-8">
                {co.status === "Draft" ? "Submit for Review" : "Revise Estimate"}
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export const ChangeOrdersTab = ({ projectId, phases }) => {
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [phaseFilter, setPhaseFilter] = useState("");
  const [modal, setModal] = useState({ open: false, co: null });
  const { user } = useAuth();
  const role = user?.role;
  const { data } = useQuery({
    queryKey: ["changeOrders", projectId, statusFilter, categoryFilter, phaseFilter],
    queryFn: () => api.get(`/projects/${projectId}/change-orders`, {
      params: { ...(statusFilter && { status: statusFilter }), ...(categoryFilter && { category: categoryFilter }), ...(phaseFilter && { phase_id: phaseFilter }) },
    }).then((r) => r.data),
  });

  const canContract = ["Admin", "SiteEngineer"].includes(role);
  const canDecide = ["Client", "Admin"].includes(role);
  const canPay = ["Admin", "Accountant"].includes(role);
  const refresh = () => ["changeOrders", "projFinance", "projectBalanceSheet", "notifications"].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));

  const onRecordPayment = async (co) => {
    const amtStr = window.prompt(
      `Record client payment for ${co.co_number} — "${co.title}".\nThe amount will be credited to the project balance sheet and a receipt emailed to the client.\n\nAmount (₹):`,
      co.approved_cost ?? co.estimated_cost);
    if (amtStr === null) return;
    const amt = Number(amtStr);
    if (!(amt > 0)) { toast.error("Enter a valid amount greater than 0"); return; }
    try {
      const r = await api.post(`/change-orders/${co.id}/record-payment`, { amount: amt });
      toast.success(r.data.receipt_sent
        ? `Payment recorded — receipt emailed to ${r.data.receipt_to}`
        : `Payment recorded and credited to the balance sheet${r.data.receipt_to ? " (receipt email failed — check SMTP settings)" : ""}`);
      refresh();
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail) || e.message);
    }
  };

  const onAction = async (co, action) => {
    let comment = null;
    if (action === "approve") {
      if (!window.confirm(`Approve ${co.co_number} — "${co.title}" at ${fmt(co.estimated_cost)}?\n\nThis amount will be added to the project's contract value and financial ledger.`)) return;
    } else if (action === "reject") {
      comment = window.prompt(`Reject ${co.co_number}? Add an optional reason:`) ;
      if (comment === null) return;
    } else {
      comment = window.prompt(`What should be revised in ${co.co_number}? (required)`);
      if (!comment || !comment.trim()) return;
    }
    try {
      await api.post(`/change-orders/${co.id}/${action}`, { comment: comment || null, confirm: true });
      toast.success(action === "approve" ? `${co.co_number} approved` : action === "reject" ? `${co.co_number} rejected` : "Revision requested");
      refresh();
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail) || e.message);
    }
  };

  const s = data?.summary;
  const filterCls = "bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-md h-9 text-sm text-slate-700 dark:text-slate-300 px-2";
  const exportParams = () => {
    const p = new URLSearchParams();
    if (statusFilter) p.set("status", statusFilter);
    if (categoryFilter) p.set("category", categoryFilter);
    if (phaseFilter) p.set("phase_id", phaseFilter);
    const qs = p.toString();
    return qs ? `&${qs}` : "";
  };
  const exportCOs = (fmt) =>
    downloadFile(`/projects/${projectId}/change-orders/export?fmt=${fmt}${exportParams()}`, `change-orders.${fmt === "pdf" ? "pdf" : "xlsx"}`)
      .catch(() => toast.error("Export failed"));

  return (
    <div data-testid="change-orders-tab">
      {s && s.approved_count > 0 && (
        <div className="border border-amber-300 dark:border-amber-500/40 bg-amber-50 dark:bg-amber-500/10 p-4 mb-5 flex items-start gap-3" data-testid="co-impact-banner">
          <Info size={16} strokeWidth={2.5} className="text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
          <p className="text-sm text-amber-800 dark:text-amber-300">
            Your project cost has increased by <span className="font-bold">{fmt(s.approved_variations)}</span> ({s.increase_pct}%) due to <span className="font-bold">{s.approved_count}</span> approved modification{s.approved_count !== 1 ? "s" : ""}.
            Revised contract value: <span className="font-bold">{fmt(s.revised_contract_value)}</span>.
          </p>
        </div>
      )}
      {s && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <SummaryCell label="Original Contract" value={fmt(s.original_budget)} testId="co-sum-original" />
          <SummaryCell label="Approved Variations" value={`+${fmt(s.approved_variations)}`}
            sub={`${s.approved_count} approved · +${s.increase_pct}% of contract`} accent="text-amber-600 dark:text-amber-400" testId="co-sum-approved" />
          <SummaryCell label="Revised Contract Value" value={fmt(s.revised_contract_value)} accent="text-blue-600 dark:text-blue-400" testId="co-sum-revised" />
          <SummaryCell label="Pending Review" value={fmt(s.pending_co_value)} accent="text-sky-600 dark:text-sky-400" testId="co-sum-pending" />
        </div>
      )}
      <div className="flex flex-wrap items-center gap-3 mb-5">
        <div className="text-[11px] uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400 font-semibold flex items-center gap-1.5">
          <FileDiff size={13} strokeWidth={2.5} /> Change Orders · {data?.change_orders?.length ?? 0}
        </div>
        <div className="ml-auto flex flex-wrap gap-2">
          <select data-testid="co-phase-filter" value={phaseFilter} onChange={(e) => setPhaseFilter(e.target.value)} className={filterCls}>
            <option value="">All phases</option>
            {(phases || []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <select data-testid="co-status-filter" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={filterCls}>
            <option value="">All statuses</option>
            {STATUSES.map((st) => <option key={st} value={st}>{st}</option>)}
          </select>
          <select data-testid="co-category-filter" value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} className={filterCls}>
            <option value="">All categories</option>
            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <button data-testid="co-export-pdf" title="Export PDF (respects filters)" onClick={() => exportCOs("pdf")}
            className="flex items-center gap-1.5 border border-slate-300 dark:border-slate-700 px-2.5 h-9 text-[10px] uppercase tracking-[0.12em] font-semibold text-slate-600 dark:text-slate-400 hover:border-blue-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
            <FileDown size={13} strokeWidth={2.5} /> PDF
          </button>
          <button data-testid="co-export-excel" title="Export Excel (respects filters)" onClick={() => exportCOs("xlsx")}
            className="flex items-center gap-1.5 border border-slate-300 dark:border-slate-700 px-2.5 h-9 text-[10px] uppercase tracking-[0.12em] font-semibold text-slate-600 dark:text-slate-400 hover:border-emerald-400 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors">
            <FileSpreadsheet size={13} strokeWidth={2.5} /> Excel
          </button>
          {canContract && (
            <Button data-testid="new-change-order-button" size="sm" onClick={() => setModal({ open: true, co: null })}
              className="rounded-md bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-100 text-white dark:text-slate-900 font-bold uppercase tracking-[0.12em] h-9">
              <Plus size={14} strokeWidth={3} /> New Change Order
            </Button>
          )}
        </div>
      </div>
      <div className="space-y-3">
        {(data?.change_orders || []).map((co) => (
          <ChangeOrderRow key={co.id} co={co} canDecide={canDecide} canContract={canContract} canPay={canPay}
            onAction={onAction} onRevise={(c) => setModal({ open: true, co: c })} onRecordPayment={onRecordPayment} />
        ))}
        {data && data.change_orders.length === 0 && (
          <div className="border border-slate-200 dark:border-slate-800 p-10 text-center text-xs text-slate-500 dark:text-slate-400" data-testid="change-orders-empty">
            No change orders {statusFilter || categoryFilter || phaseFilter ? "match the selected filters" : "yet — client modifications and scope variations will appear here, separate from the base contract"}.
          </div>
        )}
      </div>
      <ChangeOrderFormModal open={modal.open} onOpenChange={(o) => setModal({ open: o, co: o ? modal.co : null })}
        projectId={projectId} phases={phases} co={modal.co} />
    </div>
  );
};
