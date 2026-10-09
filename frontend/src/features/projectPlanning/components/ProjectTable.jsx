import { useNavigate } from "react-router-dom";
import { AlertTriangle, MapPin } from "lucide-react";
import { ProjectStatusBadge } from "./ProjectStatusBadge";

const fmtBudget = (b) => (b == null ? "—" : `₹${Number(b).toLocaleString("en-IN")}`);

const ProgressBar = ({ pct }) => (
  <div className="flex items-center gap-2">
    <div className="flex-1 h-1.5 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
      <div
        className={`h-full rounded-full transition-all ${pct >= 100 ? "bg-emerald-500" : pct >= 60 ? "bg-amber-500" : "bg-sky-500"}`}
        style={{ width: `${Math.max(0, Math.min(100, pct))}%` }}
      />
    </div>
    <span className="text-xs font-mono text-slate-500 dark:text-slate-400 w-8 tabular-nums">{pct}%</span>
  </div>
);

export const ProjectTable = ({ projects }) => {
  const navigate = useNavigate();
  if (!projects?.length)
    return (
      <div className="surface p-12 text-center text-slate-500 dark:text-slate-400" data-testid="projects-empty-state">
        No projects found.
      </div>
    );

  return (
    <>
      {/* Desktop table */}
      <div className="surface overflow-x-auto table-desktop" data-testid="project-table">
        <table className="data-table">
          <thead>
            <tr>
              <th>Project</th>
              <th>Client</th>
              <th>Engineer</th>
              <th className="text-right">Budget</th>
              <th className="w-48">Progress</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {projects.map((p) => (
              <tr
                key={p.id}
                data-testid={`project-row-${p.id}`}
                onClick={() => navigate(`/admin/projects/${p.id}`)}
                className="cursor-pointer"
              >
                <td>
                  <div className="flex items-center gap-2 font-semibold text-slate-900 dark:text-slate-100">
                    {p.name}
                    {p.has_active_issues && (
                      <AlertTriangle size={14} strokeWidth={2.5} className="text-rose-500" data-testid={`issue-flag-${p.id}`} />
                    )}
                  </div>
                  <div className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    <MapPin size={11} strokeWidth={2.25} /> {p.location || "—"}
                  </div>
                </td>
                <td className="text-slate-600 dark:text-slate-400">{p.client_name}</td>
                <td className="text-slate-600 dark:text-slate-400">{p.site_engineer_name || "—"}</td>
                <td className="text-right font-mono text-slate-700 dark:text-slate-300 tabular-nums">{fmtBudget(p.budget)}</td>
                <td><ProgressBar pct={p.percent_complete} /></td>
                <td><ProjectStatusBadge status={p.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile card list */}
      <div className="row-card space-y-2">
        {projects.map((p) => (
          <div
            key={p.id}
            data-testid={`project-card-${p.id}`}
            onClick={() => navigate(`/admin/projects/${p.id}`)}
            className="surface surface-hover p-4 cursor-pointer active:scale-[0.99] transition-transform"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 font-semibold text-slate-900 dark:text-slate-100">
                  <span className="truncate">{p.name}</span>
                  {p.has_active_issues && (
                    <AlertTriangle size={14} strokeWidth={2.5} className="text-rose-500 shrink-0" />
                  )}
                </div>
                <div className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400 mt-1">
                  <MapPin size={11} strokeWidth={2.25} /> {p.location || "—"}
                </div>
              </div>
              <ProjectStatusBadge status={p.status} />
            </div>
            <div className="grid grid-cols-2 gap-3 mt-3 pt-3 border-t border-slate-100 dark:border-slate-800/60">
              <div>
                <div className="text-[9px] uppercase tracking-[0.15em] text-slate-500 dark:text-slate-400 font-semibold">Client</div>
                <div className="text-sm text-slate-800 dark:text-slate-200 truncate mt-0.5">{p.client_name}</div>
              </div>
              <div>
                <div className="text-[9px] uppercase tracking-[0.15em] text-slate-500 dark:text-slate-400 font-semibold">Budget</div>
                <div className="text-sm font-mono font-semibold text-slate-800 dark:text-slate-200 tabular-nums truncate mt-0.5 num-wrap">{fmtBudget(p.budget)}</div>
              </div>
            </div>
            <div className="mt-3"><ProgressBar pct={p.percent_complete} /></div>
          </div>
        ))}
      </div>
    </>
  );
};
