const VARIANTS = {
  default: { icon: "text-slate-700 dark:text-slate-300", active: "border-slate-900 dark:border-slate-100", ring: "ring-slate-900/10 dark:ring-slate-100/20", dot: null },
  success: { icon: "text-emerald-600 dark:text-emerald-400", active: "border-emerald-500", ring: "ring-emerald-500/20", dot: "bg-emerald-500" },
  warning: { icon: "text-rose-600 dark:text-rose-400", active: "border-rose-500", ring: "ring-rose-500/20", dot: "bg-rose-500" },
  info: { icon: "text-sky-600 dark:text-sky-400", active: "border-sky-500", ring: "ring-sky-500/20", dot: null },
};

export const DashboardStatCard = ({ label, value, icon: Icon, isActive, onClick, variant = "default", testId }) => {
  const v = VARIANTS[variant] || VARIANTS.default;
  return (
    <button
      data-testid={testId}
      onClick={onClick}
      aria-pressed={!!isActive}
      className={`text-left stat-card surface surface-hover p-5 tap-scale focus:outline-none transition-all group ${
        isActive ? `${v.active} ring-2 ring-inset ${v.ring}` : ""
      }`}
    >
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400 font-semibold">
          {v.dot && <span className={`inline-block w-1.5 h-1.5 rounded-full ${v.dot}`} />}
          {label}
        </span>
        <div className={`w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800/60 flex items-center justify-center transition-colors group-hover:bg-slate-200/60 dark:group-hover:bg-slate-800 ${v.icon}`}>
          <Icon size={15} strokeWidth={2.25} />
        </div>
      </div>
      <div className={`stat-value mt-4 ${isActive ? v.icon : "text-slate-900 dark:text-slate-100"}`}>
        {value}
      </div>
      {isActive && (
        <div className="text-[9px] uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400 mt-2 flex items-center gap-1.5">
          <span className="inline-block w-1 h-1 rounded-full bg-amber-500 animate-pulse" />
          Filter active — click to clear
        </div>
      )}
    </button>
  );
};
