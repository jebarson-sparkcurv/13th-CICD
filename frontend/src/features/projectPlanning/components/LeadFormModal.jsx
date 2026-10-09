import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../../../components/ui/dialog";
import { Input } from "../../../components/ui/input";
import { Label } from "../../../components/ui/label";
import { Textarea } from "../../../components/ui/textarea";
import { Button } from "../../../components/ui/button";
import api, { formatApiErrorDetail } from "../../../api/client";
import { useAuth } from "../../../context/AuthContext";
import { useLeadAssignees, invalidateLeadQueries } from "../hooks/useLeads";
import { LEAD_SOURCES, LEAD_PRIORITIES, PROJECT_TYPES, LEAD_STATUSES, statusLabel,
  toLocalInput, fromLocalInput } from "./leadConstants";

const empty = {
  name: "", phone: "", email: "", company: "", location: "", project_type: "",
  requirement: "", budget: "", source: "Walk-in", priority: "Medium", status: "New",
  assigned_to: "", next_follow_up: "",
};

const labelCls = "text-xs uppercase tracking-[0.15em] text-slate-500 dark:text-slate-400";
const inputCls = "mt-1.5 bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 rounded-md";
export const selectCls = "mt-1.5 w-full h-9 px-3 text-sm bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-md focus:outline-none focus:ring-2 focus:ring-amber-500/40";

export const LeadFormModal = ({ open, onOpenChange, lead }) => {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const { data: assignees } = useLeadAssignees();
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm(lead ? {
      name: lead.name || "", phone: lead.phone || "", email: lead.email || "",
      company: lead.company || "", location: lead.location || "",
      project_type: lead.project_type || "", requirement: lead.requirement || "",
      budget: lead.budget ?? "", source: lead.source || "Other", priority: lead.priority || "Medium",
      status: lead.status || "New", assigned_to: lead.assigned_to ?? "",
      next_follow_up: toLocalInput(lead.next_follow_up),
    } : empty);
  }, [open, lead]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const payload = (extra = {}) => {
    const body = {
      ...form,
      budget: form.budget === "" ? null : form.budget,
      assigned_to: form.assigned_to === "" ? null : Number(form.assigned_to),
      next_follow_up: fromLocalInput(form.next_follow_up),
      ...extra,
    };
    if (!isAdmin) delete body.assigned_to;
    if (!lead) delete body.status;
    return body;
  };

  const save = async (extra = {}) => {
    setSaving(true);
    try {
      const { data } = lead
        ? await api.patch(`/leads/${lead.id}`, payload(extra))
        : await api.post("/leads", payload(extra));
      toast.success(lead ? "Lead updated" : "Lead added");
      invalidateLeadQueries(qc, data.id);
      onOpenChange(false);
      if (!lead) navigate(`/admin/leads/${data.id}`);
    } catch (err) {
      const detail = err.response?.data?.detail;
      if (err.response?.status === 409 && detail?.duplicate_id) {
        toast.warning(detail.msg, {
          duration: 10000,
          action: { label: "Add anyway", onClick: () => save({ allow_duplicate: true }) },
          cancel: { label: "Open existing", onClick: () => { onOpenChange(false); navigate(`/admin/leads/${detail.duplicate_id}`); } },
        });
      } else {
        toast.error(formatApiErrorDetail(detail) || err.message);
      }
    } finally { setSaving(false); }
  };

  const submit = (ev) => {
    ev.preventDefault();
    if (!form.name.trim()) { toast.error("Name is required"); return; }
    if (!form.phone.trim() && !form.email.trim()) { toast.error("Add a phone number or an email"); return; }
    save();
  };

  const field = (k, label, props = {}) => (
    <div>
      <Label className={labelCls}>{label}</Label>
      <Input data-testid={`lead-${k}-input`} value={form[k]} onChange={(e) => set(k, e.target.value)} className={inputCls} {...props} />
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 rounded-md max-w-2xl max-h-[92vh] overflow-y-auto" data-testid="lead-form-modal">
        <DialogHeader>
          <DialogTitle className="font-heading text-2xl uppercase tracking-wide">{lead ? "Edit Lead" : "New Lead"}</DialogTitle>
          <DialogDescription className="text-xs text-slate-500 dark:text-slate-400">
            {lead ? "Update the enquiry details." : "Capture a new enquiry. Phone or email is required."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {field("name", "Name *", { autoFocus: !lead })}
            {field("phone", "Phone", { type: "tel", inputMode: "tel" })}
            {field("email", "Email", { type: "email" })}
            {field("company", "Company")}
            {field("location", "Location / Site")}
            <div>
              <Label className={labelCls}>Project Type</Label>
              <input list="lead-project-types" data-testid="lead-project_type-input" value={form.project_type}
                onChange={(e) => set("project_type", e.target.value)} className={`${inputCls} w-full h-9 px-3 text-sm border`} />
              <datalist id="lead-project-types">{PROJECT_TYPES.map((t) => <option key={t} value={t} />)}</datalist>
            </div>
            {field("budget", "Budget (₹)", { type: "number", min: 0, step: "any", inputMode: "decimal" })}
            <div>
              <Label className={labelCls}>Source</Label>
              <select data-testid="lead-source-select" value={form.source} onChange={(e) => set("source", e.target.value)} className={selectCls}>
                {LEAD_SOURCES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <Label className={labelCls}>Priority</Label>
              <select data-testid="lead-priority-select" value={form.priority} onChange={(e) => set("priority", e.target.value)} className={selectCls}>
                {LEAD_PRIORITIES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            {lead && (
              <div>
                <Label className={labelCls}>Status</Label>
                <select data-testid="lead-status-select" value={form.status} onChange={(e) => set("status", e.target.value)} className={selectCls}>
                  {LEAD_STATUSES.filter((s) => s !== "Lost").map((s) => <option key={s} value={s}>{statusLabel(s)}</option>)}
                  {form.status === "Lost" && <option value="Lost">Lost</option>}
                </select>
              </div>
            )}
            {isAdmin && (
              <div>
                <Label className={labelCls}>Assigned To</Label>
                <select data-testid="lead-assignee-select" value={form.assigned_to} onChange={(e) => set("assigned_to", e.target.value)} className={selectCls}>
                  <option value="">Unassigned</option>
                  {(assignees || []).map((u) => <option key={u.id} value={u.id}>{u.name} · {u.role}</option>)}
                </select>
              </div>
            )}
            <div>
              <Label className={labelCls}>Next Follow-up</Label>
              <Input data-testid="lead-follow-up-input" type="datetime-local" value={form.next_follow_up}
                onChange={(e) => set("next_follow_up", e.target.value)} className={inputCls} />
            </div>
          </div>
          <div>
            <Label className={labelCls}>Requirement</Label>
            <Textarea data-testid="lead-requirement-input" rows={3} value={form.requirement}
              onChange={(e) => set("requirement", e.target.value)} placeholder="e.g. 3BHK villa on 2400 sq.ft plot, wants to start before March"
              className={inputCls} />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="rounded-md border-slate-300 dark:border-slate-700">Cancel</Button>
            <Button type="submit" disabled={saving} data-testid="lead-form-submit"
              className="rounded-md bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-100 text-white dark:text-slate-900 font-semibold uppercase tracking-wide">
              {lead ? "Save Changes" : "Add Lead"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};
