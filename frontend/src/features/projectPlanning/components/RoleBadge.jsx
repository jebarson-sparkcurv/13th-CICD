const STYLES = {
  Admin: "bg-amber-50 dark:bg-amber-500/10 text-blue-600 dark:text-blue-400 border-amber-300 dark:border-amber-500/40",
  SiteEngineer: "bg-sky-50 dark:bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-200 dark:border-sky-500/30",
  Accountant: "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/30",
  ProcurementOfficer: "bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-500/30",
  Client: "bg-teal-500/10 text-teal-400 border-teal-500/40",
  Vendor: "bg-amber-50 dark:bg-amber-500/100/10 text-amber-400 border-amber-500/40",
};

export const RoleBadge = ({ role }) => (
  <span data-testid={`role-badge-${role}`}
    className={`inline-block border px-2 py-0.5 text-[11px] uppercase tracking-[0.12em] font-semibold whitespace-nowrap ${STYLES[role] || STYLES.Client}`}>
    {role?.replace(/([A-Z])/g, " $1").trim()}
  </span>
);
