import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { LogIn, LogOut, ChevronLeft, ChevronRight, Loader2, CalendarPlus, Clock } from "lucide-react";
import api, { formatApiErrorDetail } from "../../../api/client";
import { useAuth } from "../../../context/AuthContext";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { Textarea } from "../../../components/ui/textarea";
import { ATT_META, LEAVE_STATUS_CHIP, fmtRange, days, monthKey, shiftMonth, monthLabel, todayISO } from "../components/hrConstants";

const primaryBtn = "rounded-md bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-100 text-white dark:text-slate-900 font-semibold uppercase tracking-wide";
const selectCls = "mt-1.5 w-full h-9 px-3 text-sm bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-md";
const label = "text-xs uppercase tracking-[0.15em] text-slate-500 dark:text-slate-400";

function useClock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 30000); return () => clearInterval(t); }, []);
  return now;
}

function TodayCard({ today, onDone }) {
  const [busy, setBusy] = useState(false);
  const now = useClock();
  const act = async (kind) => {
    setBusy(true);
    try {
      await api.post(`/me/attendance/${kind}`);
      toast.success(kind === "check-in" ? "Checked in. Have a good day!" : "Checked out. See you tomorrow!");
      onDone();
    } catch (e) { toast.error(formatApiErrorDetail(e.response?.data?.detail)); }
    finally { setBusy(false); }
  };
  const onLeave = today?.status === "leave" && !today.is_half;
  return (
    <div className="surface p-5" data-testid="today-card">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500 font-semibold">Today</div>
          <div className="font-heading font-bold text-2xl mt-0.5">{now.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })}</div>
          <div className="text-sm text-slate-500 flex items-center gap-1.5 mt-1"><Clock size={13} /> {now.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })}</div>
        </div>
        <div className="flex gap-6 text-sm">
          <div><div className="text-[10px] uppercase tracking-[0.15em] text-slate-500">In</div><div className="font-mono font-semibold text-lg" data-testid="today-in">{today?.check_in || "—"}</div></div>
          <div><div className="text-[10px] uppercase tracking-[0.15em] text-slate-500">Out</div><div className="font-mono font-semibold text-lg" data-testid="today-out">{today?.check_out || "—"}</div></div>
        </div>
      </div>
      <div className="mt-4">
        {onLeave ? (
          <div className="text-sm text-sky-700 dark:text-sky-400 font-semibold">You're on approved {today.leave_type} leave today. Enjoy!</div>
        ) : !today?.check_in ? (
          <Button disabled={busy} onClick={() => act("check-in")} data-testid="check-in-btn"
            className="w-full sm:w-auto h-12 px-8 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white font-bold uppercase tracking-wide text-sm">
            {busy ? <Loader2 size={16} className="animate-spin" /> : <LogIn size={16} />} Check in
          </Button>
        ) : !today?.check_out ? (
          <Button disabled={busy} onClick={() => act("check-out")} data-testid="check-out-btn"
            className="w-full sm:w-auto h-12 px-8 rounded-md bg-slate-900 hover:bg-slate-800 dark:bg-white dark:text-slate-900 text-white font-bold uppercase tracking-wide text-sm">
            {busy ? <Loader2 size={16} className="animate-spin" /> : <LogOut size={16} />} Check out
          </Button>
        ) : (
          <div className="text-sm text-emerald-700 dark:text-emerald-400 font-semibold">Done for today ✓</div>
        )}
      </div>
    </div>
  );
}

