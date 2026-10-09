import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../../../components/ui/dialog";
import { Input } from "../../../components/ui/input";
import { Textarea } from "../../../components/ui/textarea";
import { Label } from "../../../components/ui/label";
import { Button } from "../../../components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../../components/ui/select";
import { formatApiErrorDetail } from "../../../api/client";
import { useAddPhase, useUpdatePhase, useDeletePhase } from "../hooks/useProjects";

const STATUSES = ["NotStarted", "InProgress", "Completed", "Delayed", "Blocked"];
const empty = { name: "", sequence_order: "", planned_start: "", planned_end: "", status: "NotStarted", percent_complete: 0, description: "" };

export const PhaseFormModal = ({ open, onOpenChange, projectId, phase, nextOrder }) => {
  const [form, setForm] = useState(empty);
  const [errors, setErrors] = useState({});
  const add = useAddPhase();
  const update = useUpdatePhase();
  const del = useDeletePhase();

  useEffect(() => {
    if (open) {
      setErrors({});
      setForm(phase ? {
        name: phase.name, sequence_order: phase.sequence_order,
        planned_start: phase.planned_start || "", planned_end: phase.planned_end || "",
        status: phase.status, percent_complete: phase.percent_complete, description: "",
      } : { ...empty, sequence_order: nextOrder || 1 });
    }
  }, [open, phase, nextOrder]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const validate = () => {
    const e = {};
    if (!form.name.trim()) e.name = "Phase name is required";
    if (!form.sequence_order || Number(form.sequence_order) < 1) e.sequence_order = "Order must be ≥ 1";
    const pct = Number(form.percent_complete);
    if (pct < 0 || pct > 100) e.percent_complete = "Must be 0–100";
    if (form.planned_start && form.planned_end && form.planned_end < form.planned_start)
      e.planned_end = "End must be after start";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const submit = async (ev) => {
    ev.preventDefault();
    if (!validate()) return;
    const payload = {
      name: form.name.trim(), sequence_order: Number(form.sequence_order),
      planned_start: form.planned_start || null, planned_end: form.planned_end || null,
      status: form.status, percent_complete: Number(form.percent_complete),
      ...(form.description.trim() ? { description: form.description.trim() } : {}),
    };
    try {
      if (phase) {
        await update.mutateAsync({ phaseId: phase.id, projectId, data: payload });
        toast.success("Phase updated");
      } else {
        await add.mutateAsync({ projectId, data: payload });
        toast.success("Phase added");
      }
      onOpenChange(false);
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || err.message);
    }
  };

  const remove = async () => {
    try {
      await del.mutateAsync({ phaseId: phase.id, projectId });
      toast.success("Phase removed");
      onOpenChange(false);
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || err.message);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 rounded-md max-w-md" data-testid="phase-form-modal">
        <DialogHeader>
          <DialogTitle className="font-heading text-2xl uppercase tracking-wide">
            {phase ? "Edit Phase" : "Add Phase"}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <div className="col-span-2">
              <Label className="text-xs uppercase tracking-[0.15em] text-slate-500 dark:text-slate-400">Phase Name *</Label>
              <Input data-testid="phase-name-input" value={form.name} onChange={(e) => set("name", e.target.value)} className="mt-1.5 bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 rounded-md" />
              {errors.name && <p className="text-red-600 dark:text-red-400 text-xs mt-1">{errors.name}</p>}
            </div>
            <div>
              <Label className="text-xs uppercase tracking-[0.15em] text-slate-500 dark:text-slate-400">Order *</Label>
              <Input data-testid="phase-order-input" type="number" value={form.sequence_order} onChange={(e) => set("sequence_order", e.target.value)} className="mt-1.5 bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 rounded-md" />
              {errors.sequence_order && <p className="text-red-600 dark:text-red-400 text-xs mt-1">{errors.sequence_order}</p>}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-xs uppercase tracking-[0.15em] text-slate-500 dark:text-slate-400">Planned Start</Label>
              <Input data-testid="phase-start-input" type="date" value={form.planned_start} onChange={(e) => set("planned_start", e.target.value)} className="mt-1.5 bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 rounded-md" />
            </div>
            <div>
              <Label className="text-xs uppercase tracking-[0.15em] text-slate-500 dark:text-slate-400">Planned End</Label>
              <Input data-testid="phase-end-input" type="date" value={form.planned_end} onChange={(e) => set("planned_end", e.target.value)} className="mt-1.5 bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 rounded-md" />
              {errors.planned_end && <p className="text-red-600 dark:text-red-400 text-xs mt-1">{errors.planned_end}</p>}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-xs uppercase tracking-[0.15em] text-slate-500 dark:text-slate-400">Status</Label>
              <Select value={form.status} onValueChange={(v) => { if (!v) return; setForm((f) => ({ ...f, status: v, percent_complete: v === "Completed" ? 100 : f.percent_complete })); }}>
                <SelectTrigger data-testid="phase-status-select" className="mt-1.5 bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 rounded-md"><SelectValue /></SelectTrigger>
                <SelectContent className="bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700">
                  {STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs uppercase tracking-[0.15em] text-slate-500 dark:text-slate-400">% Complete</Label>
              <Input data-testid="phase-percent-input" type="number" min="0" max="100" value={form.percent_complete} disabled={form.status === "Completed"} onChange={(e) => set("percent_complete", e.target.value)} className="mt-1.5 bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 rounded-md disabled:opacity-70" />
              {form.status === "Completed" && <p className="text-[11px] text-emerald-600 dark:text-emerald-400 mt-1" data-testid="phase-percent-locked">Auto-set to 100% for completed phases</p>}
              {errors.percent_complete && <p className="text-red-600 dark:text-red-400 text-xs mt-1">{errors.percent_complete}</p>}
            </div>
          </div>
          <div>
            <Label className="text-xs uppercase tracking-[0.15em] text-slate-500 dark:text-slate-400">Description</Label>
            <Textarea data-testid="phase-description-input" rows={3} value={form.description}
              onChange={(e) => set("description", e.target.value)}
              placeholder="Add a description note — it will be recorded below the phase with today's date and alerted"
              className="mt-1.5 bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 rounded-md" />
          </div>
          <div className="flex justify-between pt-2">
            {phase ? (
              <Button type="button" variant="destructive" onClick={remove} className="rounded-md" data-testid="phase-delete-button">Delete</Button>
            ) : <span />}
            <div className="flex gap-3">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="rounded-md border-slate-300 dark:border-slate-700">Cancel</Button>
              <Button type="submit" disabled={add.isPending || update.isPending} data-testid="phase-form-submit" className="rounded-md bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-100 text-white dark:text-slate-900 font-semibold uppercase tracking-wide">
                {phase ? "Save" : "Add Phase"}
              </Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};
