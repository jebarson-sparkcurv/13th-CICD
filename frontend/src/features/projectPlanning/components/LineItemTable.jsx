import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";

const fmt = (n) => (n == null ? "—" : `₹${Number(n).toLocaleString("en-IN")}`);

export const LineItemTable = ({ items, columns, canWrite, onAdd, onDelete, addFields, testId }) => {
  const [draft, setDraft] = useState({});
  const [adding, setAdding] = useState(false);

  const submit = async () => {
    await onAdd(draft);
    setDraft({});
    setAdding(false);
  };

  return (
    <div className="border border-slate-200 dark:border-slate-800 overflow-x-auto" data-testid={testId}>
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-white dark:bg-slate-900 text-left text-[10px] uppercase tracking-[0.15em] text-slate-500 dark:text-slate-400">
            {columns.map((c) => <th key={c.key} className="px-3 py-2 font-semibold">{c.label}</th>)}
            {canWrite && onDelete && <th className="px-3 py-2 w-10" />}
          </tr>
        </thead>
        <tbody>
          {items?.map((it) => (
            <tr key={it.id} className="border-t border-slate-200 dark:border-slate-800">
              {columns.map((c) => (
                <td key={c.key} className="px-3 py-2 text-slate-600 dark:text-slate-400">
                  {c.money ? fmt(it[c.key]) : c.pct ? `${it[c.key]}%` : it[c.key] ?? "—"}
                </td>
              ))}
              {canWrite && onDelete && (
                <td className="px-3 py-2">
                  <button data-testid={`line-item-delete-${it.id}`} onClick={() => onDelete(it.id)}
                    className="text-slate-400 dark:text-slate-500 hover:text-red-500 transition-colors"><Trash2 size={13} strokeWidth={2.5} /></button>
                </td>
              )}
            </tr>
          ))}
          {(!items || items.length === 0) && (
            <tr><td colSpan={columns.length + 1} className="px-3 py-4 text-center text-xs text-slate-500 dark:text-slate-400">No line items yet.</td></tr>
          )}
          {adding && (
            <tr className="border-t border-amber-300 dark:border-amber-500/40 bg-white dark:bg-slate-900/80">
              {columns.map((c) => (
                <td key={c.key} className="px-2 py-1.5">
                  {addFields.includes(c.key) ? (
                    <input data-testid={`line-item-input-${c.key}`} type={c.money || c.num ? "number" : "text"}
                      value={draft[c.key] ?? ""} onChange={(e) => setDraft({ ...draft, [c.key]: e.target.value })}
                      className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-amber-500" />
                  ) : <span className="text-xs text-slate-400 dark:text-slate-500">auto</span>}
                </td>
              ))}
              <td className="px-2 py-1.5">
                <button data-testid="line-item-save" onClick={submit}
                  className="text-[10px] uppercase tracking-wide font-bold text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300">Save</button>
              </td>
            </tr>
          )}
        </tbody>
      </table>
      {canWrite && !adding && (
        <button data-testid="line-item-add" onClick={() => setAdding(true)}
          className="w-full flex items-center justify-center gap-1.5 py-2 text-[11px] uppercase tracking-[0.15em] font-semibold text-slate-500 dark:text-slate-400 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-400 border-t border-slate-200 dark:border-slate-800 transition-colors">
          <Plus size={12} strokeWidth={3} /> Add Line Item
        </button>
      )}
    </div>
  );
};