function ApplyForm({ balances, onDone }) {
  const firstType = (balances || [])[0]?.leave_type || "";
  const empty = { leave_type: firstType, start_date: todayISO(), end_date: todayISO(), half_day: false, reason: "" };
  const [form, setForm] = useState(empty);
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v, ...(k === "start_date" && v > f.end_date ? { end_date: v } : {}) }));
  const types = (balances || []).map((b) => b.leave_type);

  const submit = async (e) => {
    e.preventDefault();
    if (form.end_date < form.start_date) { toast.error("End date is before start date"); return; }
    setBusy(true);
    try {
      await api.post("/me/leave", { ...form, end_date: form.half_day ? form.start_date : form.end_date });
      toast.success("Leave request sent to your Admin");
      setForm(empty);
      onDone();
    } catch (e2) { toast.error(formatApiErrorDetail(e2.response?.data?.detail)); }
    finally { setBusy(false); }
  };

  return (
    <form onSubmit={submit} className="surface p-5 space-y-4" data-testid="apply-leave-form">
      <div className="font-heading font-semibold text-lg flex items-center gap-2"><CalendarPlus size={18} /> Apply for leave</div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <span className={label}>Type</span>
          <select value={form.leave_type} onChange={(e) => set("leave_type", e.target.value)} className={selectCls} data-testid="leave-type-select">
            {types.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div>
          <span className={label}>From</span>
          <Input type="date" value={form.start_date} onChange={(e) => set("start_date", e.target.value)} required data-testid="leave-from"
            className="mt-1.5 bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700" />
        </div>
        <div>
          <span className={label}>To</span>
          <Input type="date" value={form.half_day ? form.start_date : form.end_date} min={form.start_date} disabled={form.half_day}
            onChange={(e) => set("end_date", e.target.value)} data-testid="leave-to"
            className="mt-1.5 bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700" />
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={form.half_day} onChange={(e) => set("half_day", e.target.checked)} className="accent-amber-600 w-4 h-4" data-testid="leave-half" />
        Half day (single date)
      </label>
      <div>
        <span className={label}>Reason</span>
        <Textarea rows={2} value={form.reason} onChange={(e) => set("reason", e.target.value)} placeholder="e.g. Family function in Madurai"
          className="mt-1.5 bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700" data-testid="leave-reason" />
      </div>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <span className="text-[11px] text-slate-500">Sundays aren't counted. Your Admin will be notified.</span>
        <Button type="submit" disabled={busy} className={primaryBtn} data-testid="leave-submit">Send request</Button>
      </div>
    </form>
  );
}

function MonthCalendar({ month, setMonth, data }) {
  const [y, m] = month.split("-").map(Number);
  const first = new Date(y, m - 1, 1);
  const total = new Date(y, m, 0).getDate();
  const lead = (first.getDay() + 6) % 7;           // Monday-first
  const recs = Object.fromEntries((data?.records || []).map((r) => [r.date, r]));
  const today = data?.today_date;
  const cells = [...Array(lead).fill(null), ...Array.from({ length: total }, (_, i) => i + 1)];
  return (
    <div className="surface p-5" data-testid="my-calendar">
      <div className="flex items-center justify-between mb-3">
        <div className="font-heading font-semibold text-lg">My attendance</div>
        <div className="inline-flex items-center gap-1">
          <button className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800" onClick={() => setMonth(shiftMonth(month, -1))} aria-label="Previous month"><ChevronLeft size={16} /></button>
          <span className="text-sm font-semibold min-w-[120px] text-center">{monthLabel(month)}</span>
          <button className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800" onClick={() => setMonth(shiftMonth(month, 1))} aria-label="Next month"><ChevronRight size={16} /></button>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-[10px] uppercase text-slate-400 mb-1">
        {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => <div key={i}>{d}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((d, i) => {
          if (!d) return <div key={i} />;
          const iso = `${month}-${String(d).padStart(2, "0")}`;
          const r = recs[iso];
          const sunday = (lead + d - 1) % 7 === 6;
          const meta = r ? ATT_META[r.status] : sunday ? ATT_META.week_off : null;
          return (
            <div key={i} title={r ? `${meta.label}${r.check_in ? ` · in ${r.check_in}` : ""}${r.check_out ? ` · out ${r.check_out}` : ""}` : ""}
              className={`aspect-square rounded-md flex flex-col items-center justify-center text-xs ${meta ? meta.cell : "bg-slate-50 dark:bg-slate-900/50 text-slate-500"} ${iso === today ? "ring-2 ring-amber-500" : ""}`}>
              <span className="font-semibold">{d}</span>
              {r && <span className="text-[9px] font-bold">{r.status === "leave" && r.is_half ? "L½" : meta.code}</span>}
            </div>
          );
        })}
      </div>
      {data?.summary && (
        <div className="flex flex-wrap gap-3 mt-4 text-xs text-slate-600 dark:text-slate-300">
          <span>Present <b>{data.summary.present}</b></span>
          <span>Absent <b>{data.summary.absent}</b></span>
          <span>Half day <b>{data.summary.half_day}</b></span>
          <span>Leave <b>{data.summary.leave}</b></span>
        </div>
      )}
    </div>
  );
}

