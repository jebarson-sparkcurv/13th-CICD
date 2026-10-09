const STYLES = {
  Planning: "bg-sky-50 dark:bg-sky-500/10 text-sky-700 dark:text-sky-400 border-sky-200 dark:border-sky-500/30",
  Ongoing: "bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-500/30",
  OnHold: "bg-orange-50 dark:bg-orange-500/10 text-orange-700 dark:text-orange-400 border-orange-200 dark:border-orange-500/30",
  Completed: "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/30",
  Cancelled: "bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-400 border-red-200 dark:border-red-500/30",
};

export const FLAG_STYLES = {
  OnTrack: "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/30",
  Delayed: "bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-500/30",
  Blocked: "bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-400 border-red-200 dark:border-red-500/30",
};

export const PHASE_COLORS = {
  NotStarted: { dot: "bg-slate-300 dark:bg-slate-700 border-slate-400 dark:border-slate-600", text: "text-slate-500 dark:text-slate-400" },
  InProgress: { dot: "bg-blue-600 border-blue-500", text: "text-blue-600 dark:text-blue-400" },
  Completed: { dot: "bg-emerald-50 dark:bg-emerald-500/100 border-emerald-400", text: "text-emerald-600 dark:text-emerald-400" },
  Delayed: { dot: "bg-amber-50 dark:bg-amber-500/100 border-amber-400", text: "text-amber-600 dark:text-amber-400" },
  Blocked: { dot: "bg-red-50 dark:bg-red-500/100 border-red-400", text: "text-red-600 dark:text-red-400" },
};

export const ProjectStatusBadge = ({ status }) => (
  <span
    data-testid={`status-badge-${status}`}
    className={`inline-flex items-center border rounded-full px-2.5 py-0.5 text-[11px] uppercase tracking-[0.1em] font-semibold ${STYLES[status] || STYLES.Planning}`}
  >
    {status}
  </span>
);

export const FlagBadge = ({ flag }) => (
  <span
    data-testid={`flag-badge-${flag}`}
    className={`inline-flex items-center border rounded-full px-2.5 py-0.5 text-[11px] uppercase tracking-[0.1em] font-semibold ${FLAG_STYLES[flag] || FLAG_STYLES.OnTrack}`}
  >
    {flag}
  </span>
);
