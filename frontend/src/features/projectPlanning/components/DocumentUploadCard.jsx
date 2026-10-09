import { useState, useRef, useEffect } from "react";
import { toast } from "sonner";
import { Upload, X } from "lucide-react";
import { Input } from "../../../components/ui/input";
import { Label } from "../../../components/ui/label";
import { Button } from "../../../components/ui/button";
import { Switch } from "../../../components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../../components/ui/select";
import { formatApiErrorDetail } from "../../../api/client";
import { useUploadDocument } from "../hooks/useProjects";

export const DOC_CATEGORIES = ["Drawing", "Contract", "Invoice", "Approval", "Other"];

export const DocumentUploadCard = ({ projectId }) => {
  const [file, setFile] = useState(null);
  const [name, setName] = useState("");
  const [category, setCategory] = useState("Other");
  const [visible, setVisible] = useState(true);
  const fileRef = useRef(null);
  const upload = useUploadDocument();

  useEffect(() => {
    if (file) setName(file.name);
  }, [file]);

  const reset = () => {
    setFile(null); setName(""); setCategory("Other"); setVisible(true);
    if (fileRef.current) fileRef.current.value = "";
  };

  const submit = async () => {
    if (!file) return;
    const fd = new FormData();
    fd.append("file", file);
    fd.append("document_name", name.trim());
    fd.append("category", category);
    fd.append("is_client_visible", visible);
    try {
      await upload.mutateAsync({ projectId, formData: fd });
      toast.success("Document uploaded");
      reset();
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || err.message);
    }
  };

  return (
    <div className="surface p-4" data-testid="document-upload-card">
      <div className="text-[11px] uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400 font-semibold mb-3">Upload Document</div>
      <input ref={fileRef} type="file" hidden data-testid="document-file-input"
        accept=".pdf,.jpg,.jpeg,.png,.webp,.gif,.doc,.docx,.xls,.xlsx,.csv,.txt,.dwg,.zip"
        onChange={(e) => setFile(e.target.files?.[0] || null)} />
      {!file ? (
        <button data-testid="document-pick-button" onClick={() => fileRef.current?.click()}
          className="w-full border border-dashed border-slate-300 dark:border-slate-700 py-6 flex flex-col items-center gap-2 text-slate-500 dark:text-slate-400 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-400 hover:border-blue-400 transition-colors">
          <Upload size={20} strokeWidth={2.5} />
          <span className="text-xs uppercase tracking-[0.15em] font-semibold">Choose file</span>
        </button>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span className="truncate">{file.name}</span>
            <button onClick={reset} data-testid="document-clear-file" className="text-slate-500 dark:text-slate-400 hover:text-red-600 dark:text-red-400 dark:hover:text-red-400">
              <X size={14} strokeWidth={2.5} />
            </button>
          </div>
          <div>
            <Label className="text-xs uppercase tracking-[0.15em] text-slate-500 dark:text-slate-400">Document Name</Label>
            <Input data-testid="document-name-input" value={name} onChange={(e) => setName(e.target.value)}
              className="mt-1.5 bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 rounded-md" />
          </div>
          <div>
            <Label className="text-xs uppercase tracking-[0.15em] text-slate-500 dark:text-slate-400">Category</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger data-testid="document-category-select" className="mt-1.5 bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 rounded-md">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700">
                {DOC_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <Switch data-testid="document-visible-switch" checked={visible} onCheckedChange={setVisible} />
            <span className="text-xs text-slate-600 dark:text-slate-400">Visible to client</span>
          </div>
          <Button data-testid="document-upload-submit" onClick={submit} disabled={upload.isPending}
            className="w-full rounded-md bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-100 text-white dark:text-slate-900 font-bold uppercase tracking-[0.12em]">
            {upload.isPending ? "Uploading…" : "Upload"}
          </Button>
        </div>
      )}
    </div>
  );
};