export default function MyAttendancePage() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [month, setMonth] = useState(monthKey());

  const { data: att } = useQuery({
    queryKey: ["myAttendance", month],
    queryFn: () => api.get("/me/attendance", { params: { month } }).then((r) => r.data),
  });
  const { data: leave, isLoading } = useQuery({
    queryKey: ["myLeave"],
    queryFn: () => api.get("/me/leave").then((r) => r.data),
  });
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["myAttendance"] });
    qc.invalidateQueries({ queryKey: ["myLeave"] });
  };

  const cancel = async (r) => {
    if (!window.confirm(`Cancel your ${r.leave_type} leave request for ${fmtRange(r.start_date, r.end_date)}?`)) return;
    try { await api.post(`/me/leave/${r.id}/cancel`); toast.success("Request cancelled"); refresh(); }
    catch (e) { toast.error(formatApiErrorDetail(e.response?.data?.detail)); }
  };

  return (
    <div className="p-4 sm:p-8 max-w-6xl" data-testid="my-attendance-page">
      <div className="mb-6">
        <div className="text-amber-600 dark:text-amber-400 text-[11px] uppercase tracking-[0.3em] font-semibold mb-1">Hi {user?.name?.split(" ")[0]}</div>
        <h1 className="font-heading font-bold text-4xl sm:text-5xl tracking-tight leading-none">My Attendance</h1>
      </div>

      <div className="grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-5">
        <div className="space-y-5 min-w-0">
          <TodayCard today={att?.today} onDone={refresh} />
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3" data-testid="leave-balances">
            {(leave?.balances || []).map((b) => (
              <div key={b.leave_type} className="surface p-3">
                <div className="text-[10px] uppercase tracking-[0.15em] text-slate-500 font-semibold">{b.leave_type}</div>
                <div className="font-heading font-bold text-2xl mt-1 tabular-nums">{b.remaining == null ? "∞" : b.remaining}</div>
                <div className="text-[10px] text-slate-500">{b.quota == null ? `${b.used} used` : `of ${b.quota} left`}{b.pending ? ` · ${b.pending} pending` : ""}</div>
              </div>
            ))}
          </div>
          {leave && <ApplyForm balances={leave.balances} onDone={refresh} />}
        </div>

        <div className="space-y-5 min-w-0">
          <MonthCalendar month={month} setMonth={setMonth} data={att} />
          <div className="surface p-5">
            <div className="font-heading font-semibold text-lg mb-3">My leave requests</div>
            {isLoading ? <Loader2 className="animate-spin text-slate-400" /> : (leave?.requests || []).length === 0 ? (
              <div className="text-sm text-slate-500">No requests yet.</div>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800" data-testid="my-requests">
                {leave.requests.map((r) => (
                  <div key={r.id} className="py-2.5 flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold">{r.leave_type} · {r.half_day ? "Half day" : days(r.days)}</div>
                      <div className="text-xs text-slate-500">{fmtRange(r.start_date, r.end_date)}{r.reason ? ` · ${r.reason}` : ""}</div>
                      {r.decision_note && <div className="text-xs text-slate-500 mt-0.5">Admin: {r.decision_note}</div>}
                    </div>
                    <span className={`chip ${LEAVE_STATUS_CHIP[r.status] || ""}`}>{r.status}</span>
                    {r.status === "Pending" && (
                      <button onClick={() => cancel(r)} className="text-[11px] text-slate-400 hover:text-rose-600" data-testid={`my-cancel-${r.id}`}>Cancel</button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
