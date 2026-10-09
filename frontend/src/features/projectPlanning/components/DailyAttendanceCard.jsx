const OPTIONS = [
  ["present", "P", "Present", "bg-emerald-50 dark:bg-emerald-500/100 text-white border-emerald-500", "border-emerald-200 dark:border-emerald-500/30 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:bg-emerald-500/10 dark:hover:bg-emerald-500/10"],
  ["half_day", "½", "Half Day", "bg-amber-50 dark:bg-amber-500/100 text-white border-amber-500", "border-amber-200 dark:border-amber-500/30 text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:bg-amber-500/10 dark:hover:bg-amber-500/10"],
  ["absent", "A", "Absent", "bg-red-50 dark:bg-red-500/100 text-white border-red-500", "border-red-200 dark:border-red-500/30 text-red-600 dark:text-red-400 hover:bg-red-50 dark:bg-red-500/10 dark:hover:bg-red-500/10"],
  ["leave", "L", "Leave", "bg-sky-50 dark:bg-sky-500/100 text-white border-sky-500", "border-sky-200 dark:border-sky-500/30 text-sky-600 dark:text-sky-400 hover:bg-sky-50 dark:bg-sky-500/10"],
];

const STATUS_BADGE = {
  present: "border-emerald-200 dark:border-emerald-500/30 text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10",
  half_day: "border-amber-200 dark:border-amber-500/30 text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/10",
  absent: "border-red-200 dark:border-red-500/30 text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-500/10",
  leave: "border-sky-200 dark:border-sky-500/30 text-sky-600 dark:text-sky-400 bg-sky-50 dark:bg-sky-500/10",
};

export const DailyAttendanceCard = ({ employee, status, onMark, readOnly }) => (
  <div className="surface p-3 flex flex-wrap items-center gap-3" data-testid={`daily-attendance-${employee.id}`}>
    <div className="min-w-0 flex-1">
      <div className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">{employee.name}</div>
      <div className="text-[11px] text-slate-500 dark:text-slate-400">{employee.role_title || "—"}</div>
    </div>
    {readOnly ? (
      <span data-testid={`attendance-status-${employee.id}`}
        className={`border px-3 py-1.5 text-[11px] uppercase tracking-[0.12em] font-semibold ${STATUS_BADGE[status] || "border-slate-300 dark:border-slate-700 text-slate-500 dark:text-slate-400"}`}>
        {OPTIONS.find((o) => o[0] === status)?.[2] || "Not marked"}
      </span>
    ) : (
      <div className="flex gap-1.5">
        {OPTIONS.map(([value, letter, label, active, idle]) => (
          <button key={value} title={label} data-testid={`mark-${value}-${employee.id}`}
            onClick={() => onMark(employee, value)}
            className={`w-9 h-9 border font-heading font-bold text-sm transition-colors ${status === value ? active : idle}`}>
            {letter}
          </button>
        ))}
      </div>
    )}
  </div>
);
