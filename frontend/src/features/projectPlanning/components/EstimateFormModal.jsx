import { useState, useEffect, useRef, useMemo } from "react";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ImagePlus, FileText, X, Plus } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../../../components/ui/dialog";
import { Input } from "../../../components/ui/input";
import { Label } from "../../../components/ui/label";
import { Button } from "../../../components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../../components/ui/select";
import api, { assetUrl, formatApiErrorDetail } from "../../../api/client";
import { InlineAddSelect } from "./InlineAddSelect";
import { labelCls, inputCls } from "./AddIncomeModal";

const empty = { client_id: "", project_name: "", phase: "", category_id: "", total_amount: "", status_id: "", estimate_date: "" };
const fmt = (n) => `₹${Number(n || 0).toLocaleString("en-IN")}`;

export const EstimateFormModal = ({ open, onOpenChange, categories, statuses }) => {
  const [form, setForm] = useState(empty);
  const [reqRows, setReqRows] = useState([]);
  const [drawing, setDrawing] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef(null);
  const qc = useQueryClient();
  const { data: clients } = useQuery({
    queryKey: ["estimateClients"],
    queryFn: () => api.get("/estimate-clients").then((r) => r.data),
    enabled: open,
  });
  const { data: reqMaster } = useQuery({
    queryKey: ["requirementsMaster"],
    queryFn: () => api.get("/requirements-master").then((r) => r.data),
    enabled: open,
  });
  const projectName = form.project_name.trim();
  const { data: phaseOpts } = useQuery({
    queryKey: ["estimatePhaseOptions", projectName],
    queryFn: () => api.get(`/estimate-phase-options?project_name=${encodeURIComponent(projectName)}`).then((r) => r.data),
    enabled: open && projectName.length > 0,
  });

  useEffect(() => {
    if (open) {
      const draft = (statuses || []).find((s) => s.name === "Draft");
      setForm({ ...empty, estimate_date: new Date().toISOString().slice(0, 10), status_id: draft ? String(draft.id) : "" });
      setDrawing(null); setReqRows([]);
    }
  }, [open, statuses]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const setRow = (i, patch) => setReqRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  const filledRows = reqRows.filter((r) => r.name.trim() && Number(r.price) > 0);
  const reqTotal = useMemo(() => filledRows.reduce((s, r) => s + Number(r.price), 0), [filledRows]);
  const hasRows = reqRows.length > 0;
  const amount = hasRows ? reqTotal : Number(form.total_amount);
  const valid = form.client_id && form.category_id && form.status_id && amount > 0;

  const onFile = async (ev) => {
    const f = ev.target.files?.[0];
    if (!f) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", f);
      const { data } = await api.post("/upload", fd);
      setDrawing({ url: data.url, filename: data.filename });
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail) || "Upload failed");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const submit = async (ev) => {
    ev.preventDefault();
    if (!valid) return;
    if (hasRows && filledRows.length !== reqRows.length) {
      toast.error("Every requirement row needs a name and a price greater than 0 (or remove the empty row)");
      return;
    }
    setSaving(true);
    try {
      const { data } = await api.post("/estimates", {
        client_id: Number(form.client_id),
        project_name: projectName || null,
        phase: form.phase.trim() || null,
        category_id: Number(form.category_id),
        drawing_url: drawing?.url || null,
        drawing_filename: drawing?.filename || null,
        total_amount: hasRows ? null : Number(form.total_amount),
        status_id: Number(form.status_id),
        estimate_date: form.estimate_date || null,
        requirements: filledRows.map((r) => ({ requirement_name: r.name.trim(), price: Number(r.price) })),
      });
      toast.success(data.synced_phase_id
        ? `Estimate created — phase "${form.phase.trim()}" synced to project "${projectName}"`
        : "Estimate created");
      qc.invalidateQueries({ queryKey: ["estimates"] });
      qc.invalidateQueries({ queryKey: ["requirementsMaster"] });
      qc.invalidateQueries({ queryKey: ["estimatePhaseOptions"] });
      if (data.synced_phase_id) qc.invalidateQueries({ queryKey: ["project"] });
      onOpenChange(false);
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail) || e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 rounded-md max-w-lg max-h-[90vh] overflow-y-auto" data-testid="estimate-form-modal">
        <DialogHeader>
          <DialogTitle className="font-heading text-2xl uppercase tracking-wide">Create Estimate</DialogTitle>
          <DialogDescription className="text-xs text-slate-500 dark:text-slate-400">
            Itemise requirements with prices — the total is calculated automatically.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <Label className={labelCls}>Client Name *</Label>
            <Select value={form.client_id} onValueChange={(v) => { if (v) set("client_id", v); }}>
              <SelectTrigger data-testid="estimate-client-select" className={inputCls}><SelectValue placeholder="Select client" /></SelectTrigger>
              <SelectContent className="bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700">
                {(clients || []).map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className={labelCls}>Project Name (optional)</Label>
            <Input data-testid="estimate-project-input" value={form.project_name} list="estimate-project-list"
              onChange={(e) => set("project_name", e.target.value)} className={inputCls} />
            {phaseOpts?.project_id && (
              <p className="text-[11px] text-emerald-600 dark:text-emerald-400 mt-1" data-testid="estimate-project-match">
                Matches existing project — new phases will be added to it automatically
              </p>
            )}
          </div>
          <div>
            <Label className={labelCls}>Phase (optional)</Label>
            <Input data-testid="estimate-phase-input" value={form.phase} list="estimate-phase-list"
              onChange={(e) => set("phase", e.target.value)} placeholder="Pick existing or type a new phase" className={inputCls} />
            <datalist id="estimate-phase-list">
              {(phaseOpts?.phases || []).map((p) => <option key={p} value={p} />)}
            </datalist>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className={labelCls}>Category *</Label>
              <InlineAddSelect value={form.category_id} onChange={(v) => set("category_id", v)}
                options={categories} endpoint="/estimate-categories" placeholder="Select category"
                addLabel="+ Add New Category" testPrefix="estimate-category"
                onCreated={(c) => qc.setQueryData(["estimateCategories"], (old) => [...(old || []), c])} />
            </div>
            <div>
              <Label className={labelCls}>Estimate Date</Label>
              <Input data-testid="estimate-date-input" type="date" value={form.estimate_date}
                onChange={(e) => set("estimate_date", e.target.value)} className={inputCls} />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between">
              <Label className={labelCls}>Requirements</Label>
              <button type="button" data-testid="estimate-add-requirement"
                onClick={() => setReqRows((rs) => [...rs, { name: "", price: "" }])}
                className="inline-flex items-center gap-1 text-[11px] uppercase tracking-[0.1em] font-bold text-blue-600 dark:text-blue-400 hover:underline">
                <Plus size={12} strokeWidth={3} /> Add Requirement
              </button>
            </div>
            <datalist id="estimate-req-list">
              {(reqMaster || []).map((r) => <option key={r.id} value={r.name} />)}
            </datalist>
            {reqRows.length === 0 ? (
              <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">
                No requirements added — you can enter a total manually below, or itemise with "+ Add Requirement".
              </p>
            ) : (
              <div className="space-y-2 mt-2" data-testid="estimate-requirement-rows">
                {reqRows.map((r, i) => (
                  <div key={i} className="flex items-center gap-2" data-testid={`estimate-req-row-${i}`}>
                    <Input value={r.name} list="estimate-req-list" placeholder="Requirement (pick or type new)"
                      onChange={(e) => setRow(i, { name: e.target.value })}
                      data-testid={`estimate-req-name-${i}`} className={`${inputCls} flex-1 mt-0`} />
                    <Input type="number" min="0" step="any" value={r.price} placeholder="Price ₹"
                      onChange={(e) => setRow(i, { price: e.target.value })}
                      data-testid={`estimate-req-price-${i}`} className={`${inputCls} w-28 mt-0`} />
                    <button type="button" data-testid={`estimate-req-remove-${i}`}
                      onClick={() => setReqRows((rs) => rs.filter((_, j) => j !== i))}
                      className="p-1.5 text-slate-400 hover:text-red-500 transition-colors shrink-0"><X size={14} /></button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <Label className={labelCls}>Drawing (JPG / PNG / PDF)</Label>
            <div className="mt-1.5 flex items-center gap-3">
              {drawing ? (
                <div className="relative group" data-testid="estimate-drawing-preview">
                  {/\.pdf$/i.test(drawing.url) ? (
                    <div className="w-24 h-20 border border-slate-300 dark:border-slate-700 flex flex-col items-center justify-center gap-1 bg-slate-50 dark:bg-slate-950">
                      <FileText size={20} className="text-red-500" />
                      <span className="text-[8px] text-slate-500 dark:text-slate-400 px-1 truncate w-full text-center">{drawing.filename}</span>
                    </div>
                  ) : (
                    <img src={assetUrl(drawing.url)} alt={drawing.filename} className="w-24 h-20 object-cover border border-slate-300 dark:border-slate-700" />
                  )}
                  <button type="button" data-testid="estimate-drawing-remove" onClick={() => setDrawing(null)}
                    className="absolute -top-1.5 -right-1.5 bg-red-600 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <X size={10} strokeWidth={3} />
                  </button>
                </div>
              ) : (
                <button type="button" data-testid="estimate-drawing-button" onClick={() => fileRef.current?.click()} disabled={uploading}
                  className="w-24 h-20 border border-dashed border-slate-300 dark:border-slate-600 flex flex-col items-center justify-center gap-1 text-slate-400 hover:text-blue-600 hover:border-blue-400 transition-colors">
                  <ImagePlus size={18} strokeWidth={2} />
                  <span className="text-[9px] uppercase tracking-wide">{uploading ? "Uploading…" : "Upload"}</span>
                </button>
              )}
              <input ref={fileRef} type="file" accept=".jpg,.jpeg,.png,.pdf" hidden onChange={onFile} data-testid="estimate-drawing-input" />
            </div>
          </div>

          <div>
            <Label className={labelCls}>Total Amount (₹) *{hasRows ? " — auto-calculated" : ""}</Label>
            {hasRows ? (
              <div data-testid="estimate-total-auto"
                className="mt-1.5 border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 rounded-md px-3 py-2 font-heading font-bold text-lg text-blue-600 dark:text-blue-400">
                {fmt(reqTotal)}
              </div>
            ) : (
              <>
                <Input data-testid="estimate-amount-input" type="number" min="0" step="any" value={form.total_amount}
                  onChange={(e) => set("total_amount", e.target.value)} className={inputCls} />
                {form.total_amount !== "" && !(Number(form.total_amount) > 0) && (
                  <p className="text-[11px] text-red-600 dark:text-red-400 mt-1" data-testid="estimate-amount-error">Enter a valid amount greater than 0</p>
                )}
              </>
            )}
          </div>
          <div>
            <Label className={labelCls}>Current Status *</Label>
            <InlineAddSelect value={form.status_id} onChange={(v) => set("status_id", v)}
              options={statuses} endpoint="/estimate-statuses" placeholder="Select status"
              addLabel="+ Add New Status" testPrefix="estimate-status"
              onCreated={(s) => qc.setQueryData(["estimateStatuses"], (old) => [...(old || []), s])} />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} data-testid="estimate-form-cancel"
              className="rounded-md border-slate-300 dark:border-slate-700">Cancel</Button>
            <Button type="submit" disabled={!valid || saving || uploading} data-testid="estimate-form-submit"
              className="rounded-md bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-100 text-white dark:text-slate-900 font-semibold uppercase tracking-wide">Save Estimate</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};
