import { useState } from "react";
import { useParams, useSearchParams, Link, useNavigate } from "react-router-dom";
import { Wallet, PackageOpen, Hourglass, Scale, ArrowLeft, AlertTriangle } from "lucide-react";
import { DashboardStatCard } from "../components/DashboardStatCard";
import { CommitmentStatusBadge } from "../components/CommitmentStatusBadge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../../../components/ui/dialog";
import { Skeleton } from "../../../components/ui/skeleton";
import { useProcSummary, useCommitments, useBudgetBreakdownProc } from "../hooks/useProcurement";
import { useProject } from "../hooks/useProjects";
import { QuotationsSection } from "../components/QuotationsSection";

const fmtCr = (n) => `${n < 0 ? "−" : ""}₹${Math.abs(n || 0).toLocaleString("en-IN")}`;

export default function ProcurementDashboardPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [budgetOpen, setBudgetOpen] = useState(false);
  const { data: project } = useProject(Number(id));
  const { data: summary } = useProcSummary(id);
  const { data: breakdown } = useBudgetBreakdownProc(id, budgetOpen);

  const filters = {};
  ["type", "status", "pending_approval", "vendor_id", "cost_code", "over_budget"].forEach((k) => {
    if (params.get(k)) filters[k] = params.get(k);
  });
  const { data, isLoading } = useCommitments(id, filters);

  const openPosActive = params.get("type") === "po" && params.get("status") === "open";
  const pendingActive = params.get("pending_approval") === "true";
  const totalActive = !params.get("type") && !params.get("status") && !params.get("pending_approval");

  const clickTotal = () => setParams(new URLSearchParams());
  const clickOpenPos = () => {
    const n = new URLSearchParams();
    if (!openPosActive) { n.set("type", "po"); n.set("status", "open"); }
    setParams(n);
  };
  const clickPending = () => {
    const n = new URLSearchParams();
    if (!pendingActive) n.set("pending_approval", "true");
    setParams(n);
  };

  const negVariance = (summary?.budget_variance ?? 0) < 0;

  return (
    <div className="p-4 sm:p-8" data-testid="procurement-dashboard-page">
      <Link to={`/admin/projects/${id}`} data-testid="back-to-project" className="inline-flex items-center gap-1.5 text-xs uppercase tracking-[0.15em] font-semibold text-slate-500 dark:text-slate-400 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-400 transition-colors mb-4">
        <ArrowLeft size={14} strokeWidth={2.5} /> {project?.name || "Project"}
      </Link>
      <div className="mb-8">
        <div className="text-blue-600 dark:text-blue-400 text-[11px] uppercase tracking-[0.3em] font-semibold mb-1">Procurement</div>
        <h1 className="font-heading font-bold text-4xl sm:text-5xl tracking-tight leading-none">Commitments</h1>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6" data-testid="proc-stat-cards">
        <DashboardStatCard label="Total Committed" value={summary ? fmtCr(summary.total_committed) : "—"}
          icon={Wallet} isActive={totalActive} onClick={clickTotal} variant="default" testId="proc-card-total" />
        <DashboardStatCard label="Open POs" value={summary?.open_pos ?? "—"}
          icon={PackageOpen} isActive={openPosActive} onClick={clickOpenPos} variant="info" testId="proc-card-open-pos" />
        <DashboardStatCard label="Pending Approvals" value={summary?.pending_approvals ?? "—"}
          icon={Hourglass} isActive={pendingActive} onClick={clickPending} variant="warning" testId="proc-card-pending" />
        <DashboardStatCard label="Budget Variance" value={summary ? fmtCr(summary.budget_variance) : "—"}
          icon={Scale} isActive={budgetOpen} onClick={() => setBudgetOpen(true)}
          variant={negVariance ? "warning" : "info"} testId="proc-card-variance" />
      </div>

      {summary?.expiring_insurance > 0 && (
        <div className="flex items-center gap-2 border border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400 px-4 py-2.5 text-xs mb-5" data-testid="insurance-warning">
          <AlertTriangle size={14} strokeWidth={2.5} />
          {summary.expiring_insurance} vendor{summary.expiring_insurance > 1 ? "s" : ""} with expiring or expired insurance on this project
        </div>
      )}

      {isLoading ? (
        <div className="space-y-2">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-14 bg-white dark:bg-slate-900 rounded-md" />)}</div>
      ) : !data?.items?.length ? (
        <div className="surface p-12 text-center text-slate-500 dark:text-slate-400" data-testid="commitments-empty">No commitments found.</div>
      ) : (
        <div className="border border-slate-200 dark:border-slate-800 overflow-x-auto" data-testid="commitments-table">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-white dark:bg-slate-900 text-left text-[11px] uppercase tracking-[0.15em] text-slate-500 dark:text-slate-400">
                {["Vendor", "Type", "Cost Code", "Original", "COs", "Committed", "Status", ""].map((h, i) => (
                  <th key={i} className="px-4 py-3 font-semibold">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.items.map((c) => (
                <tr key={`${c.type}-${c.id}`} data-testid={`commitment-row-${c.type}-${c.id}`}
                  onClick={() => navigate(`/admin/projects/${id}/procurement/${c.type}/${c.id}`)}
                  className="border-t border-slate-200 dark:border-slate-800 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                  <td className="px-4 py-3.5">
                    <div className="font-semibold text-slate-900 dark:text-slate-100">{c.vendor_name}</div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">{c.number}</div>
                  </td>
                  <td className="px-4 py-3.5 text-slate-600 dark:text-slate-400 uppercase text-xs tracking-wide">{c.type === "po" ? "PO" : "Subcontract"}</td>
                  <td className="px-4 py-3.5 text-slate-600 dark:text-slate-400">{c.cost_code || "—"}</td>
                  <td className="px-4 py-3.5 text-slate-600 dark:text-slate-400">{fmtCr(c.original_amount)}</td>
                  <td className={`px-4 py-3.5 ${c.change_orders_total ? "text-blue-600 dark:text-blue-400" : "text-slate-500 dark:text-slate-400"}`}>
                    {c.change_orders_total ? fmtCr(c.change_orders_total) : "—"}
                  </td>
                  <td className="px-4 py-3.5 font-semibold text-slate-900 dark:text-slate-100">{fmtCr(c.committed_amount)}</td>
                  <td className="px-4 py-3.5"><CommitmentStatusBadge status={c.status} /></td>
                  <td className="px-4 py-3.5">
                    <div className="flex gap-1.5">
                      {c.pending_approval && <Hourglass size={14} strokeWidth={2.5} className="text-amber-600 dark:text-amber-400" data-testid={`pending-flag-${c.type}-${c.id}`} />}
                      {c.over_budget && <AlertTriangle size={14} strokeWidth={2.5} className="text-red-500" data-testid={`overbudget-flag-${c.type}-${c.id}`} />}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <QuotationsSection projectId={id} />

      <Dialog open={budgetOpen} onOpenChange={setBudgetOpen}>
        <DialogContent className="bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 rounded-md max-w-lg" data-testid="variance-breakdown-dialog">
          <DialogHeader>
            <DialogTitle className="font-heading text-2xl uppercase tracking-wide">Cost Code Variance</DialogTitle>
          </DialogHeader>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-[0.15em] text-slate-500 dark:text-slate-400 border-b border-slate-300 dark:border-slate-700">
                <th className="py-2 font-semibold">Cost Code</th>
                <th className="py-2 font-semibold text-right">Allocated</th>
                <th className="py-2 font-semibold text-right">Committed</th>
                <th className="py-2 font-semibold text-right">Variance</th>
              </tr>
            </thead>
            <tbody>
              {(breakdown || []).map((b) => (
                <tr key={b.cost_code} className="border-b border-slate-200 dark:border-slate-800" data-testid={`variance-row-${b.cost_code}`}>
                  <td className="py-2.5 text-slate-900 dark:text-slate-100 font-medium">{b.cost_code}</td>
                  <td className="py-2.5 text-right text-slate-500 dark:text-slate-400">{fmtCr(b.allocated)}</td>
                  <td className="py-2.5 text-right text-slate-600 dark:text-slate-400">{fmtCr(b.committed)}</td>
                  <td className={`py-2.5 text-right font-semibold ${b.variance < 0 ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400"}`}>{fmtCr(b.variance)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </DialogContent>
      </Dialog>
    </div>
  );
}
