import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, X, Settings2, Ban, Loader2, CalendarDays } from "lucide-react";
import api, { formatApiErrorDetail } from "../../../api/client";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../../../components/ui/dialog";
import { LEAVE_STATUS_CHIP, fmtRange, days } from "./hrConstants";

const FILTERS = ["Pending", "Approved", "Rejected", "Cancelled", "All"];
const primaryBtn = "rounded-md bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-100 text-white dark:text-slate-900 font-semibold uppercase tracking-wide";

function PolicyModal({ open, onOpenChange }) {
  const qc = useQueryClient();
  const [rows, setRows] = useState([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    api.get("/leave/policies").then((r) => setRows(r.data.map((p) => ({ ...p, annual_quota: p.annual_quota ?? "", _existing: true }))))
      .catch((e) => toast.error(formatApiErrorDetail(e.response?.data?.detail)));
  }, [open]);

  const set = (i, k, v) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, [k]: v } : r)));

  const save = async () => {
    setSaving(true);
    try {
      await api.put("/leave/policies", rows.filter((r) => r.leave_type.trim()).map(({ _existing, ...r }) => ({ ...r, annual_quota: r.annual_quota === "" ? null : Number(r.annual_quota) })));
      toast.success("Leave policy saved");
      qc.invalidateQueries({ queryKey: ["leaveRequests"] });
      onOpenChange(false);
    } catch (e) { toast.error(formatApiErrorDetail(e.response?.data?.detail)); }
    finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 rounded-md max-w-lg" data-testid="leave-policy-modal">
        <DialogHeader>
          <DialogTitle className="font-heading text-2xl uppercase tracking-wide">Leave Policy</DialogTitle>
          <DialogDescription className="text-xs text-slate-500 dark:text-slate-400">
            Days allowed per person per calendar year. Leave blank for unlimited. Unpaid types are deducted in payroll.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <div className="grid grid-cols-[1fr_90px_60px_60px] gap-2 text-[10px] uppercase tracking-[0.15em] text-slate-500 font-semibold px-1">
            <span>Type</span><span>Days / yr</span><span className="text-center">Paid</span><span className="text-center">Active</span>
          </div>
          {rows.map((r, i) => (
            <div key={i} className="grid grid-cols-[1fr_90px_60px_60px] gap-2 items-center">
              <Input value={r.leave_type} onChange={(e) => set(i, "leave_type", e.target.value)} disabled={!!r._existing}
                className="h-9 bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700" />
              <Input type="number" min={0} max={365} step="0.5" placeholder="∞" value={r.annual_quota}
                onChange={(e) => set(i, "annual_quota", e.target.value)} data-testid={`policy-quota-${r.leave_type}`}
                className="h-9 bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700" />
              <input type="checkbox" checked={r.is_paid} onChange={(e) => set(i, "is_paid", e.target.checked)} className="justify-self-center accent-amber-600 w-4 h-4" />
              <input type="checkbox" checked={r.is_active} onChange={(e) => set(i, "is_active", e.target.checked)} className="justify-self-center accent-amber-600 w-4 h-4" />
            </div>
          ))}
          <button type="button" onClick={() => setRows((rs) => [...rs, { leave_type: "", annual_quota: "", is_paid: true, is_active: true }])}
            className="text-xs font-semibold text-amber-600 dark:text-amber-400 hover:underline">+ Add leave type</button>
        </div>
        <div className="flex justify-end gap-3 pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button className={primaryBtn} disabled={saving} onClick={save} data-testid="policy-save">Save</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function LeaveRequestsTab() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState("Pending");
  const [policyOpen, setPolicyOpen] = useState(false);
  const [busyId, setBusyId] = useState(null);

  const { data, isLoading } = useQuery({
    queryKey: ["leaveRequests", filter],
    queryFn: () => api.get("/leave/requests", { params: filter === "All" ? {} : { status: filter } }).then((r) => r.data),
  });

  const act = async (r, action) => {
    let body = {};
    if (action === "reject") {
      const note = window.prompt(`Reason for rejecting ${r.user_name}'s leave (optional):`, "");
      if (note === null) return;
      body = { note };
    }
    if (action === "cancel" && !window.confirm(`Cancel ${r.user_name}'s approved leave (${fmtRange(r.start_date, r.end_date)})? Their attendance for those days will be cleared.`)) return;
    setBusyId(r.id);
    try {
      await api.post(`/leave/requests/${r.id}/${action}`, body);
      toast.success({ approve: "Leave approved", reject: "Leave rejected", cancel: "Leave cancelled" }[action]);
      qc.invalidateQueries({ queryKey: ["leaveRequests"] });
      qc.invalidateQueries({ queryKey: ["staffAttendance"] });
    } catch (e) { toast.error(formatApiErrorDetail(e.response?.data?.detail)); }
    finally { setBusyId(null); }
  };

  const rows = data?.requests || [];

  return (
    <div data-testid="leave-requests-tab">
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="inline-flex rounded-md border border-slate-300 dark:border-slate-700 overflow-hidden" role="group">
          {FILTERS.map((f) => (
            <button key={f} onClick={() => setFilter(f)} aria-pressed={filter === f} data-testid={`leave-filter-${f}`}
              className={`px-3 h-9 text-[11px] font-semibold uppercase tracking-wide ${filter === f ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900" : "bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300"}`}>
              {f}{f === "Pending" && data?.pending_count && filter === "Pending" ? ` · ${data.pending_count}` : ""}
            </button>
          ))}
        </div>
        <Button variant="outline" onClick={() => setPolicyOpen(true)} className="ml-auto rounded-md text-xs font-semibold uppercase tracking-wide" data-testid="leave-policy-button">
          <Settings2 size={14} /> Leave policy
        </Button>
      </div>

      {isLoading ? (
        <div className="py-12 flex justify-center"><Loader2 className="animate-spin text-slate-400" /></div>
      ) : rows.length === 0 ? (
        <div className="surface p-10 text-center text-sm text-slate-500 dark:text-slate-400">
          <CalendarDays className="mx-auto mb-2 text-slate-300 dark:text-slate-600" />
          {filter === "Pending" ? "No leave requests waiting for approval." : "No leave requests here."}
          <div className="text-xs mt-1">Staff apply from <b>My Attendance</b> in their own login.</div>
        </div>
      ) : (
        <div className="space-y-2">
          {rows.map((r) => (
            <div key={r.id} className="surface p-4 flex flex-wrap items-start gap-x-6 gap-y-2" data-testid={`leave-request-${r.id}`}>
              <div className="min-w-[180px] flex-1">
                <div className="font-semibold text-slate-900 dark:text-slate-100">{r.user_name}</div>
                <div className="text-xs text-slate-500 dark:text-slate-400">{(r.user_role || "").replace(/([A-Z])/g, " $1").trim()}</div>
              </div>
              <div className="min-w-[160px]">
                <div className="text-sm font-semibold">{r.leave_type} · {r.half_day ? "Half day" : days(r.days)}</div>
                <div className="text-xs text-slate-500 dark:text-slate-400">{fmtRange(r.start_date, r.end_date)}</div>
              </div>
              <div className="min-w-[200px] flex-[2] text-sm text-slate-600 dark:text-slate-300">
                {r.reason || <span className="text-slate-400">No reason given</span>}
                {r.decision_note && <div className="text-xs text-slate-500 mt-1">Admin note: {r.decision_note}</div>}
              </div>
              <div className="flex items-center gap-2 ml-auto">
                {r.balance_remaining != null && r.status === "Pending" && (
                  <span className="text-[11px] text-slate-500 dark:text-slate-400 mr-1" title="Balance after pending requests">{r.balance_remaining} left</span>
                )}
                <span className={`chip ${LEAVE_STATUS_CHIP[r.status] || ""}`}>{r.status}</span>
                {r.status === "Pending" && (
                  <>
                    <Button size="sm" disabled={busyId === r.id} onClick={() => act(r, "approve")} data-testid={`leave-approve-${r.id}`}
                      className="h-8 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold"><Check size={14} /> Approve</Button>
                    <Button size="sm" variant="outline" disabled={busyId === r.id} onClick={() => act(r, "reject")} data-testid={`leave-reject-${r.id}`}
                      className="h-8 rounded-md text-rose-600 text-xs font-semibold"><X size={14} /> Reject</Button>
                  </>
                )}
                {r.status === "Approved" && (
                  <Button size="sm" variant="ghost" disabled={busyId === r.id} onClick={() => act(r, "cancel")} data-testid={`leave-cancel-${r.id}`}
                    className="h-8 text-xs text-slate-500"><Ban size={13} /> Cancel</Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
      <PolicyModal open={policyOpen} onOpenChange={setPolicyOpen} />
    </div>
  );
}
