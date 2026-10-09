import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, Download, CheckCheck, Loader2, Lock, Users } from "lucide-react";
import api, { formatApiErrorDetail } from "../../../api/client";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../../../components/ui/dialog";
import { downloadFile } from "../utils/downloadFile";
import { ATT_META, EDITABLE_STATUSES, monthKey, shiftMonth, monthLabel, todayISO, fmtDate } from "./hrConstants";

const primaryBtn = "rounded-md bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-100 text-white dark:text-slate-900 font-semibold uppercase tracking-wide";

function CellEditor({ cell, onClose, onSaved }) {
  const [form, setForm] = useState({ status: "present", check_in: "", check_out: "", note: "" });
  const [busy, setBusy] = useState(false);
  const rec = cell?.record;

  useEffect(() => {
    if (!cell) return;
    setForm({
      status: rec?.status && rec.status !== "leave" ? rec.status : "present",
      check_in: rec?.check_in || "", check_out: rec?.check_out || "", note: rec?.note || "",
    });
  }, [cell, rec]);

  if (!cell) return null;
  const locked = rec?.source === "leave";

  const save = async () => {
    setBusy(true);
    try {
      await api.put("/staff-attendance", { user_id: cell.person.id, date: cell.date, ...form });
      toast.success("Attendance saved");
      onSaved();
    } catch (e) { toast.error(formatApiErrorDetail(e.response?.data?.detail)); }
    finally { setBusy(false); }
  };
  const clear = async () => {
    setBusy(true);
    try {
      await api.delete("/staff-attendance", { params: { user_id: cell.person.id, date: cell.date } });
      toast.success("Cleared");
      onSaved();
    } catch (e) { toast.error(formatApiErrorDetail(e.response?.data?.detail)); }
    finally { setBusy(false); }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 rounded-md max-w-sm" data-testid="attendance-cell-editor">
        <DialogHeader>
          <DialogTitle className="font-heading text-xl">{cell.person.name}</DialogTitle>
          <DialogDescription className="text-xs text-slate-500 dark:text-slate-400">
            {new Date(`${cell.date}T00:00:00`).toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })}
          </DialogDescription>
        </DialogHeader>
        {locked ? (
          <div className="text-sm space-y-2">
            <div className="flex items-center gap-2"><Lock size={14} className="text-sky-600" />
              Approved <b>{rec.leave_type}</b> leave{rec.is_half ? " (half day)" : ""}.</div>
            <p className="text-xs text-slate-500">To change this day, cancel the leave in the Leave Requests tab.</p>
            {rec.check_in && <p className="text-xs">Checked in {rec.check_in}{rec.check_out ? ` · out ${rec.check_out}` : ""}</p>}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-1.5">
              {EDITABLE_STATUSES.map((s) => (
                <button key={s} type="button" onClick={() => setForm((f) => ({ ...f, status: s }))} data-testid={`att-status-${s}`}
                  className={`h-9 rounded-md text-xs font-semibold border ${form.status === s ? "border-slate-900 dark:border-white ring-2 ring-amber-500/30" : "border-slate-200 dark:border-slate-700"} ${ATT_META[s].cell}`}>
                  {ATT_META[s].label}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <label className="text-xs text-slate-500">Check in
                <Input type="time" value={form.check_in} onChange={(e) => setForm((f) => ({ ...f, check_in: e.target.value }))}
                  className="mt-1 h-9 bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700" />
              </label>
              <label className="text-xs text-slate-500">Check out
                <Input type="time" value={form.check_out} onChange={(e) => setForm((f) => ({ ...f, check_out: e.target.value }))}
                  className="mt-1 h-9 bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700" />
              </label>
            </div>
            <Input placeholder="Note (optional)" value={form.note} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
              className="h-9 bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700" />
            {rec?.source === "self" && <p className="text-[11px] text-slate-500">Self check-in by {cell.person.name}. Saving will mark it as edited by Admin.</p>}
            <div className="flex justify-between gap-2">
              {rec ? <Button variant="ghost" disabled={busy} onClick={clear} className="text-rose-600 text-xs">Clear</Button> : <span />}
              <div className="flex gap-2">
                <Button variant="outline" onClick={onClose}>Cancel</Button>
                <Button className={primaryBtn} disabled={busy} onClick={save} data-testid="att-save">Save</Button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function StaffAttendanceTab() {
  const qc = useQueryClient();
  const [month, setMonth] = useState(monthKey());
  const [cell, setCell] = useState(null);
  const [markDate, setMarkDate] = useState(todayISO());
  const [busy, setBusy] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["staffAttendance", month],
    queryFn: () => api.get("/staff-attendance", { params: { month } }).then((r) => r.data),
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ["staffAttendance"] });
  // Use the server's date (IST) so "today" never counts as a future date.
  const serverToday = data?.today;
  useEffect(() => { if (serverToday && markDate > serverToday) setMarkDate(serverToday); }, [serverToday, markDate]);

  const markAll = async () => {
    setBusy(true);
    try {
      const { data: r } = await api.post("/staff-attendance/mark-all", { date: markDate });
      toast.success(r.marked ? `Marked ${r.marked} present for ${fmtDate(markDate)}` : "Everyone is already marked for that day");
      refresh();
    } catch (e) { toast.error(formatApiErrorDetail(e.response?.data?.detail)); }
    finally { setBusy(false); }
  };

  const staff = data?.staff || [];
  const dayCols = data?.days || [];

  return (
    <div data-testid="staff-attendance-tab">
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="inline-flex items-center rounded-md border border-slate-300 dark:border-slate-700 overflow-hidden">
          <button className="px-2 h-9 hover:bg-slate-100 dark:hover:bg-slate-800" onClick={() => setMonth((m) => shiftMonth(m, -1))} aria-label="Previous month"><ChevronLeft size={16} /></button>
          <span className="px-3 text-sm font-semibold min-w-[130px] text-center" data-testid="att-month">{monthLabel(month)}</span>
          <button className="px-2 h-9 hover:bg-slate-100 dark:hover:bg-slate-800" onClick={() => setMonth((m) => shiftMonth(m, 1))} aria-label="Next month"><ChevronRight size={16} /></button>
        </div>
        <div className="flex items-center gap-1.5">
          <Input type="date" value={markDate} max={serverToday || todayISO()} onChange={(e) => setMarkDate(e.target.value)}
            className="h-9 w-[150px] bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700" />
          <Button variant="outline" disabled={busy || !markDate} onClick={markAll} className="h-9 text-xs font-semibold uppercase tracking-wide" data-testid="att-mark-all">
            <CheckCheck size={14} /> Mark unmarked present
          </Button>
        </div>
        <Button variant="outline" className="ml-auto h-9 text-xs font-semibold uppercase tracking-wide" data-testid="att-export"
          onClick={() => downloadFile(`/staff-attendance/export?month=${month}`, `staff-attendance-${month}.xlsx`).catch(() => toast.error("Export failed"))}>
          <Download size={14} /> Excel
        </Button>
      </div>

      <div className="flex flex-wrap gap-3 mb-3 text-[11px] text-slate-500 dark:text-slate-400">
        {Object.entries(ATT_META).map(([k, m]) => (
          <span key={k} className="inline-flex items-center gap-1.5"><span className={`inline-flex w-6 h-5 rounded items-center justify-center text-[10px] font-bold ${m.cell}`}>{m.code}</span>{m.label}</span>
        ))}
        <span>· Click a cell to edit · Sundays are weekly off</span>
      </div>

      {isLoading ? (
        <div className="py-12 flex justify-center"><Loader2 className="animate-spin text-slate-400" /></div>
      ) : staff.length === 0 ? (
        <div className="surface p-10 text-center text-sm text-slate-500 dark:text-slate-400">
          <Users className="mx-auto mb-2 text-slate-300 dark:text-slate-600" />
          No staff yet. Attendance covers Site Engineers, Accountants and Procurement Officers — add them in the Team tab.
        </div>
      ) : (
        <div className="surface overflow-x-auto">
          <table className="text-xs border-separate border-spacing-0" data-testid="attendance-grid">
            <thead>
              <tr>
                <th className="sticky left-0 z-10 bg-white dark:bg-slate-900 text-left px-3 py-2 min-w-[160px] border-b border-slate-200 dark:border-slate-800">Staff</th>
                {dayCols.map((d) => (
                  <th key={d.date} className={`px-0.5 py-1.5 text-center font-semibold border-b border-slate-200 dark:border-slate-800 ${d.is_sunday ? "text-slate-400" : ""} ${d.date === data.today ? "text-amber-600" : ""}`}>
                    <div>{d.day}</div><div className="text-[9px] font-normal text-slate-400">{d.weekday[0]}</div>
                  </th>
                ))}
                {["P", "A", "½", "L", "?", "Deduct"].map((h) => (
                  <th key={h} className="px-2 py-2 text-center border-b border-l border-slate-200 dark:border-slate-800" title={h === "?" ? "Unmarked working days" : undefined}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {staff.map((p) => (
                <tr key={p.id} data-testid={`att-row-${p.id}`}>
                  <td className="sticky left-0 z-10 bg-white dark:bg-slate-900 px-3 py-1.5 border-b border-slate-100 dark:border-slate-800/60">
                    <div className="font-semibold text-slate-900 dark:text-slate-100 text-sm truncate max-w-[180px]">{p.name}</div>
                    <div className="text-[10px] text-slate-500">{p.role.replace(/([A-Z])/g, " $1").trim()}</div>
                  </td>
                  {dayCols.map((d) => {
                    const rec = p.records[d.date];
                    const meta = rec ? ATT_META[rec.status] : d.is_sunday ? ATT_META.week_off : null;
                    const label = rec ? (rec.status === "leave" && rec.is_half ? "L½" : meta.code) : d.is_sunday ? "·" : "";
                    const title = rec
                      ? `${meta.label}${rec.leave_type ? ` (${rec.leave_type})` : ""}${rec.check_in ? ` · in ${rec.check_in}` : ""}${rec.check_out ? ` · out ${rec.check_out}` : ""}${rec.note ? ` · ${rec.note}` : ""}`
                      : d.is_future ? "" : "Not marked";
                    return (
                      <td key={d.date} className="p-0.5 border-b border-slate-100 dark:border-slate-800/60">
                        <button disabled={d.is_future} title={title} onClick={() => setCell({ person: p, date: d.date, record: rec })}
                          data-testid={`att-cell-${p.id}-${d.date}`}
                          className={`w-7 h-7 rounded text-[10px] font-bold flex items-center justify-center transition-colors ${
                            rec ? meta.cell : d.is_future ? "opacity-30" : d.is_sunday ? "text-slate-400" : "border border-dashed border-slate-300 dark:border-slate-700 hover:border-amber-500"
                          } ${d.date === data.today ? "ring-1 ring-amber-500" : ""}`}>
                          {label}
                        </button>
                      </td>
                    );
                  })}
                  {[p.summary.present, p.summary.absent, p.summary.half_day, p.summary.leave, p.summary.unmarked].map((v, i) => (
                    <td key={i} className="px-2 text-center border-b border-l border-slate-100 dark:border-slate-800/60 tabular-nums">{v || "–"}</td>
                  ))}
                  <td className={`px-2 text-center border-b border-l border-slate-100 dark:border-slate-800/60 tabular-nums font-semibold ${p.summary.deduction_days ? "text-rose-600" : ""}`}>
                    {p.summary.deduction_days || "–"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-3">
        Deduct = absent + ½ × half days + unpaid leave days. Payroll deducts these automatically (base salary ÷ days in the pay period × deduct days).
      </p>
      <CellEditor cell={cell} onClose={() => setCell(null)} onSaved={() => { setCell(null); refresh(); }} />
    </div>
  );
}
