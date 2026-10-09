import { useState } from "react";
import { toast } from "sonner";
import { Plus, Check, X } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../../components/ui/select";
import { Input } from "../../../components/ui/input";
import api, { formatApiErrorDetail } from "../../../api/client";

const ADD_NEW = "__add_new__";

export const InlineAddSelect = ({ value, onChange, options, endpoint, placeholder, addLabel, onCreated, testPrefix }) => {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const { data } = await api.post(endpoint, { name: name.trim() });
      onCreated(data);
      onChange(String(data.id));
      toast.success(`"${data.name}" added`);
      setAdding(false);
      setName("");
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail) || e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-2">
      <Select value={value} onValueChange={(v) => { if (!v) return; if (v === ADD_NEW) setAdding(true); else onChange(v); }}>
        <SelectTrigger data-testid={`${testPrefix}-select`} className="mt-1.5 bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 rounded-md">
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent className="bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700">
          <SelectItem value={ADD_NEW} className="text-blue-600 dark:text-blue-400 font-semibold">{addLabel}</SelectItem>
          {(options || []).map((o) => <SelectItem key={o.id} value={String(o.id)}>{o.name}</SelectItem>)}
        </SelectContent>
      </Select>
      {adding && (
        <div className="flex gap-2" data-testid={`${testPrefix}-inline-form`}>
          <Input autoFocus data-testid={`${testPrefix}-inline-input`} value={name} onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); save(); } }}
            placeholder="Type new name…" className="bg-white dark:bg-slate-900 border-blue-300 dark:border-blue-500/40 rounded-md h-8 text-sm" />
          <button type="button" disabled={saving || !name.trim()} data-testid={`${testPrefix}-inline-save`} onClick={save}
            className="border border-emerald-400/60 text-emerald-600 dark:text-emerald-400 px-2 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 transition-colors"><Check size={14} strokeWidth={3} /></button>
          <button type="button" data-testid={`${testPrefix}-inline-cancel`} onClick={() => { setAdding(false); setName(""); }}
            className="border border-slate-300 dark:border-slate-700 text-slate-500 dark:text-slate-400 px-2 hover:border-red-400 transition-colors"><X size={14} strokeWidth={3} /></button>
        </div>
      )}
    </div>
  );
};
