import { useState, useEffect } from "react";
import { toast } from "sonner";
import { MapPin, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../../../components/ui/dialog";
import { Input } from "../../../components/ui/input";
import { Label } from "../../../components/ui/label";
import { Button } from "../../../components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../../components/ui/select";
import api, { formatApiErrorDetail } from "../../../api/client";
import { useCreateProject, useUpdateProject, useClients, useEngineers } from "../hooks/useProjects";
import { SubcontractorsSection, validateSubcontractors } from "./SubcontractorsSection";

const STATUSES = ["Planning", "Ongoing", "OnHold", "Completed", "Cancelled"];
const empty = { name: "", client_id: "", site_engineer_id: "", location: "", budget: "", start_date_planned: "", end_date_planned: "", status: "Planning" };

export const ProjectFormModal = ({ open, onOpenChange, project, defaultClientId, fromEstimate, onCreated }) => {
  const [form, setForm] = useState(empty);
  const [errors, setErrors] = useState({});
  const [detecting, setDetecting] = useState(false);
  const [subs, setSubs] = useState([]);
  const [subsErrors, setSubsErrors] = useState([]);
  const [existingSubs, setExistingSubs] = useState([]); // for Edit-mode diffing

  const detectLocation = () => {
    if (!navigator.geolocation) { toast.error("Geolocation is not supported by this browser — please type the address"); return; }
    setDetecting(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        try {
          const { data } = await api.get("/geo/reverse", { params: { lat: latitude, lon: longitude } });
          setForm((f) => ({ ...f, location: data.location }));
          toast.success("Location detected");
        } catch {
          setForm((f) => ({ ...f, location: `${latitude.toFixed(4)}, ${longitude.toFixed(4)}` }));
          toast.success("Location detected (coordinates)");
        } finally { setDetecting(false); }
      },
      () => { setDetecting(false); toast.error("Location access denied — please type the address manually"); },
      { timeout: 10000 }
    );
  };
  const { data: clients } = useClients(open);
  const { data: engineers } = useEngineers(open);
  const create = useCreateProject();
  const update = useUpdateProject();

  useEffect(() => {
    if (open) {
      setErrors({});
      setSubsErrors([]);
      setForm(project ? {
        name: project.name || "",
        client_id: String(project.client_id || ""),
        site_engineer_id: project.site_engineer_id ? String(project.site_engineer_id) : "",
        location: project.location || "",
        budget: project.budget ?? "",
        start_date_planned: project.start_date_planned || "",
        end_date_planned: project.end_date_planned || "",
        status: project.status || "Planning",
      } : {
        ...empty,
        client_id: fromEstimate?.client_id ? String(fromEstimate.client_id) : (defaultClientId ? String(defaultClientId) : ""),
        name: fromEstimate?.project_name || "",
        budget: fromEstimate?.total_amount ?? "",
      });
      if (project?.id) {
        // load existing subcontractors for edit
        api.get(`/projects/${project.id}/subcontractors`)
          .then((r) => {
            const list = (r.data || []).map((s) => ({
              id: s.id, type: s.type, name: s.name || "",
              allocated_amount: s.allocated_amount, materials: s.materials || [], notes: s.notes || "",
            }));
            setSubs(list);
            setExistingSubs(list.map((s) => ({ ...s })));
          })
          .catch(() => { setSubs([]); setExistingSubs([]); });
      } else {
        setSubs([]);
        setExistingSubs([]);
      }
    }
  }, [open, project, defaultClientId, fromEstimate]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const syncSubcontractors = async (projectId, prev, current, cleaned) => {
    // prev/current/cleaned are aligned by index but 'current' may contain
    // items without an id (newly added) and prev may contain items no
    // longer present (removed). Use item.id to reconcile.
    const currentIds = new Set(current.filter((s) => s.id).map((s) => s.id));
    const removed = prev.filter((s) => s.id && !currentIds.has(s.id));
    await Promise.all(removed.map((s) => api.delete(`/subcontractors/${s.id}`)));

    for (let i = 0; i < current.length; i++) {
      const item = current[i];
      const cleanedItem = cleaned[i];
      if (item.id) {
        await api.patch(`/subcontractors/${item.id}`, cleanedItem);
      } else {
        await api.post(`/projects/${projectId}/subcontractors`, cleanedItem);
      }
    }
  };

  useEffect(() => {
    if (project) return;
    setForm((f) => {
      if (!f.start_date_planned && !f.end_date_planned) return f;
      const t = new Date().toISOString().slice(0, 10);
      let s = "Planning";
      if (f.end_date_planned && f.end_date_planned < t) s = "Completed";
      else if (f.start_date_planned && f.start_date_planned <= t) s = "Ongoing";
      return f.status === s ? f : { ...f, status: s };
    });
  }, [form.start_date_planned, form.end_date_planned, project]);

  const validate = () => {
    const e = {};
    if (!form.name.trim()) e.name = "Project name is required";
    if (!form.client_id) e.client_id = "Client is required";
    if (form.start_date_planned && form.end_date_planned && form.end_date_planned < form.start_date_planned)
      e.end_date_planned = "End date must be after start date";
    if (form.budget !== "" && Number(form.budget) < 0) e.budget = "Budget must be positive";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const submit = async (ev) => {
    ev.preventDefault();
    if (!validate()) return;
    const { valid: subValid, errors: subErrs, cleaned: cleanedSubs } = validateSubcontractors(subs);
    setSubsErrors(subErrs);
    if (!subValid) {
      toast.error("Fix sub-contractor errors before saving");
      return;
    }
    const payload = {
      name: form.name.trim(),
      client_id: Number(form.client_id),
      site_engineer_id: form.site_engineer_id ? Number(form.site_engineer_id) : null,
      location: form.location || null,
      budget: form.budget !== "" ? Number(form.budget) : null,
      start_date_planned: form.start_date_planned || null,
      end_date_planned: form.end_date_planned || null,
      status: form.status,
    };
    try {
      if (project) {
        await update.mutateAsync({ id: project.id, data: payload });
        // Diff & sync sub-contractors
        await syncSubcontractors(project.id, existingSubs, subs, cleanedSubs);
        toast.success("Project updated");
      } else {
        const created = await create.mutateAsync({ ...payload, subcontractors: cleanedSubs });
        if (fromEstimate && onCreated) onCreated(created);
        else toast.success("Project created");
      }
      onOpenChange(false);
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || err.message);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 rounded-md max-w-3xl max-h-[90vh] overflow-y-auto" data-testid="project-form-modal">
        <DialogHeader>
          <DialogTitle className="font-heading text-2xl uppercase tracking-wide">
            {project ? "Edit Project" : "New Project"}
          </DialogTitle>
        </DialogHeader>
        {!project && fromEstimate && (
          <div className="border border-amber-300 dark:border-amber-500/40 bg-amber-50 dark:bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-300" data-testid="from-estimate-banner">
            These details were auto-filled from <b>Estimate #{fromEstimate.id}</b> ({fromEstimate.category}{fromEstimate.phase ? ` · ${fromEstimate.phase}` : ""}{fromEstimate.client_email ? ` · client: ${fromEstimate.client_email}` : ""}). Please verify before creating the project.
          </div>
        )}
        <form onSubmit={submit} className="space-y-4">
          <div>
            <Label className="text-xs uppercase tracking-[0.15em] text-slate-500 dark:text-slate-400">Project Name *</Label>
            <Input data-testid="project-name-input" value={form.name} onChange={(e) => set("name", e.target.value)} className="mt-1.5 bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 rounded-md" />
            {errors.name && <p className="text-red-600 dark:text-red-400 text-xs mt-1" data-testid="project-name-error">{errors.name}</p>}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-xs uppercase tracking-[0.15em] text-slate-500 dark:text-slate-400">Client *</Label>
              <Select value={form.client_id} onValueChange={(v) => set("client_id", v)}>
                <SelectTrigger data-testid="project-client-select" className="mt-1.5 bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 rounded-md">
                  <SelectValue placeholder="Select client" />
                </SelectTrigger>
                <SelectContent className="bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700">
                  {clients?.map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
              {errors.client_id && <p className="text-red-600 dark:text-red-400 text-xs mt-1">{errors.client_id}</p>}
            </div>
            <div>
              <Label className="text-xs uppercase tracking-[0.15em] text-slate-500 dark:text-slate-400">Site Engineer</Label>
              <Select value={form.site_engineer_id} onValueChange={(v) => set("site_engineer_id", v)}>
                <SelectTrigger data-testid="project-engineer-select" className="mt-1.5 bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 rounded-md">
                  <SelectValue placeholder="Assign engineer" />
                </SelectTrigger>
                <SelectContent className="bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700">
                  {engineers?.map((e) => <SelectItem key={e.id} value={String(e.id)}>{e.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-xs uppercase tracking-[0.15em] text-slate-500 dark:text-slate-400">Location</Label>
              <div className="flex gap-1.5 mt-1.5">
                <Input data-testid="project-location-input" placeholder="Auto-detect or type address" value={form.location} onChange={(e) => set("location", e.target.value)} className="bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 rounded-md" />
                <button type="button" data-testid="detect-location-button" title="Detect my location" onClick={detectLocation} disabled={detecting}
                  className="shrink-0 border border-slate-300 dark:border-slate-700 hover:border-blue-400 text-slate-500 dark:text-slate-400 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-400 px-2.5 transition-colors disabled:opacity-50">
                  {detecting ? <Loader2 size={15} strokeWidth={2.5} className="animate-spin" /> : <MapPin size={15} strokeWidth={2.5} />}
                </button>
              </div>
            </div>
            <div>
              <Label className="text-xs uppercase tracking-[0.15em] text-slate-500 dark:text-slate-400">Budget (₹)</Label>
              <Input data-testid="project-budget-input" type="number" placeholder="e.g. 250000000 = ₹25 Cr" value={form.budget} onChange={(e) => set("budget", e.target.value)} className="mt-1.5 bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 rounded-md" />
              {form.budget !== "" && !isNaN(Number(form.budget)) && Number(form.budget) > 0 && (
                <p className="text-blue-600 dark:text-blue-400 text-xs mt-1 font-semibold" data-testid="budget-preview">= ₹{Number(form.budget).toLocaleString("en-IN")}</p>
              )}
              {errors.budget && <p className="text-red-600 dark:text-red-400 text-xs mt-1">{errors.budget}</p>}
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label className="text-xs uppercase tracking-[0.15em] text-slate-500 dark:text-slate-400">Planned Start</Label>
              <Input data-testid="project-start-input" type="date" value={form.start_date_planned} onChange={(e) => set("start_date_planned", e.target.value)} className="mt-1.5 bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 rounded-md" />
            </div>
            <div>
              <Label className="text-xs uppercase tracking-[0.15em] text-slate-500 dark:text-slate-400">Planned End</Label>
              <Input data-testid="project-end-input" type="date" value={form.end_date_planned} onChange={(e) => set("end_date_planned", e.target.value)} className="mt-1.5 bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 rounded-md" />
              {errors.end_date_planned && <p className="text-red-600 dark:text-red-400 text-xs mt-1" data-testid="project-date-error">{errors.end_date_planned}</p>}
            </div>
            <div>
              <Label className="text-xs uppercase tracking-[0.15em] text-slate-500 dark:text-slate-400">Status</Label>
              <Select value={form.status} onValueChange={(v) => set("status", v)}>
                <SelectTrigger data-testid="project-status-select" className="mt-1.5 bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 rounded-md">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700">
                  {STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="border-t border-slate-200 dark:border-slate-800 pt-4">
            <SubcontractorsSection value={subs} onChange={setSubs} errors={subsErrors} />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="rounded-md border-slate-300 dark:border-slate-700" data-testid="project-form-cancel">Cancel</Button>
            <Button type="submit" disabled={create.isPending || update.isPending} data-testid="project-form-submit" className="rounded-md bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-100 text-white dark:text-slate-900 font-semibold uppercase tracking-wide">
              {project ? "Save Changes" : fromEstimate ? "Confirm & Create Project" : "Create Project"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};
