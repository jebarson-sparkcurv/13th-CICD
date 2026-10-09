import { useState, useEffect, useRef } from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { Copy, ExternalLink, RefreshCw, Upload, FileSpreadsheet, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../../../components/ui/dialog";
import { Input } from "../../../components/ui/input";
import { Label } from "../../../components/ui/label";
import { Switch } from "../../../components/ui/switch";
import { Button } from "../../../components/ui/button";
import api, { formatApiErrorDetail } from "../../../api/client";
import { invalidateLeadQueries } from "../hooks/useLeads";

const labelCls = "text-xs uppercase tracking-[0.15em] text-slate-500 dark:text-slate-400";
const primaryBtn = "rounded-md bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-100 text-white dark:text-slate-900 font-semibold uppercase tracking-wide";

const copy = async (text, what) => {
  try { await navigator.clipboard.writeText(text); toast.success(`${what} copied`); }
  catch { toast.error("Could not copy — select and copy manually"); }
};

/** Settings for the public enquiry form (link, embed code, on/off). */
export const LeadCaptureFormModal = ({ open, onOpenChange }) => {
  const [form, setForm] = useState(null);
  const [headline, setHeadline] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    api.get("/leads/capture-form")
      .then((r) => { setForm(r.data); setHeadline(r.data.headline || ""); })
      .catch((e) => toast.error(formatApiErrorDetail(e.response?.data?.detail)));
  }, [open]);

  const patch = async (body) => {
    setBusy(true);
    try { const { data } = await api.patch("/leads/capture-form", body); setForm(data); toast.success("Saved"); }
    catch (e) { toast.error(formatApiErrorDetail(e.response?.data?.detail)); }
    finally { setBusy(false); }
  };

  const regenerate = async () => {
    if (!window.confirm("Generate a new link? The old link and any website embeds using it will stop working.")) return;
    setBusy(true);
    try { const { data } = await api.post("/leads/capture-form/regenerate"); setForm(data); toast.success("New link generated"); }
    catch (e) { toast.error(formatApiErrorDetail(e.response?.data?.detail)); }
    finally { setBusy(false); }
  };

  const url = form ? `${window.location.origin}${form.path}` : "";
  const embed = `<iframe src="${url}?embed=1" style="width:100%;max-width:560px;height:760px;border:0" title="Enquiry form"></iframe>`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 rounded-md max-w-xl" data-testid="lead-capture-modal">
        <DialogHeader>
          <DialogTitle className="font-heading text-2xl uppercase tracking-wide">Web Enquiry Form</DialogTitle>
          <DialogDescription className="text-xs text-slate-500 dark:text-slate-400">
            Share this link on your website, Google Business profile, Instagram bio or ads. Every submission lands here as a New lead and Admins get a notification.
          </DialogDescription>
        </DialogHeader>
        {!form ? (
          <div className="py-10 flex justify-center"><Loader2 className="animate-spin text-slate-400" /></div>
        ) : (
          <div className="space-y-5">
            <div className="flex items-center justify-between surface p-3">
              <div>
                <div className="font-semibold text-sm">Accept enquiries</div>
                <div className="text-xs text-slate-500 dark:text-slate-400">{form.is_enabled ? "The form is live." : "The link shows “not available”."}</div>
              </div>
              <Switch data-testid="lead-form-enabled" checked={form.is_enabled} disabled={busy}
                onCheckedChange={(v) => patch({ is_enabled: v })} />
            </div>
            <div>
              <Label className={labelCls}>Public link</Label>
              <div className="flex gap-2 mt-1.5">
                <Input readOnly value={url} data-testid="lead-form-url" className="font-mono text-xs bg-slate-50 dark:bg-slate-950 border-slate-300 dark:border-slate-700" />
                <Button type="button" variant="outline" size="icon" onClick={() => copy(url, "Link")} aria-label="Copy link"><Copy size={15} /></Button>
                <Button type="button" variant="outline" size="icon" asChild aria-label="Open form">
                  <a href={url} target="_blank" rel="noreferrer"><ExternalLink size={15} /></a>
                </Button>
              </div>
              <a href={`https://wa.me/?text=${encodeURIComponent(`Tell us about your project and we'll get back to you: ${url}`)}`}
                target="_blank" rel="noreferrer" className="inline-block mt-2 text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:underline">
                Share on WhatsApp →
              </a>
            </div>
            <div>
              <Label className={labelCls}>Embed on your website</Label>
              <div className="relative mt-1.5">
                <pre className="text-[11px] font-mono whitespace-pre-wrap break-all bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-md p-3 pr-11">{embed}</pre>
                <Button type="button" variant="ghost" size="icon" className="absolute top-1.5 right-1.5" onClick={() => copy(embed, "Embed code")} aria-label="Copy embed code"><Copy size={14} /></Button>
              </div>
            </div>
            <div>
              <Label className={labelCls}>Headline on the form (optional)</Label>
              <div className="flex gap-2 mt-1.5">
                <Input value={headline} onChange={(e) => setHeadline(e.target.value)} maxLength={200}
                  placeholder="Get a free estimate for your dream home"
                  className="bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 rounded-md" />
                <Button type="button" disabled={busy || headline === (form.headline || "")} onClick={() => patch({ headline })} className={primaryBtn}>Save</Button>
              </div>
            </div>
            <div className="flex justify-between items-center pt-2 border-t border-slate-100 dark:border-slate-800">
              <Button type="button" variant="ghost" disabled={busy} onClick={regenerate} className="text-xs text-slate-500">
                <RefreshCw size={13} /> Generate new link
              </Button>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Done</Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

const TEMPLATE = "name,phone,email,company,location,project_type,budget,source,requirement\n" +
  "Ravi Kumar,9876543210,ravi@example.com,,Nagercoil,Residential,4500000,JustDial,3BHK house on 1800 sq.ft plot\n";

/** Bulk-import leads from a CSV (JustDial / IndiaMART / Facebook Lead Ads exports). */
export const LeadImportModal = ({ open, onOpenChange }) => {
  const qc = useQueryClient();
  const fileRef = useRef(null);
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);

  useEffect(() => { if (open) { setFile(null); setResult(null); } }, [open]);

  const downloadTemplate = () => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([TEMPLATE], { type: "text/csv" }));
    a.download = "leads_template.csv";
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const upload = async () => {
    if (!file) return;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const { data } = await api.post("/leads/import", fd);
      setResult(data);
      invalidateLeadQueries(qc);
      toast.success(`${data.created} lead${data.created === 1 ? "" : "s"} imported`);
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail) || e.message);
    } finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 rounded-md max-w-lg" data-testid="lead-import-modal">
        <DialogHeader>
          <DialogTitle className="font-heading text-2xl uppercase tracking-wide">Import Leads</DialogTitle>
          <DialogDescription className="text-xs text-slate-500 dark:text-slate-400">
            Upload a CSV with at least a name and a phone or email per row. Leads whose phone or email already exists are skipped.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <button type="button" onClick={() => fileRef.current?.click()}
            className="w-full border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-lg p-6 text-center hover:border-amber-500 transition-colors">
            <FileSpreadsheet className="mx-auto text-slate-400 mb-2" size={28} />
            <div className="text-sm font-semibold">{file ? file.name : "Choose a CSV file"}</div>
            <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">Up to 2,000 rows · 5 MB</div>
          </button>
          <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" data-testid="lead-import-file"
            onChange={(e) => { setFile(e.target.files?.[0] || null); setResult(null); }} />
          <button type="button" onClick={downloadTemplate} className="text-xs font-semibold text-amber-600 dark:text-amber-400 hover:underline">
            Download a sample CSV
          </button>
          {result && (
            <div className="surface p-3 text-sm space-y-1" data-testid="lead-import-result">
              <div><b>{result.created}</b> imported · <b>{result.skipped_duplicates}</b> duplicates skipped · <b>{result.errors.length}</b> rows with problems</div>
              {result.errors.length > 0 && (
                <ul className="text-xs text-rose-600 dark:text-rose-400 max-h-32 overflow-y-auto">
                  {result.errors.map((e, i) => <li key={i}>Row {e.row}: {e.error}</li>)}
                </ul>
              )}
            </div>
          )}
          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{result ? "Done" : "Cancel"}</Button>
            <Button type="button" disabled={!file || busy} onClick={upload} className={primaryBtn} data-testid="lead-import-submit">
              {busy ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />} Import
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
