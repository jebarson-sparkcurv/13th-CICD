const STYLES = {
  Draft: "border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-800",
  "Pending Client Review": "border-amber-300 dark:border-amber-500/40 text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/10",
  "Revision Requested": "border-sky-300 dark:border-sky-500/40 text-sky-700 dark:text-sky-400 bg-sky-50 dark:bg-sky-500/10",
  Approved: "border-emerald-300 dark:border-emerald-500/40 text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10",
  Rejected: "border-red-300 dark:border-red-500/40 text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-500/10",
};

export const ChangeOrderStatusBadge = ({ status }) => (
  <span data-testid="co-status-badge" className={`border px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] font-bold whitespace-nowrap ${STYLES[status] || STYLES.Draft}`}>
    {status}
  </span>
);
