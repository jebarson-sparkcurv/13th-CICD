import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { TrendingUp, TrendingDown, IndianRupee, AlertTriangle, Users, FileDown, FileSpreadsheet } from "lucide-react";
import api from "../../../api/client";
import { downloadFile } from "../utils/downloadFile";

const fmt = (n) => `₹${Math.round(Number(n || 0)).toLocaleString("en-IN")}`;
const fmtCr = (n) => `${n < 0 ? "−" : ""}₹${Math.abs(Math.round(Number(n || 0))).toLocaleString("en-IN")}`;

const StatCard = ({ label, value, icon: Icon, accent, testId }) => (
  <div className="stat-card surface surface-hover p-5" data-testid={testId}>
    <div className="flex items-center justify-between">
      <span className="text-[10px] uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400 font-semibold">{label}</span>
      <div className={`w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800/60 flex items-center justify-center ${accent}`}>
        <Icon size={15} strokeWidth={2.25} />
      </div>
    </div>
    <div className={`stat-value mt-4 ${accent}`}>{value}</div>
  </div>
);

export const OrgBalanceSheetTab = () => {
  const { data: bs } = useQuery({
    queryKey: ["orgBalanceSheet"],
    queryFn: () => api.get("/finance/balance-sheet").then((r) => r.data),
  });

  if (!bs) return <div className="border border-slate-200 dark:border-slate-800 p-8 text-center text-xs text-slate-500 dark:text-slate-400">Loading balance sheet…</div>;
  const dues = bs.employee_dues;

  return (
    <div data-testid="org-balance-sheet">
      <div className="flex justify-end gap-2 mb-4">
        <button data-testid="bs-export-pdf" onClick={() => downloadFile("/finance/balance-sheet/export?fmt=pdf", "buildcore-balance-sheet.pdf").catch(() => toast.error("Export failed"))}
          className="flex items-center gap-2 border border-slate-300 dark:border-slate-700 px-3 py-2 text-[11px] uppercase tracking-[0.15em] font-semibold text-slate-600 dark:text-slate-400 hover:border-blue-400 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-400 transition-colors">
          <FileDown size={14} strokeWidth={2.5} /> Export PDF
        </button>
        <button data-testid="bs-export-excel" onClick={() => downloadFile("/finance/balance-sheet/export?fmt=xlsx", "buildcore-balance-sheet.xlsx").catch(() => toast.error("Export failed"))}
          className="flex items-center gap-2 border border-slate-300 dark:border-slate-700 px-3 py-2 text-[11px] uppercase tracking-[0.15em] font-semibold text-slate-600 dark:text-slate-400 hover:border-emerald-400 hover:text-emerald-600 dark:text-emerald-400 dark:hover:text-emerald-400 transition-colors">
          <FileSpreadsheet size={14} strokeWidth={2.5} /> Export Excel
        </button>
      </div>
      <div className="kpi-scroller mb-6" style={{ ["--kpi-cols"]: 2, ["--kpi-cols-lg"]: 4 }}>
        <StatCard label="Total Credit (In)" value={fmtCr(bs.total_credit)} icon={TrendingUp} accent="text-emerald-600 dark:text-emerald-400" testId="bs-total-credit" />
        <StatCard label="Total Debit (Out)" value={fmtCr(bs.total_debit)} icon={TrendingDown} accent="text-red-600 dark:text-red-400" testId="bs-total-debit" />
        <StatCard label="Overall Profit" value={fmtCr(bs.overall_profit)} icon={IndianRupee} accent="text-emerald-600 dark:text-emerald-400" testId="bs-overall-profit" />
        <StatCard label="Overall Loss" value={fmtCr(bs.overall_loss)} icon={AlertTriangle} accent="text-red-600 dark:text-red-400" testId="bs-overall-loss" />
      </div>

      {bs.loss_projects.length > 0 && (
        <div className="border border-red-200 dark:border-red-500/30 bg-red-50 dark:bg-red-500/10/60 dark:bg-red-500/5 p-4 mb-6" data-testid="loss-projects-panel">
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.2em] text-red-600 dark:text-red-400 font-semibold mb-3">
            <AlertTriangle size={13} strokeWidth={2.5} /> Loss-Making Projects
          </div>
          <div className="flex flex-wrap gap-2">
            {bs.loss_projects.map((lp) => (
              <Link key={lp.project_id} to={`/admin/projects/${lp.project_id}`} data-testid={`loss-project-${lp.project_id}`}
                className="flex items-center gap-2 border border-red-200 dark:border-red-500/30 bg-white dark:bg-slate-900 px-3 py-2 text-sm hover:border-red-400 transition-colors">
                <span className="text-slate-700 dark:text-slate-300">{lp.name}</span>
                <span className="font-semibold text-red-600 dark:text-red-400">−{fmtCr(lp.loss).replace("−", "")}</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <div className="text-[11px] uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400 font-semibold mb-3">All Projects — Balance Sheet</div>
          <div className="border border-slate-200 dark:border-slate-800 overflow-x-auto">
            <table className="w-full text-sm" data-testid="bs-projects-table">
              <thead>
                <tr className="text-left text-[10px] uppercase tracking-[0.15em] text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
                  <th className="px-4 py-3">Project</th>
                  <th className="px-4 py-3 text-right">Budget</th>
                  <th className="px-4 py-3 text-right">Credit (In)</th>
                  <th className="px-4 py-3 text-right">Debit (Out)</th>
                  <th className="px-4 py-3 text-right">Profit / Loss</th>
                </tr>
              </thead>
              <tbody>
                {bs.projects.map((p) => (
                  <tr key={p.project_id} data-testid={`bs-row-${p.project_id}`}
                    className={`border-b border-slate-100 dark:border-slate-800/60 ${p.is_loss ? "bg-red-50 dark:bg-red-500/10/60 dark:bg-red-500/5" : ""}`}>
                    <td className="px-4 py-2.5">
                      <Link to={`/admin/projects/${p.project_id}`} className={`hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-400 transition-colors ${p.is_loss ? "text-red-300" : "text-slate-700 dark:text-slate-300"}`}>{p.name}</Link>
                    </td>
                    <td className="px-4 py-2.5 text-right text-slate-500 dark:text-slate-400">{fmtCr(p.budget)}</td>
                    <td className="px-4 py-2.5 text-right font-semibold text-emerald-600 dark:text-emerald-400">{fmt(p.credit)}</td>
                    <td className="px-4 py-2.5 text-right font-semibold text-red-600 dark:text-red-400">{fmt(p.debit)}</td>
                    <td className={`px-4 py-2.5 text-right font-bold ${p.is_loss ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400"}`}>{fmt(p.profit_loss)}</td>
                  </tr>
                ))}
                {bs.overheads?.staff_payroll_paid > 0 && (
                  <tr data-testid="bs-row-overheads" className="border-b border-slate-100 dark:border-slate-800/60 bg-slate-50/60 dark:bg-slate-900/40">
                    <td className="px-4 py-2.5">
                      <Link to="/admin/finance/payroll" className="text-slate-700 dark:text-slate-300 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
                        Company overheads — staff payroll
                      </Link>
                      <div className="text-[10px] uppercase tracking-[0.12em] text-slate-400">Salaries not tied to a project</div>
                    </td>
                    <td className="px-4 py-2.5 text-right text-slate-400">—</td>
                    <td className="px-4 py-2.5 text-right text-slate-400">—</td>
                    <td className="px-4 py-2.5 text-right font-semibold text-red-600 dark:text-red-400" data-testid="bs-overheads-debit">{fmt(bs.overheads.staff_payroll_paid)}</td>
                    <td className="px-4 py-2.5 text-right font-bold text-red-600 dark:text-red-400">{fmt(-bs.overheads.staff_payroll_paid)}</td>
                  </tr>
                )}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-bold">
                  <td className="px-4 py-3 text-slate-700 dark:text-slate-300 uppercase text-xs tracking-wide">Total</td>
                  <td className="px-4 py-3" />
                  <td className="px-4 py-3 text-right text-emerald-600 dark:text-emerald-400" data-testid="bs-foot-credit">{fmt(bs.total_credit)}</td>
                  <td className="px-4 py-3 text-right text-red-600 dark:text-red-400" data-testid="bs-foot-debit">{fmt(bs.total_debit)}</td>
                  <td className={`px-4 py-3 text-right ${bs.net < 0 ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400"}`} data-testid="bs-foot-net">{fmt(bs.net)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        <div>
          <div className="text-[11px] uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400 font-semibold mb-3">Required Employee Payments</div>
          <div className="surface p-4" data-testid="employee-dues-panel">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3 mb-3">
              <span className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400"><Users size={14} strokeWidth={2.5} className="text-blue-600 dark:text-blue-400" /> Staff payroll pending</span>
              <span className="font-semibold text-slate-900 dark:text-slate-100" data-testid="dues-payroll-pending">{fmt(dues.staff_payroll_pending)}</span>
            </div>
            <div className="text-[10px] uppercase tracking-[0.15em] text-slate-500 dark:text-slate-400 font-semibold mb-2">Daily-wage labour dues by type</div>
            <div className="space-y-1.5 mb-3">
              {dues.labour_by_category.map((c) => (
                <div key={c.category} className="flex items-center justify-between text-sm" data-testid={`dues-cat-${c.category}`}>
                  <span className="text-slate-500 dark:text-slate-400">{c.category}</span>
                  <span className="text-slate-700 dark:text-slate-300 font-medium">{fmt(c.amount)}</span>
                </div>
              ))}
              {dues.labour_by_category.length === 0 && <div className="text-xs text-slate-400 dark:text-slate-500">No labour attendance recorded.</div>}
            </div>
            <div className="flex items-center justify-between border-t border-slate-200 dark:border-slate-800 pt-3">
              <span className="text-xs uppercase tracking-wide font-semibold text-slate-500 dark:text-slate-400">Total required</span>
              <span className="font-heading font-bold text-xl text-blue-600 dark:text-blue-400" data-testid="dues-total">{fmt(dues.total_required)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
