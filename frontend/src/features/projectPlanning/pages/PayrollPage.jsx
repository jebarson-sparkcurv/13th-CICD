import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeft, Plus, AlertTriangle, Loader2, CalendarClock } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../../../components/ui/dialog";
import api, { formatApiErrorDetail } from "../../../api/client";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { CommitmentStatusBadge } from "../components/CommitmentStatusBadge";

const fmt = (n) => `₹${Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const thisMonth = () => todayStr().slice(0, 7);

function PreviewDialog({ run, onClose, onProcessed }) {
  const [busy, setBusy] = useState(false);
  const { data, isLoading, error } = useQuery({
    queryKey: ["payrollPreview", run?.id],
    queryFn: () => api.get(`/payroll-runs/${run.id}/preview`).then((r) => r.data),
    enabled: !!run,
  });
  if (!run) return null;
  const process = async () => {
    setBusy(true);
    try { await api.post(`/payroll-runs/${run.id}/process`); toast.success(`Payroll for ${run.month_label || "the month"} processed`); onProcessed(); }
    catch (e) { toast.error(formatApiErrorDetail(e.response?.data?.detail) || e.message); }
    finally { setBusy(false); }
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 rounded-md max-w-3xl max-h-[90vh] overflow-y-auto" data-testid="payroll-preview">
        <DialogHeader>
          <DialogTitle className="font-heading text-2xl">Payroll · {run.month_label || `${run.period_start} → ${run.period_end}`}</DialogTitle>
          <DialogDescription className="text-xs text-slate-500 dark:text-slate-400">
            Pay is based on attendance. Paid: present, paid leave, Sundays. Deducted: absent, unpaid leave, unmarked working days, ½ per half day.
          </DialogDescription>
        </DialogHeader>
        {isLoading ? <div className="py-10 flex justify-center"><Loader2 className="animate-spin text-slate-400" /></div>
          : error ? <div className="text-sm text-rose-600">{formatApiErrorDetail(error.response?.data?.detail)}</div> : (
          <>
            {data.can_process && data.lines.some((x) => x.breakdown.counted_until === data.run.period_end) && todayStr() === data.run.period_end && (
              <div className="flex items-start gap-2 p-3 rounded-md bg-sky-500/10 text-sky-800 dark:text-sky-300 text-sm">
                <CalendarClock size={16} className="shrink-0 mt-0.5" />
                <div>Today is the last day of the month and counts too — mark today's attendance before processing.</div>
              </div>
            )}
            {data.unmarked_total > 0 && (
              <div className="flex items-start gap-2 p-3 rounded-md bg-amber-500/10 text-amber-800 dark:text-amber-300 text-sm" data-testid="preview-unmarked-warning">
                <AlertTriangle size={16} className="shrink-0 mt-0.5" />
                <div><b>{data.unmarked_total} unmarked working day(s)</b> will be deducted as absent.
                  Fix them first in <Link to="/admin/users?tab=attendance" className="underline font-semibold">Users → Attendance</Link> if staff were actually working.</div>
              </div>
            )}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="text-left text-[10px] uppercase tracking-[0.12em] text-slate-500 border-b border-slate-200 dark:border-slate-800">
                  <th className="py-1.5">Staff</th><th className="py-1.5 text-right">Base</th><th className="py-1.5 text-center">Present</th>
                  <th className="py-1.5 text-center">Paid leave</th><th className="py-1.5 text-center">Absent</th><th className="py-1.5 text-center">Unmarked</th>
                  <th className="py-1.5 text-right">Deduction</th><th className="py-1.5 text-right">Net pay</th></tr></thead>
                <tbody>
                  {data.lines.map((x) => {
                    const b = x.breakdown;
                    return (
                      <tr key={x.user_id} className="border-b border-slate-100 dark:border-slate-800/60" data-testid={`preview-line-${x.user_id}`}>
                        <td className="py-2"><div className="font-semibold">{x.name}</div><div className="text-[10px] text-slate-500">{x.role}{!b.attendance_based ? " · full salary" : ""}</div></td>
                        <td className="py-2 text-right">{fmt(x.base_salary)}</td>
                        <td className="py-2 text-center">{b.attendance_based ? b.present + (b.half_day ? ` +${b.half_day}½` : "") : "—"}</td>
                        <td className="py-2 text-center">{b.attendance_based ? b.paid_leave || "–" : "—"}</td>
                        <td className="py-2 text-center">{b.attendance_based ? (b.absent + b.unpaid_leave) || "–" : "—"}</td>
                        <td className={`py-2 text-center ${b.unmarked ? "text-amber-600 font-semibold" : ""}`}>{b.attendance_based ? b.unmarked || "–" : "—"}</td>
                        <td className="py-2 text-right text-rose-600">{x.deductions ? `−${fmt(x.deductions)}` : "—"}<div className="text-[10px] text-slate-500">{x.deduction_days ? `${x.deduction_days} day(s)` : ""}</div></td>
                        <td className="py-2 text-right font-semibold">{fmt(x.net_pay)}</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot><tr><td colSpan={7} className="pt-3 text-right text-xs uppercase tracking-wide text-slate-500">Total</td>
                  <td className="pt-3 text-right font-heading font-bold text-lg" data-testid="preview-total">{fmt(data.total_net_pay)}</td></tr></tfoot>
              </table>
            </div>
            <div className="flex items-center justify-between gap-3 flex-wrap pt-2">
              <span className="text-xs text-slate-500">
                {data.can_process ? "Day rate = base ÷ days in the month." : `Can be processed from ${new Date(`${data.process_from}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })} (month end).`}
              </span>
              <div className="flex gap-2">
                <Button variant="outline" onClick={onClose}>Close</Button>
                {data.can_process && (
                  <Button disabled={busy} onClick={process} data-testid="preview-process"
                    className="rounded-md bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-100 text-white dark:text-slate-900 font-bold uppercase tracking-wide">
                    {busy && <Loader2 size={14} className="animate-spin" />} Process payroll
                  </Button>
                )}
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

export const PayrollRunTable = ({ run, onProcess, onMarkPaid }) => {
  const { data: entries } = useQuery({
    queryKey: ["payrollEntries", run.id],
    queryFn: () => api.get(`/payroll-runs/${run.id}/entries`).then((r) => r.data),
    enabled: run.status !== "Draft",
  });
  return (
    <div className="surface p-4 space-y-3" data-testid={`payroll-run-${run.id}`}>
      <div className="flex flex-wrap items-center gap-3">
        <span className="font-heading font-bold text-lg text-blue-600 dark:text-blue-400">Run #{run.id}</span>
        <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">{run.month_label || ""}</span>
        <span className="text-xs text-slate-500 dark:text-slate-400">{run.period_start} → {run.period_end}</span>
        <CommitmentStatusBadge status={run.status} />
        <span className="ml-auto font-semibold text-slate-900 dark:text-slate-100">{run.status === "Draft" ? "" : fmt(run.total_net_pay)}</span>
        {run.status === "Draft" && (
          run.process_from && todayStr() < run.process_from ? (
            <span className="inline-flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400" data-testid={`process-wait-${run.id}`}>
              <CalendarClock size={13} /> Process from {new Date(`${run.process_from}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
              <button className="ml-2 underline hover:text-slate-900 dark:hover:text-white" onClick={() => onProcess(run)}>Preview</button>
            </span>
          ) : (
            <Button size="sm" data-testid={`process-run-${run.id}`} onClick={() => onProcess(run)}
              className="rounded-md bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-100 text-white dark:text-slate-900 text-xs uppercase font-bold h-8">Review &amp; Process</Button>
          )
        )}
      </div>
      {entries?.length > 0 && (
        <table className="w-full text-sm">
          <thead><tr className="text-left text-[10px] uppercase tracking-[0.15em] text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
            <th className="py-1.5">Staff</th><th className="py-1.5">Role</th><th className="py-1.5 text-right">Base</th><th className="py-1.5 text-right">Deductions</th><th className="py-1.5 text-right">Net Pay</th><th className="py-1.5 text-right">Status</th></tr></thead>
          <tbody>
            {entries.map((e) => (
              <tr key={e.id} className="border-b border-slate-100 dark:border-slate-800/60" data-testid={`payroll-entry-${e.id}`}>
                <td className="py-2 text-slate-900 dark:text-slate-100">{e.staff_name}</td>
                <td className="py-2 text-slate-500 dark:text-slate-400">{e.role_at_time}</td>
                <td className="py-2 text-right text-slate-500 dark:text-slate-400">{fmt(e.base_salary)}</td>
                <td className="py-2 text-right" data-testid={`payroll-deduction-${e.id}`}>
                  {e.deductions ? (
                    <span className="text-rose-600 dark:text-rose-400" title={e.deduction_note || ""}>
                      −{fmt(e.deductions)}<span className="block text-[10px] text-slate-500">{e.deduction_note || `${e.deduction_days} day(s)`}</span>
                    </span>
                  ) : <span className="text-slate-400">—</span>}
                </td>
                <td className="py-2 text-right font-semibold text-slate-900 dark:text-slate-100">{fmt(e.net_pay)}</td>
                <td className="py-2 text-right">
                  {e.payment_status === "Paid" ? <CommitmentStatusBadge status="Paid" /> : (
                    <button data-testid={`mark-paid-${e.id}`} onClick={() => onMarkPaid(e, run)}
                      className="text-[10px] uppercase tracking-wide font-bold text-emerald-600 dark:text-emerald-400 hover:text-emerald-600 dark:text-emerald-400 dark:hover:text-emerald-400">Mark Paid</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
};

export default function PayrollPage() {
  const qc = useQueryClient();
  const [month, setMonth] = useState(thisMonth());
  const [previewRun, setPreviewRun] = useState(null);
  const { data: runs } = useQuery({
    queryKey: ["payrollRuns"],
    queryFn: () => api.get("/payroll-runs").then((r) => r.data),
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["payrollRuns"] });
    qc.invalidateQueries({ queryKey: ["payrollEntries"] });
    qc.invalidateQueries({ queryKey: ["payrollPreview"] });
    qc.invalidateQueries({ queryKey: ["orgFinance"] });
  };
  const run = async (fn, ok) => {
    try { await fn(); toast.success(ok); refresh(); }
    catch (e) { toast.error(formatApiErrorDetail(e.response?.data?.detail) || e.message); }
  };

  return (
    <div className="p-4 sm:p-8" data-testid="payroll-page">
      <Link to="/admin/finance" className="inline-flex items-center gap-1.5 text-xs uppercase tracking-[0.15em] font-semibold text-slate-500 dark:text-slate-400 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-400 mb-4">
        <ArrowLeft size={14} strokeWidth={2.5} /> Finance
      </Link>
      <h1 className="font-heading font-bold text-4xl sm:text-5xl tracking-tight leading-none mb-8">Payroll</h1>
      <div className="surface p-4 flex flex-wrap items-end gap-3 mb-6">
        <div>
          <div className="text-[10px] uppercase tracking-[0.15em] text-slate-500 dark:text-slate-400 mb-1">Month</div>
          <Input data-testid="payroll-month-input" type="month" value={month} onChange={(e) => setMonth(e.target.value)}
            className="bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 rounded-md h-9 w-[180px]" />
        </div>
        <Button data-testid="payroll-create" disabled={!month}
          onClick={() => run(() => api.post("/payroll-runs", { month }), "Payroll run created")}
          className="rounded-md bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-100 text-white dark:text-slate-900 font-bold uppercase tracking-wide h-9">
          <Plus size={14} strokeWidth={3} /> New Run
        </Button>
        <span className="text-xs text-slate-500 dark:text-slate-400 basis-full sm:basis-auto">
          One run per month · process on the last day of the month or later · pay is based on attendance
        </span>
      </div>
      <div className="space-y-4">
        {(runs || []).map((r) => (
          <PayrollRunTable key={r.id} run={r}
            onProcess={(r2) => setPreviewRun(r2)}
            onMarkPaid={(e) => run(() => api.post(`/payroll-entries/${e.id}/mark-paid`), "Marked paid")} />
        ))}
        {(runs || []).length === 0 && <div className="border border-slate-200 dark:border-slate-800 p-10 text-center text-slate-500 dark:text-slate-400" data-testid="payroll-empty">No payroll runs yet.</div>}
        <PreviewDialog run={previewRun} onClose={() => setPreviewRun(null)} onProcessed={() => { setPreviewRun(null); refresh(); }} />
      </div>
    </div>
  );
}
