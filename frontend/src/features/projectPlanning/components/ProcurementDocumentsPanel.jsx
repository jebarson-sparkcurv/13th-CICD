import { useState, useRef } from "react";
import { toast } from "sonner";
import { Upload, Pencil, Trash2, FileText } from "lucide-react";
import { Input } from "../../../components/ui/input";
import { Button } from "../../../components/ui/button";
import { Switch } from "../../../components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../../components/ui/select";
import { assetUrl, formatApiErrorDetail } from "../../../api/client";
import { useProcDocs, useProcDocMutation } from "../hooks/useProcurement";

const CATS = ["Contract", "Insurance", "LienWaiver", "Submittal", "Other"];

export const ProcurementDocumentsPanel = ({ type, id, canWrite, isAdmin }) => {
  const { data: docs } = useProcDocs(type, id);
  const mut = useProcDocMutation(type, id);
  const [file, setFile] = useState(null);
  const [name, setName] = useState("");
  const [category, setCategory] = useState("Other");
  const [visible, setVisible] = useState(false);
  const [search, setSearch] = useState("");
  const fileRef = useRef(null);

  const upload = async () => {
    const fd = new FormData();
    fd.append("file", file);
    fd.append("document_name", name.trim());
    fd.append("category", category);
    fd.append("is_client_visible", visible);
    try {
      await mut.mutateAsync({ url: `/procurement/${type}/${id}/documents`, data: fd });
      toast.success("Document uploaded");
      setFile(null); setName(""); setCategory("Other"); setVisible(false);
      if (fileRef.current) fileRef.current.value = "";
    } catch (e) { toast.error(formatApiErrorDetail(e.response?.data?.detail) || e.message); }
  };

  const rename = async (doc) => {
    const newName = window.prompt("Document name", doc.document_name);
    if (!newName?.trim()) return;
    await mut.mutateAsync({ method: "patch", url: `/procurement-documents/${doc.id}`, data: { document_name: newName.trim() } });
    toast.success("Renamed");
  };

  const remove = async (doc) => {
    if (!window.confirm(`Delete "${doc.document_name}"?`)) return;
    await mut.mutateAsync({ method: "delete", url: `/procurement-documents/${doc.id}` });
    toast.success("Deleted");
  };

  const filtered = (docs || []).filter((d) => !search || d.document_name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="space-y-4 max-w-3xl" data-testid="proc-documents-panel">
      {canWrite && (
        <div className="surface p-4 space-y-3" data-testid="proc-doc-upload-card">
          <input ref={fileRef} type="file" hidden data-testid="proc-doc-file-input"
            onChange={(e) => { const f = e.target.files?.[0]; setFile(f || null); if (f) setName(f.name); }} />
          {!file ? (
            <button data-testid="proc-doc-pick" onClick={() => fileRef.current?.click()}
              className="w-full border border-dashed border-slate-300 dark:border-slate-700 py-5 flex items-center justify-center gap-2 text-slate-500 dark:text-slate-400 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-400 hover:border-blue-400 transition-colors text-xs uppercase tracking-[0.15em] font-semibold">
              <Upload size={16} strokeWidth={2.5} /> Choose file
            </button>
          ) : (
            <div className="flex flex-wrap items-end gap-3">
              <div className="flex-1 min-w-[180px]">
                <div className="text-[10px] uppercase tracking-[0.15em] text-slate-500 dark:text-slate-400 mb-1">Document Name</div>
                <Input data-testid="proc-doc-name-input" value={name} onChange={(e) => setName(e.target.value)}
                  className="bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 rounded-md h-9" />
              </div>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger data-testid="proc-doc-category" className="w-32 bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 rounded-md h-9"><SelectValue /></SelectTrigger>
                <SelectContent className="bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700">
                  {CATS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
              <label className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 h-9">
                <Switch data-testid="proc-doc-visible" checked={visible} onCheckedChange={setVisible} /> Client visible
              </label>
              <Button data-testid="proc-doc-upload-submit" onClick={upload} disabled={mut.isPending}
                className="rounded-md bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-100 text-white dark:text-slate-900 font-bold uppercase tracking-wide h-9">Upload</Button>
            </div>
          )}
        </div>
      )}
      <input data-testid="proc-doc-search" value={search} onChange={(e) => setSearch(e.target.value)}
        placeholder="Search documents…"
        className="w-full max-w-xs bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-amber-500" />
      <div className="space-y-2">
        {filtered.length === 0 && <div className="border border-slate-200 dark:border-slate-800 p-6 text-center text-xs text-slate-500 dark:text-slate-400" data-testid="proc-docs-empty">No documents.</div>}
        {filtered.map((d) => (
          <div key={d.id} className="surface p-3 flex items-center gap-3" data-testid={`proc-doc-item-${d.id}`}>
            <FileText size={16} strokeWidth={2.5} className="text-blue-600 dark:text-blue-400 shrink-0" />
            <div className="min-w-0 flex-1">
              <a href={assetUrl(d.file_url)} target="_blank" rel="noreferrer"
                className="block text-sm font-semibold text-slate-900 dark:text-slate-100 truncate hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-400 transition-colors">{d.document_name}</a>
              <div className="text-[11px] text-slate-500 dark:text-slate-400">{d.uploader_name} · {d.uploaded_at?.slice(0, 10)} · {d.category}
                {!d.is_client_visible && <span className="ml-2 border border-slate-300 dark:border-slate-700 px-1 uppercase tracking-wide text-[9px]">Internal</span>}
              </div>
            </div>
            {isAdmin && (
              <div className="flex gap-1">
                <button data-testid={`proc-doc-rename-${d.id}`} onClick={() => rename(d)} className="p-1 text-slate-500 dark:text-slate-400 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-400"><Pencil size={13} strokeWidth={2.5} /></button>
                <button data-testid={`proc-doc-delete-${d.id}`} onClick={() => remove(d)} className="p-1 text-slate-500 dark:text-slate-400 hover:text-red-500"><Trash2 size={13} strokeWidth={2.5} /></button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};
