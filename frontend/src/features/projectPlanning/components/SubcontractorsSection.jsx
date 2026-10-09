import { Plus, X, Trash2 } from "lucide-react";
import { Input } from "../../../components/ui/input";
import { Label } from "../../../components/ui/label";
import { Textarea } from "../../../components/ui/textarea";
import { useState } from "react";

export const COMMON_SUB_TYPES = [
  "Electrical", "Plumbing", "Construction", "Civil Works",
  "Painting", "Interior", "Carpentry", "HVAC", "Roofing",
  "Tiling", "Waterproofing", "Landscaping",
];

const emptyItem = () => ({
  type: "", name: "", allocated_amount: "", materials: [], notes: "",
});

/**
 * Controlled sub-contractor list.
 *
 * value  : Array<{ type, name, allocated_amount, materials: string[], notes }>
 * onChange(next): fires with the new array
 * errors : Array<{ field: message }>   — indexed to match `value`
 */
export const SubcontractorsSection = ({ value = [], onChange, errors = [], compact = false }) => {
  const set = (i, patch) => onChange(value.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
  const add = () => onChange([...value, emptyItem()]);
  const remove = (i) => onChange(value.filter((_, idx) => idx !== i));

  return (
    <div className="space-y-3" data-testid="subcontractors-section">
      <div className="flex items-center justify-between">
        <Label className="text-xs uppercase tracking-[0.15em] text-slate-500 dark:text-slate-400">
          Sub-Contractors <span className="normal-case text-slate-400">· Allocate scope, budget & materials</span>
        </Label>
        <button type="button" onClick={add} data-testid="add-subcontractor-btn"
          className="inline-flex items-center gap-1 text-[11px] uppercase tracking-[0.12em] font-bold text-slate-900 dark:text-slate-100 hover:text-amber-600 dark:hover:text-amber-400 transition-colors">
          <Plus size={13} strokeWidth={3} /> Add Sub-Contractor
        </button>
      </div>

      {value.length === 0 && (
        <div className="border border-dashed border-slate-300 dark:border-slate-700 rounded-md p-4 text-center text-xs text-slate-500 dark:text-slate-400"
             data-testid="subcontractors-empty">
          No sub-contractors added yet. Click "Add Sub-Contractor" to allocate scope, budget and materials.
        </div>
      )}

      {value.map((it, i) => (
        <SubcontractorRow key={i} index={i} item={it} error={errors[i] || {}}
          onChange={(patch) => set(i, patch)} onRemove={() => remove(i)} compact={compact} />
      ))}
    </div>
  );
};

const SubcontractorRow = ({ index, item, error, onChange, onRemove, compact }) => {
  const [matDraft, setMatDraft] = useState("");
  const addMaterial = () => {
    const v = matDraft.trim();
    if (!v) return;
    if (!(item.materials || []).includes(v)) {
      onChange({ materials: [...(item.materials || []), v] });
    }
    setMatDraft("");
  };
  const removeMaterial = (m) => onChange({ materials: (item.materials || []).filter((x) => x !== m) });

  return (
    <div className="border border-slate-200 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-900/40 rounded-md p-3 relative"
         data-testid={`subcontractor-row-${index}`}>
      <button type="button" onClick={onRemove} data-testid={`remove-subcontractor-${index}`}
        className="absolute top-2 right-2 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 transition-colors"
        title="Remove sub-contractor">
        <Trash2 size={14} strokeWidth={2.25} />
      </button>

      <div className={`grid ${compact ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1 sm:grid-cols-3"} gap-3`}>
        <div className="sm:col-span-1">
          <Label className="text-[10px] uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">Type *</Label>
          <Input list={`sub-types-${index}`} data-testid={`subcontractor-type-${index}`}
            value={item.type || ""} onChange={(e) => onChange({ type: e.target.value })}
            placeholder="e.g. Electrical" className="mt-1 h-9 text-sm bg-white dark:bg-slate-900" />
          <datalist id={`sub-types-${index}`}>
            {COMMON_SUB_TYPES.map((t) => <option key={t} value={t} />)}
          </datalist>
          {error.type && <p className="text-red-600 dark:text-red-400 text-[11px] mt-1" data-testid={`subcontractor-type-error-${index}`}>{error.type}</p>}
        </div>

        <div className="sm:col-span-1">
          <Label className="text-[10px] uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">Firm / Contact</Label>
          <Input data-testid={`subcontractor-name-${index}`} value={item.name || ""}
            onChange={(e) => onChange({ name: e.target.value })} placeholder="Optional"
            className="mt-1 h-9 text-sm bg-white dark:bg-slate-900" />
        </div>

        <div className="sm:col-span-1">
          <Label className="text-[10px] uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">Allocated (₹) *</Label>
          <Input data-testid={`subcontractor-amount-${index}`} type="number" min="0" step="1"
            value={item.allocated_amount ?? ""} onChange={(e) => onChange({ allocated_amount: e.target.value })}
            placeholder="0" className="mt-1 h-9 text-sm bg-white dark:bg-slate-900" />
          {error.allocated_amount && <p className="text-red-600 dark:text-red-400 text-[11px] mt-1" data-testid={`subcontractor-amount-error-${index}`}>{error.allocated_amount}</p>}
        </div>
      </div>

      <div className="mt-3">
        <Label className="text-[10px] uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">Materials Provided</Label>
        <div className="flex flex-wrap gap-1.5 mt-1.5" data-testid={`subcontractor-materials-${index}`}>
          {(item.materials || []).map((m) => (
            <span key={m} className="inline-flex items-center gap-1 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-full px-2 py-0.5 text-[11px] text-slate-700 dark:text-slate-300"
                  data-testid={`material-chip-${index}-${m}`}>
              {m}
              <button type="button" onClick={() => removeMaterial(m)} className="hover:text-rose-500"
                data-testid={`remove-material-${index}-${m}`}>
                <X size={11} strokeWidth={2.5} />
              </button>
            </span>
          ))}
          <div className="flex gap-1">
            <Input value={matDraft} onChange={(e) => setMatDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addMaterial(); } }}
              placeholder="Add material & press Enter" data-testid={`material-draft-${index}`}
              className="h-7 w-48 text-xs bg-white dark:bg-slate-900" />
            <button type="button" onClick={addMaterial} data-testid={`material-add-${index}`}
              className="text-[10px] uppercase tracking-[0.1em] font-bold px-2 border border-slate-300 dark:border-slate-700 rounded-md hover:border-amber-500 hover:text-amber-600 dark:hover:text-amber-400">
              Add
            </button>
          </div>
        </div>
      </div>

      <div className="mt-3">
        <Label className="text-[10px] uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">Notes</Label>
        <Textarea data-testid={`subcontractor-notes-${index}`} value={item.notes || ""}
          onChange={(e) => onChange({ notes: e.target.value })} rows={2}
          className="mt-1 text-sm bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 rounded-md" />
      </div>
    </div>
  );
};

/**
 * Validate the current draft list. Returns { valid, errors, cleaned }.
 * cleaned is safe to POST (numeric amounts, trimmed strings).
 */
export const validateSubcontractors = (list) => {
  const errors = [];
  const cleaned = [];
  let valid = true;
  (list || []).forEach((it, i) => {
    const e = {};
    const type = (it.type || "").trim();
    if (!type) { e.type = "Type is required"; valid = false; }
    const amtRaw = it.allocated_amount;
    const amt = amtRaw === "" || amtRaw === null || amtRaw === undefined ? NaN : Number(amtRaw);
    if (Number.isNaN(amt) || amt < 0) {
      e.allocated_amount = "Enter a positive number";
      valid = false;
    }
    errors[i] = e;
    cleaned.push({
      type, name: (it.name || "").trim() || null,
      allocated_amount: Number.isFinite(amt) ? amt : 0,
      materials: (it.materials || []).map((m) => (m || "").trim()).filter(Boolean),
      notes: (it.notes || "").trim() || null,
    });
  });
  return { valid, errors, cleaned };
};
