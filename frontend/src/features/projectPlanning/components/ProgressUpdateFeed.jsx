import { EyeOff, User, Pencil, Trash2 } from "lucide-react";
import { FlagBadge } from "./ProjectStatusBadge";
import { assetUrl } from "../../../api/client";

export const ProgressUpdateCard = ({ update, canManage, onEdit, onDelete }) => (
  <div
    className={`surface p-5 ${update._optimistic ? "opacity-60" : ""}`}
    data-testid={`update-card-${update.id}`}
  >
    <div className="flex flex-wrap items-center gap-3 mb-2">
      <div className="flex items-center gap-2">
        <div className="w-7 h-7 bg-slate-200 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 flex items-center justify-center">
          <User size={13} strokeWidth={2.5} className="text-blue-600 dark:text-blue-400" />
        </div>
        <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">{update.author_name || "Unknown"}</span>
      </div>
      <span className="text-xs text-slate-500 dark:text-slate-400">{update.update_date}</span>
      {update.phase_name && (
        <span className="text-[11px] uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400 border border-slate-300 dark:border-slate-700 px-2 py-0.5">
          {update.phase_name}
        </span>
      )}
      <div className="ml-auto flex items-center gap-2">
        {update.visible_to_client === false && (
          <span className="flex items-center gap-1 text-[11px] uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400 border border-slate-300 dark:border-slate-700 px-2 py-0.5" data-testid={`internal-badge-${update.id}`}>
            <EyeOff size={11} strokeWidth={2.5} /> Internal
          </span>
        )}
        <FlagBadge flag={update.status_flag} />
        {canManage && !update._optimistic && (
          <>
            <button data-testid={`edit-update-${update.id}`} title="Edit update" onClick={() => onEdit?.(update)}
              className="p-1.5 border border-slate-200 dark:border-slate-700 text-slate-400 hover:text-blue-600 hover:border-blue-400 transition-colors">
              <Pencil size={12} strokeWidth={2.5} />
            </button>
            <button data-testid={`delete-update-${update.id}`} title="Delete update" onClick={() => onDelete?.(update)}
              className="p-1.5 border border-slate-200 dark:border-slate-700 text-slate-400 hover:text-red-600 hover:border-red-400 transition-colors">
              <Trash2 size={12} strokeWidth={2.5} />
            </button>
          </>
        )}
      </div>
    </div>
    <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">{update.description}</p>
    {update.percent_progress != null && (
      <div className="flex items-center gap-2 mt-3 max-w-xs">
        <div className="flex-1 h-1.5 bg-slate-200 dark:bg-slate-800">
          <div className="h-full bg-blue-600" style={{ width: `${update.percent_progress}%` }} />
        </div>
        <span className="text-xs text-slate-500 dark:text-slate-400">{update.percent_progress}%</span>
      </div>
    )}
    {update.attachments?.length > 0 && (
      <div className="flex flex-wrap gap-2 mt-3">
        {update.attachments.map((a, i) => (
          <a key={i} href={assetUrl(a)} target="_blank" rel="noreferrer">
            <img src={assetUrl(a)} alt="attachment" className="w-28 h-20 object-cover border border-slate-300 dark:border-slate-700 hover:border-blue-400 transition-colors" />
          </a>
        ))}
      </div>
    )}
  </div>
);

export const ProgressUpdateFeed = ({ updates, canManage, onEdit, onDelete }) => {
  if (!updates?.length)
    return (
      <div className="surface p-12 text-center text-slate-500 dark:text-slate-400" data-testid="updates-empty-state">
        No progress updates yet.
      </div>
    );
  return (
    <div className="relative pl-6" data-testid="progress-update-feed">
      <div className="absolute left-2 top-2 bottom-2 w-px bg-slate-200 dark:bg-slate-800" />
      <div className="space-y-4">
        {updates.map((u) => (
          <div key={u.id} className="relative">
            <div className="absolute -left-[21px] top-6 w-2.5 h-2.5 bg-blue-600 border-2 border-white" />
            <ProgressUpdateCard update={u} canManage={canManage} onEdit={onEdit} onDelete={onDelete} />
          </div>
        ))}
      </div>
    </div>
  );
};
