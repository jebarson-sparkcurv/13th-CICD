import { Check, Pencil } from "lucide-react";
import { PHASE_COLORS } from "./ProjectStatusBadge";
import { PhaseCrew } from "./PhaseCrew";

export const PhaseTimeline = ({ phases, canWrite, onEdit, coByPhase }) => {
  if (!phases?.length)
    return (
      <div className="surface p-12 text-center text-slate-500 dark:text-slate-400" data-testid="phases-empty-state">
        No phases defined yet.
      </div>
    );
  return (
    <div className="overflow-x-auto pb-2" data-testid="phase-timeline">
      <div className="flex items-stretch min-w-max gap-0">
        {phases.map((ph, i) => {
          const c = PHASE_COLORS[ph.status] || PHASE_COLORS.NotStarted;
          return (
            <div key={ph.id} className="flex items-start">
              <div className="w-56">
                <div className="flex items-center">
                  <div className={`w-10 h-10 border-2 flex items-center justify-center shrink-0 ${c.dot}`} data-testid={`phase-step-${ph.id}`}>
                    {ph.status === "Completed" ? (
                      <Check size={18} strokeWidth={3} className="text-white" />
                    ) : (
                      <span className="font-heading font-bold text-white text-sm">{ph.sequence_order}</span>
                    )}
                  </div>
                  {i < phases.length - 1 && <div className="flex-1 h-px bg-slate-300 dark:bg-slate-700" />}
                </div>
                <div className="mt-3 pr-6">
                  <div className="flex items-center gap-2">
                    <span className="font-heading font-semibold text-lg leading-none text-slate-900 dark:text-slate-100">{ph.name}</span>
                    {canWrite && (
                      <button onClick={() => onEdit(ph)} data-testid={`edit-phase-${ph.id}`} className="text-slate-500 dark:text-slate-400 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-400 transition-colors">
                        <Pencil size={13} strokeWidth={2.5} />
                      </button>
                    )}
                  </div>
                  <div className={`text-[11px] uppercase tracking-[0.15em] font-semibold mt-1 ${c.text}`}>{ph.status}</div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    {ph.planned_start || "—"} → {ph.planned_end || "—"}
                  </div>
                  <div className="flex items-center gap-2 mt-2">
                    <div className="flex-1 h-1.5 bg-slate-200 dark:bg-slate-800">
                      <div className={`h-full ${ph.status === "Delayed" ? "bg-red-500" : ph.status === "Completed" ? "bg-emerald-500" : "bg-blue-600"}`} style={{ width: `${ph.percent_complete}%` }} />
                    </div>
                    <span className="text-xs text-slate-500 dark:text-slate-400">{ph.percent_complete}%</span>
                  </div>
                  {coByPhase?.[ph.id] && (
                    <div className="mt-2 inline-flex items-center gap-1.5 border border-amber-300 dark:border-amber-500/40 bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 px-2 py-1 text-[10px] uppercase tracking-[0.1em] font-bold" data-testid={`phase-variation-chip-${ph.id}`}>
                      + ₹{coByPhase[ph.id].amount.toLocaleString("en-IN")} · {coByPhase[ph.id].count} variation{coByPhase[ph.id].count !== 1 ? "s" : ""}
                    </div>
                  )}
                  {(ph.notes || []).length > 0 && (
                    <div className="mt-3 space-y-1.5" data-testid={`phase-notes-${ph.id}`}>
                      {ph.notes.map((n) => (
                        <div key={n.id} className="border-l-2 border-blue-400 bg-slate-50 dark:bg-slate-800/60 rounded-r-md px-2.5 py-1.5" data-testid={`phase-note-${n.id}`}>
                          <div className="text-xs text-slate-700 dark:text-slate-300 leading-snug">{n.text}</div>
                          <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">{n.date}{n.by ? ` · ${n.by}` : ""}</div>
                        </div>
                      ))}
                    </div>
                  )}
                  {canWrite && <PhaseCrew phaseId={ph.id} />}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
