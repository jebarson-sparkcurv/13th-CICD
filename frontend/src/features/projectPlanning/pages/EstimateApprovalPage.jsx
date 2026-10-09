import { useState, useEffect } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { CheckCircle2, XCircle, FileText, Loader2 } from "lucide-react";
import axios from "axios";

const API = process.env.REACT_APP_BACKEND_URL;
const fmt = (n) => `₹${Number(n || 0).toLocaleString("en-IN")}`;

export default function EstimateApprovalPage() {
  const { id, token } = useParams();
  const [searchParams] = useSearchParams();
  const initialAction = searchParams.get("action");
  const [est, setEst] = useState(null);
  const [error, setError] = useState(null);
  const [mode, setMode] = useState(initialAction === "reject" ? "reject" : "view");
  const [reason, setReason] = useState("");
  const [done, setDone] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    axios.get(`${API}/api/public/estimate-approval/${id}/${token}`)
      .then((r) => setEst(r.data))
      .catch((e) => setError(e.response?.data?.detail || "This link is invalid"));
  }, [id, token]);

  const decide = async (action) => {
    setBusy(true);
    try {
      const { data } = await axios.post(`${API}/api/public/estimate-approval/${id}/${token}`,
        { action, reason: reason.trim() || null });
      setDone(data);
    } catch (e) {
      setError(e.response?.data?.detail || "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  const Panel = ({ children }) => (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6">
      <div className="w-full max-w-lg bg-white border border-slate-200 shadow-xl" data-testid="estimate-approval-page">
        <div className="bg-slate-900 px-6 py-4 flex items-center gap-3">
          <img src="/sitera-logo.png" alt="Sitera" className="w-8 h-8 object-contain bg-white rounded p-0.5" />
          <div className="font-heading font-bold text-xl text-white tracking-tight">SITE<span className="text-amber-400">RA</span> <span className="text-slate-400 font-normal text-sm ml-2">Estimate Approval</span></div>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );

  if (error) return <Panel><div className="text-center py-8" data-testid="approval-error"><XCircle size={40} className="text-red-500 mx-auto mb-3" /><p className="text-slate-700 font-semibold">{error}</p><p className="text-slate-400 text-sm mt-2">Please contact your contractor for a new link.</p></div></Panel>;
  if (done) return (
    <Panel>
      <div className="text-center py-8" data-testid="approval-done">
        {done.approval_state === "approved"
          ? <><CheckCircle2 size={44} className="text-emerald-500 mx-auto mb-3" /><h2 className="font-heading font-bold text-2xl text-slate-900">Estimate Approved</h2><p className="text-slate-500 mt-2">Thank you! Your contractor has been notified and will proceed with "{done.project_name}".</p></>
          : <><XCircle size={44} className="text-red-500 mx-auto mb-3" /><h2 className="font-heading font-bold text-2xl text-slate-900">Estimate Rejected</h2><p className="text-slate-500 mt-2">Your response has been recorded{done.rejection_reason ? ` with your note: "${done.rejection_reason}"` : ""}. Your contractor may send a revised estimate.</p></>}
      </div>
    </Panel>
  );
  if (!est) return <Panel><div className="text-center py-10"><Loader2 size={28} className="animate-spin text-slate-400 mx-auto" /></div></Panel>;

  return (
    <Panel>
      <p className="text-sm text-slate-500 mb-4">You've been asked to review and approve this project estimate:</p>
      <div className="border border-slate-200 divide-y divide-slate-100 text-sm mb-5">
        {[["Project Name", est.project_name], ["Phase", est.phase || "—"], ["Category", est.category], ["Status", est.current_status]].map(([k, v]) => (
          <div key={k} className="flex justify-between px-4 py-2.5"><span className="text-slate-500">{k}</span><span className="font-semibold text-slate-900">{v}</span></div>
        ))}
        <div className="flex justify-between px-4 py-3 bg-slate-50"><span className="text-slate-500">Total Amount</span><span className="font-heading font-bold text-xl text-slate-900" data-testid="approval-amount">{fmt(est.total_amount)}</span></div>
      </div>
      {est.drawing_url && (
        <a href={`${API}${est.drawing_url.startsWith("/api") ? "" : "/api"}${est.drawing_url.replace(/^\/api/, "")}`} target="_blank" rel="noreferrer"
          className="inline-flex items-center gap-2 text-blue-600 text-sm font-semibold hover:underline mb-5" data-testid="approval-drawing-link">
          <FileText size={15} /> View drawing ({est.drawing_filename || "attachment"})
        </a>
      )}
      {mode === "reject" ? (
        <div className="space-y-3" data-testid="reject-confirm-panel">
          <label className="text-xs uppercase tracking-[0.15em] text-slate-500 font-semibold">Reason for rejection (optional)</label>
          <textarea data-testid="rejection-reason-input" rows={3} value={reason} onChange={(e) => setReason(e.target.value)}
            placeholder="Tell the contractor what should change…"
            className="w-full border border-slate-300 p-2.5 text-sm text-slate-900 focus:outline-none focus:border-red-400" />
          <div className="flex gap-3">
            <button data-testid="confirm-reject-button" disabled={busy} onClick={() => decide("reject")}
              className="flex-1 bg-red-600 hover:bg-red-700 text-white py-3 font-bold uppercase tracking-[0.12em] text-sm transition-colors">Confirm Rejection</button>
            <button data-testid="back-to-view-button" onClick={() => setMode("view")}
              className="px-5 border border-slate-300 text-slate-600 font-semibold text-sm hover:border-slate-400">Back</button>
          </div>
        </div>
      ) : (
        <div className="flex gap-3">
          <button data-testid="public-approve-button" disabled={busy} onClick={() => decide("approve")}
            className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white py-3 font-bold uppercase tracking-[0.12em] text-sm transition-colors">Approve Estimate</button>
          <button data-testid="public-reject-button" disabled={busy} onClick={() => setMode("reject")}
            className="flex-1 bg-red-600 hover:bg-red-700 text-white py-3 font-bold uppercase tracking-[0.12em] text-sm transition-colors">Reject</button>
        </div>
      )}
      <p className="text-[11px] text-slate-400 mt-4 text-center">This is a single-use secure link — your choice is final once confirmed.</p>
    </Panel>
  );
}
