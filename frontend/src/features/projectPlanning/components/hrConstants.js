// Shared display metadata for Leave & Attendance.

export const ATT_META = {
  present:  { label: "Present",  code: "P",  cell: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" },
  absent:   { label: "Absent",   code: "A",  cell: "bg-rose-500/15 text-rose-700 dark:text-rose-400" },
  half_day: { label: "Half day", code: "½",  cell: "bg-amber-500/20 text-amber-700 dark:text-amber-400" },
  leave:    { label: "Leave",    code: "L",  cell: "bg-sky-500/15 text-sky-700 dark:text-sky-400" },
  week_off: { label: "Week off", code: "WO", cell: "bg-slate-200/70 dark:bg-slate-800 text-slate-500" },
  holiday:  { label: "Holiday",  code: "H",  cell: "bg-violet-500/15 text-violet-700 dark:text-violet-400" },
};

export const EDITABLE_STATUSES = ["present", "absent", "half_day", "week_off", "holiday"];

export const LEAVE_STATUS_CHIP = {
  Pending: "chip-warning", Approved: "chip-success", Rejected: "chip-danger", Cancelled: "",
};

export const fmtDate = (iso) =>
  iso ? new Date(`${iso}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : "—";

export const fmtRange = (a, b) => (a === b ? fmtDate(a) : `${fmtDate(a)} – ${fmtDate(b)}`);

export const monthKey = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

export const shiftMonth = (key, n) => {
  const [y, m] = key.split("-").map(Number);
  return monthKey(new Date(y, m - 1 + n, 1));
};

export const monthLabel = (key) => {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-IN", { month: "long", year: "numeric" });
};

export const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export const days = (n) => `${Number(n) % 1 ? Number(n).toFixed(1) : Number(n)} day${Number(n) === 1 ? "" : "s"}`;
