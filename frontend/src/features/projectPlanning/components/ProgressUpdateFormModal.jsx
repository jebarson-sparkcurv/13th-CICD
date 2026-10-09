import { useState, useEffect, useRef } from "react";
import { toast } from "sonner";
import { ImagePlus, X } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../../../components/ui/dialog";
import { Input } from "../../../components/ui/input";
import { Label } from "../../../components/ui/label";
import { Button } from "../../../components/ui/button";
import { Textarea } from "../../../components/ui/textarea";
import { Switch } from "../../../components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../../components/ui/select";
import api, { assetUrl, formatApiErrorDetail } from "../../../api/client";
import { usePostUpdate } from "../hooks/useProjects";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../../context/AuthContext";

const FLAGS = ["OnTrack", "Delayed", "Blocked"];
const empty = { phase_id: "", description: "", percent_progress: "", status_flag: "OnTrack", visible_to_client: true };

export const ProgressUpdateFormModal = ({ open, onOpenChange, projectId, phases, update }) => {
  const [form, setForm] = useState(empty);
  const [files, setFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef(null);
  const post = usePostUpdate();
  const qc = useQueryClient();
  const { user } = useAuth();
  const isEdit = !!update;

  useEffect(() => {
    if (open) {
      if (update) {
        setForm({
          phase_id: update.phase_id ? String(update.phase_id) : "",
          description: update.description || "",
          percent_progress: update.percent_progress ?? "",
          status_flag: update.status_flag || "OnTrack",
          visible_to_client: update.visible_to_client !== false,
        });
        setFiles(update.attachments || []);
      } else {
        setForm(empty); setFiles([]);
      }
      setError("");
    }
  }, [open, update]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const onFiles = async (ev) => {
    const selected = Array.from(ev.target.files || []);
    if (!selected.length) return;
    setUploading(true);
    try {
      for (const f of selected) {
        const fd = new FormData();
        fd.append("file", f);
        const { data } = await api.post("/upload", fd);
        setFiles((prev) => [...prev, data.url]);
      }
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || "Upload failed");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const submit = async (ev) => {
    ev.preventDefault();
    if (!form.description.trim()) { setError("Description is required"); return; }
    const pct = form.percent_progress === "" ? null : Number(form.percent_progress);
    if (pct != null && (pct < 0 || pct > 100)) { setError("Percent must be 0–100"); return; }
    setError("");
    const payload = {
      phase_id: form.phase_id ? Number(form.phase_id) : null,
      description: form.description.trim(),
      percent_progress: pct,
      status_flag: form.status_flag,
      attachments: files,
      visible_to_client: form.visible_to_client,
    };
    onOpenChange(false);
    try {
      if (isEdit) {
        await api.patch(`/updates/${update.id}`, payload);
        qc.invalidateQueries({ queryKey: ["updates", Number(projectId)] });
        qc.invalidateQueries({ queryKey: ["project", Number(projectId)] });
        toast.success("Update edited");
      } else {
        await post.mutateAsync({ projectId, data: payload, authorName: user?.name });
        toast.success("Update posted");
      }
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || err.message);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 rounded-md max-w-lg" data-testid="update-form-modal">
        <DialogHeader>
          <DialogTitle className="font-heading text-2xl uppercase tracking-wide">{isEdit ? "Edit Progress Update" : "Post Progress Update"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <Label className="text-xs uppercase tracking-[0.15em] text-slate-500 dark:text-slate-400">Description *</Label>
            <Textarea data-testid="update-description-input" rows={3} value={form.description} onChange={(e) => set("description", e.target.value)} className="mt-1.5 bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 rounded-md" />
            {error && <p className="text-red-600 dark:text-red-400 text-xs mt-1" data-testid="update-form-error">{error}</p>}
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label className="text-xs uppercase tracking-[0.15em] text-slate-500 dark:text-slate-400">Phase</Label>
              <Select value={form.phase_id || "project"} onValueChange={(v) => set("phase_id", v === "project" ? "" : v)}>
                <SelectTrigger data-testid="update-phase-select" className="mt-1.5 bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 rounded-md"><SelectValue /></SelectTrigger>
                <SelectContent className="bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700">
                  <SelectItem value="project">Project-level</SelectItem>
                  {phases?.map((p) => <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs uppercase tracking-[0.15em] text-slate-500 dark:text-slate-400">% Progress</Label>
              <Input data-testid="update-percent-input" type="number" min="0" max="100" value={form.percent_progress} onChange={(e) => set("percent_progress", e.target.value)} className="mt-1.5 bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 rounded-md" />
            </div>
            <div>
              <Label className="text-xs uppercase tracking-[0.15em] text-slate-500 dark:text-slate-400">Status Flag</Label>
              <Select value={form.status_flag} onValueChange={(v) => set("status_flag", v)}>
                <SelectTrigger data-testid="update-flag-select" className="mt-1.5 bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 rounded-md"><SelectValue /></SelectTrigger>
                <SelectContent className="bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700">
                  {FLAGS.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label className="text-xs uppercase tracking-[0.15em] text-slate-500 dark:text-slate-400">Photos</Label>
            <div className="flex flex-wrap gap-2 mt-1.5">
              {files.map((u, i) => (
                <div key={i} className="relative">
                  <img src={assetUrl(u)} alt="upload" className="w-20 h-16 object-cover border border-slate-300 dark:border-slate-700" />
                  <button type="button" onClick={() => setFiles(files.filter((_, j) => j !== i))} className="absolute -top-1.5 -right-1.5 bg-red-50 dark:bg-red-500/100 p-0.5">
                    <X size={10} strokeWidth={3} className="text-slate-900 dark:text-slate-100" />
                  </button>
                </div>
              ))}
              <button type="button" data-testid="update-photo-button" onClick={() => fileRef.current?.click()} disabled={uploading}
                className="w-20 h-16 border border-dashed border-slate-300 dark:border-slate-700 flex items-center justify-center text-slate-500 dark:text-slate-400 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-400 hover:border-blue-400 transition-colors">
                <ImagePlus size={18} strokeWidth={2.5} />
              </button>
              <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={onFiles} data-testid="update-file-input" />
            </div>
            {uploading && <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Uploading…</p>}
          </div>
          <div className="flex items-center gap-3">
            <Switch data-testid="update-visible-switch" checked={form.visible_to_client} onCheckedChange={(v) => set("visible_to_client", v)} />
            <span className="text-sm text-slate-600 dark:text-slate-400">Visible to client</span>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="rounded-md border-slate-300 dark:border-slate-700">Cancel</Button>
            <Button type="submit" disabled={uploading} data-testid="update-form-submit" className="rounded-md bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-100 text-white dark:text-slate-900 font-semibold uppercase tracking-wide">
              {isEdit ? "Save Changes" : "Post Update"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};
