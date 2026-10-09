import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Users, Plus, X } from "lucide-react";
import api, { formatApiErrorDetail } from "../../../api/client";

export const PhaseCrew = ({ phaseId }) => {
  const qc = useQueryClient();
  const [adding, setAdding] = useState(false);
  const { data: crew } = useQuery({
    queryKey: ["phaseCrew", phaseId],
    queryFn: () => api.get(`/phases/${phaseId}/employees`).then((r) => r.data),
  });
  const { data: allEmployees } = useQuery({
    queryKey: ["availableEmployees", phaseId],
    queryFn: () => api.get(`/phases/${phaseId}/available-employees`).then((r) => r.data),
    enabled: adding,
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["phaseCrew"] });
    qc.invalidateQueries({ queryKey: ["employees"] });
    qc.invalidateQueries({ queryKey: ["allEmployees"] });
    qc.invalidateQueries({ queryKey: ["availableEmployees"] });
  };
  const assign = async (empId) => {
    if (!empId) return;
    try {
      await api.post(`/phases/${phaseId}/employees`, { employee_id: Number(empId) });
      toast.success("Employee assigned to phase");
      refresh();
    } catch (e) { toast.error(formatApiErrorDetail(e.response?.data?.detail) || e.message); }
    setAdding(false);
  };
  const unassign = async (empId) => {
    try { await api.delete(`/phases/${phaseId}/employees/${empId}`); toast.success("Removed from phase"); refresh(); }
    catch (e) { toast.error(formatApiErrorDetail(e.response?.data?.detail) || e.message); }
  };

  const options = allEmployees || [];

  return (
    <div className="mt-3" data-testid={`phase-crew-${phaseId}`}>
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.15em] text-slate-500 dark:text-slate-400 font-semibold mb-1.5">
        <Users size={11} strokeWidth={2.5} /> Crew · {(crew || []).length}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {(crew || []).map((c) => (
          <span key={c.employee_id} data-testid={`crew-chip-${phaseId}-${c.employee_id}`}
            className="inline-flex items-center gap-1 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-0.5 text-[11px] text-slate-600 dark:text-slate-400">
            {c.name}{c.role_title ? ` · ${c.role_title}` : ""}
            <button data-testid={`crew-remove-${phaseId}-${c.employee_id}`} onClick={() => unassign(c.employee_id)}
              className="text-slate-500 dark:text-slate-400 hover:text-red-600 dark:text-red-400 dark:hover:text-red-400 transition-colors"><X size={11} strokeWidth={2.5} /></button>
          </span>
        ))}
        {adding ? (
          <select autoFocus data-testid={`crew-select-${phaseId}`} defaultValue=""
            onChange={(e) => assign(e.target.value)} onBlur={() => setAdding(false)}
            className="bg-white dark:bg-slate-900 border border-blue-600 text-slate-700 dark:text-slate-300 text-[11px] h-6 px-1">
            <option value="" disabled>{options.length === 0 ? "No available employees — all assigned" : "Choose employee…"}</option>
            {options.map((e) => <option key={e.id} value={e.id}>{e.name}{e.role_title ? ` (${e.role_title})` : ""}</option>)}
          </select>
        ) : (
          <button data-testid={`crew-add-${phaseId}`} onClick={() => setAdding(true)}
            className="inline-flex items-center gap-1 border border-dashed border-slate-300 dark:border-slate-700 hover:border-blue-400 text-slate-500 dark:text-slate-400 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-400 px-2 py-0.5 text-[11px] transition-colors">
            <Plus size={11} strokeWidth={2.5} /> Assign
          </button>
        )}
      </div>
    </div>
  );
};
