import { useState, useEffect } from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { Copy, Mail, CheckCircle2, AlertTriangle } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../../../components/ui/dialog";
import { Input } from "../../../components/ui/input";
import { Label } from "../../../components/ui/label";
import { Button } from "../../../components/ui/button";
import api, { formatApiErrorDetail } from "../../../api/client";
import { labelCls, inputCls } from "./AddIncomeModal";

export const SendForApprovalModal = ({ open, onOpenChange, estimate }) => {
  const [email, setEmail] = useState("");
  const [result, setResult] = useState(null);
  const [sending, setSending] = useState(false);
  const qc = useQueryClient();

  useEffect(() => {
    if (open) { setEmail(estimate?.client_email || ""); setResult(null); }
  }, [open, estimate]);

  if (!estimate) return null;

  const send = async (e) => {
    e.preventDefault();
    setSending(true);
    try {
      const { data } = await api.post(`/estimates/${estimate.id}/send-approval`, { client_email: email.trim() });
      setResult(data);
      qc.invalidateQueries({ queryKey: ["estimates"] });
      if (data.email_sent) toast.success(`Approval request emailed to ${email.trim()}`);
      else toast.warning("Email could not be sent — share the links below manually");
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || err.message);
    } finally {
      setSending(false);
    }
  };

  const copy = (url, label) => { navigator.clipboard.writeText(url); toast.success(`${label} link copied`); };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 rounded-md sm:max-w-xl overflow-hidden" data-testid="send-approval-modal">
        <DialogHeader>
          <DialogTitle className="font-heading text-2xl uppercase tracking-wide">Send for Approval</DialogTitle>
          <DialogDescription className="text-xs text-slate-500 dark:text-slate-400">
            Emails the client single-use Approve / Reject links for "{estimate.project_name || `Estimate #${estimate.id}`}" (₹{Number(estimate.total_amount).toLocaleString("en-IN")}). Links expire in 14 days.
          </DialogDescription>
        </DialogHeader>
        {!result ? (
          <form onSubmit={send} className="space-y-4">
            <div>
              <Label className={labelCls}>Client Email *</Label>
              <Input data-testid="approval-client-email" type="email" required value={email}
                onChange={(e) => setEmail(e.target.value)} placeholder="client@example.com" className={inputCls} />
            </div>
            <div className="flex justify-end gap-3">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="rounded-md border-slate-300 dark:border-slate-700">Cancel</Button>
              <Button type="submit" disabled={!email.trim() || sending} data-testid="send-approval-submit"
                className="rounded-md bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-100 text-white dark:text-slate-900 font-semibold uppercase tracking-wide">
                <Mail size={14} strokeWidth={2.5} /> {sending ? "Sending…" : "Send Request"}
              </Button>
            </div>
          </form>
        ) : (
          <div className="space-y-4" data-testid="approval-sent-result">
            <div className={`flex items-start gap-2.5 border p-3 text-sm ${result.email_sent
              ? "border-emerald-300 dark:border-emerald-500/40 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-800 dark:text-emerald-300"
              : "border-amber-300 dark:border-amber-500/40 bg-amber-50 dark:bg-amber-500/10 text-amber-800 dark:text-amber-300"}`}>
              {result.email_sent ? <CheckCircle2 size={16} className="mt-0.5 shrink-0" /> : <AlertTriangle size={16} className="mt-0.5 shrink-0" />}
              {result.email_sent
                ? <span className="min-w-0 break-words">Approval request sent to <b>{result.client_email}</b>. Status is now "Awaiting client response".</span>
                : <span className="min-w-0 break-words">Email failed to send — copy the links below and share them with the client directly.
                    {result.email_error && <span className="block mt-1 text-[11px] opacity-80" data-testid="email-error-detail">Reason: {String(result.email_error).slice(0, 180)}</span>}
                  </span>}
            </div>
            {[["Approve", result.approve_url], ["Reject", result.reject_url]].map(([label, url]) => (
              <div key={label} className="flex items-center gap-2 min-w-0">
                <span className="text-[10px] uppercase tracking-[0.12em] font-bold w-14 shrink-0 text-slate-500 dark:text-slate-400">{label}</span>
                <input readOnly value={url} onFocus={(e) => e.target.select()}
                  className="flex-1 min-w-0 text-[10px] font-mono bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 px-2 py-1.5 text-slate-600 dark:text-slate-400 outline-none" />
                <button data-testid={`copy-${label.toLowerCase()}-link`} onClick={() => copy(url, label)}
                  className="p-1.5 shrink-0 border border-slate-300 dark:border-slate-700 text-slate-500 hover:text-blue-600 hover:border-blue-400 transition-colors"><Copy size={12} /></button>
              </div>
            ))}
            <div className="flex justify-end">
              <Button onClick={() => onOpenChange(false)} data-testid="approval-sent-done" className="rounded-md bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-100 text-white dark:text-slate-900 font-semibold uppercase tracking-wide">Done</Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
