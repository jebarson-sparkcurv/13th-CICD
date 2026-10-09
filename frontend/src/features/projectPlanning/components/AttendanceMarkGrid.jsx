const CYCLE = ["present", "half_day", "absent", "leave"];
const CELL = {
  present: "bg-emerald-50 dark:bg-emerald-500/100/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30",
  half_day: "bg-amber-50 dark:bg-amber-500/100/15 text-amber-600 dark:text-amber-400 border-amber-500/30",
  absent: "bg-red-50 dark:bg-red-500/100/15 text-red-600 dark:text-red-400 border-red-200 dark:border-red-500/30",
  leave: "bg-sky-50 dark:bg-sky-500/100/15 text-sky-600 dark:text-sky-400 border-sky-500/30",
};
const LETTER = { present: "P", half_day: "½", absent: "A", leave: "L" };

export const AttendanceMarkGrid = ({ employees, dates, attendanceMap, onMark }) => (
  <div className="border border-slate-200 dark:border-slate-800 overflow-x-auto">
    <table className="w-full text-sm" data-testid="attendance-grid">
      <thead>
        <tr className="text-left text-[10px] uppercase tracking-[0.15em] text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
          <th className="px-4 py-3 min-w-[160px]">Employee</th>
          {dates.map((d) => (
            <th key={d} className="px-2 py-3 text-center min-w-[64px]">
              <div>{new Date(d + "T00:00:00").toLocaleDateString("en-IN", { weekday: "short" })}</div>
              <div className="text-slate-500 dark:text-slate-400 normal-case">{d.slice(8)}/{d.slice(5, 7)}</div>
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {employees.map((e) => (
          <tr key={e.id} className="border-b border-slate-100 dark:border-slate-800/60" data-testid={`grid-row-${e.id}`}>
            <td className="px-4 py-2">
              <div className="font-semibold text-slate-900 dark:text-slate-100">{e.name}</div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400">{e.role_title || "—"}</div>
            </td>
            {dates.map((d) => {
              const status = attendanceMap[`${e.id}|${d}`];
              const next = CYCLE[(CYCLE.indexOf(status) + 1) % CYCLE.length];
              return (
                <td key={d} className="px-2 py-2 text-center">
                  <button data-testid={`grid-cell-${e.id}-${d}`}
                    title={status ? `${status} — click to change` : "Click to mark present"}
                    onClick={() => onMark(e, status ? next : "present", d)}
                    className={`w-9 h-9 border font-heading font-bold text-sm transition-colors ${
                      status ? CELL[status] : "border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:border-blue-400 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-400"}`}>
                    {status ? LETTER[status] : "·"}
                  </button>
                </td>
              );
            })}
          </tr>
        ))}
        {employees.length === 0 && (
          <tr><td colSpan={dates.length + 1} className="px-4 py-8 text-center text-slate-500 dark:text-slate-400">No active employees.</td></tr>
        )}
      </tbody>
    </table>
  </div>
);
