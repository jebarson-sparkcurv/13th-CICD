import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, FileText, Trash2, Calculator, Send, Building2 } from "lucide-react";
import api, { assetUrl, formatApiErrorDetail } from "../../../api/client";
import { useAuth } from "../../../context/AuthContext";
import { EstimateFormModal } from "../components/EstimateFormModal";
import { SendForApprovalModal } from "../components/SendForApprovalModal";
import { ApprovalActionButtons } from "../components/ApprovalActionButtons";
import { ProjectFormModal } from "../components/ProjectFormModal";

const fmt = (n) => `₹${Number(n || 0).toLocaleString("en-IN")}`;
const STATUS_COLOR = {
  Approved: "border-emerald-300 dark:border-emerald-500/40 text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10",
  Rejected: "border-red-300 dark:border-red-500/40 text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-500/10",
  "Pending Approval": "border-amber-300 dark:border-amber-500/40 text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/10",
};

const ApprovalBadge = ({ e }) => { // eslint-disable-line no-unused-vars
  if (e.approval_state === "approved")
    return <span data-testid={`approval-badge-${e.id}`} className="inline-block border border-emerald-300 dark:border-emerald-500/40 text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10 px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] font-bold">Approved</span>;
  if (e.approval_state === "rejected")
    return <span data-testid={`approval-badge-${e.id}`} title={e.rejection_reason || ""} className="inline-block border border-red-300 dark:border-red-500/40 text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-500/10 px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] font-bold cursor-help">Rejected{e.rejection_reason ? " *" : ""}</span>;
  if (e.awaiting_response)
    return <span data-testid={`approval-badge-${e.id}`} className="inline-block border border-sky-300 dark:border-sky-500/40 text-sky-700 dark:text-sky-400 bg-sky-50 dark:bg-sky-500/10 px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] font-bold">Awaiting client response</span>;
  return <span data-testid={`approval-badge-${e.id}`} className="inline-block border border-slate-300 dark:border-slate-600 text-slate-500 dark:text-slate-400 px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] font-bold">Not sent</span>;
};

export default function EstimatesPage() {
  const [modal, setModal] = useState(false);
  const [sendModal, setSendModal] = useState({ open: false, estimate: null });
  const [projectModal, setProjectModal] = useState({ open: false, estimate: null });
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { user } = useAuth();
  const canDelete = ["Admin", "Accountant"].includes(user?.role);
  const isAdmin = user?.role === "Admin";

  const { data: estimates } = useQuery({ queryKey: ["estimates"], queryFn: () => api.get("/estimates").then((r) => r.data) });
  const { data: categories } = useQuery({ queryKey: ["estimateCategories"], queryFn: () => api.get("/estimate-categories").then((r) => r.data) });
  const { data: statuses } = useQuery({ queryKey: ["estimateStatuses"], queryFn: () => api.get("/estimate-statuses").then((r) => r.data) });

  const remove = async (e) => {
    if (!window.confirm(`Delete estimate ${e.project_name ? `for "${e.project_name}"` : `#${e.id}`}?`)) return;
    try {
      await api.delete(`/estimates/${e.id}`);
      toast.success("Estimate deleted");
      qc.invalidateQueries({ queryKey: ["estimates"] });
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || err.message);
    }
  };

  const linkProject = async (estimate, project) => {
    try {
      await api.post(`/estimates/${estimate.id}/link-project`, { project_id: project.id });
      toast.success(`Project created from Estimate #${estimate.id}`);
      qc.invalidateQueries({ queryKey: ["estimates"] });
      navigate(`/admin/projects/${project.id}`);
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail) || e.message);
    }
  };

  return (
    <div className="p-4 sm:p-8" data-testid="estimates-page">
      <div className="flex flex-wrap items-end justify-between gap-4 mb-8">
        <div>
          <div className="text-[11px] uppercase tracking-[0.25em] text-slate-500 dark:text-slate-400 font-semibold mb-1 flex items-center gap-2">
            <Calculator size={13} strokeWidth={2.5} /> Pre-construction
          </div>
          <h1 className="font-heading font-bold text-4xl sm:text-5xl tracking-tight leading-none">Estimates</h1>
        </div>
        <button data-testid="create-estimate-button" onClick={() => setModal(true)}
          className="flex items-center gap-2 bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-100 text-white dark:text-slate-900 px-4 py-2.5 text-xs uppercase tracking-[0.15em] font-bold transition-colors rounded-md">
          <Plus size={15} strokeWidth={3} /> Create Estimate
        </button>
      </div>

      <div className="surface overflow-x-auto">
        <table className="data-table" data-testid="estimates-table">
          <thead>
            <tr>
              <th>Client</th>
              <th>Project Name</th><th>Phase</th>
              <th>Category</th><th>Drawing</th>
              <th className="text-right">Total Amount</th><th className="text-center">Current Status</th>
              <th>Actions</th>
              {canDelete && <th />}
            </tr>
          </thead>
          <tbody>
            {(estimates || []).map((e) => (
              <tr key={e.id} data-testid={`estimate-row-${e.id}`}>
                <td className="font-semibold text-slate-900 dark:text-slate-100" data-testid={`estimate-client-${e.id}`}>{e.client_name || "—"}</td>
                <td className="text-slate-700 dark:text-slate-300">{e.project_name || "—"}</td>
                <td className="text-slate-600 dark:text-slate-400">{e.phase || "—"}</td>
                <td className="text-slate-600 dark:text-slate-400">{e.category}</td>
                <td>
                  {e.drawing_url ? (
                    <a href={assetUrl(e.drawing_url)} target="_blank" rel="noreferrer" data-testid={`estimate-drawing-${e.id}`} title={e.drawing_filename}>
                      {/\.pdf$/i.test(e.drawing_url) ? (
                        <span className="inline-flex items-center gap-1.5 text-rose-600 dark:text-rose-400 text-xs font-semibold hover:underline">
                          <FileText size={14} strokeWidth={2.25} /> PDF
                        </span>
                      ) : (
                        <img src={assetUrl(e.drawing_url)} alt={e.drawing_filename || "drawing"}
                          className="w-12 h-9 object-cover rounded border border-slate-200 dark:border-slate-700 hover:border-amber-400 transition-colors" />
                      )}
                    </a>
                  ) : <span className="text-slate-400 dark:text-slate-500 text-xs">—</span>}
                </td>
                <td className="text-right font-heading font-semibold text-slate-900 dark:text-slate-100 whitespace-nowrap num-wrap">{fmt(e.total_amount)}</td>
                <td className="text-center">
                  <span data-testid={`estimate-status-${e.id}`} title={e.approval_state === "rejected" ? (e.rejection_reason || "") : (e.awaiting_response ? "Awaiting client response" : "")} className={`inline-block border rounded-full px-2.5 py-0.5 text-[10px] uppercase tracking-[0.12em] font-bold whitespace-nowrap ${STATUS_COLOR[e.current_status] || "border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-800"}`}>
                    {e.current_status}
                  </span>
                </td>
                <td>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {!e.linked_project_id && (
                      <button data-testid={`send-approval-${e.id}`} onClick={() => setSendModal({ open: true, estimate: e })}
                        title={e.sent_at ? "Re-send (issues a new link, resets to pending)" : "Send for Approval"}
                        className="inline-flex items-center gap-1 rounded-md border border-sky-400/60 text-sky-600 dark:text-sky-400 hover:bg-sky-50 dark:hover:bg-sky-500/10 px-2 py-1 text-[10px] uppercase tracking-[0.1em] font-bold transition-colors">
                        <Send size={11} strokeWidth={2.5} /> {e.sent_at ? "Re-send" : "Send"}
                      </button>
                    )}
                    {!e.linked_project_id && e.approval_state !== "approved" && <ApprovalActionButtons estimate={e} onApproved={(est) => setProjectModal({ open: true, estimate: est })} />}
                    {e.approval_state === "approved" && !e.linked_project_id && isAdmin && (
                      <button data-testid={`create-project-from-estimate-${e.id}`} onClick={() => setProjectModal({ open: true, estimate: e })}
                        className="inline-flex items-center gap-1 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white px-2 py-1 text-[10px] uppercase tracking-[0.1em] font-bold transition-colors">
                        <Building2 size={11} strokeWidth={2.5} /> Create Project
                      </button>
                    )}
                    {e.linked_project_id && (
                      <Link to={`/admin/projects/${e.linked_project_id}`} data-testid={`linked-project-${e.id}`}
                        className="inline-flex items-center gap-1 rounded-md border border-emerald-400/60 text-emerald-600 dark:text-emerald-400 px-2 py-1 text-[10px] uppercase tracking-[0.1em] font-bold hover:bg-emerald-50 dark:hover:bg-emerald-500/10 transition-colors">
                        <Building2 size={11} strokeWidth={2.5} /> Project #{e.linked_project_id}
                      </Link>
                    )}
                  </div>
                </td>
                {canDelete && (
                  <td className="text-right">
                    <button data-testid={`delete-estimate-${e.id}`} title="Delete" onClick={() => remove(e)}
                      className="p-1.5 rounded-md text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-colors"><Trash2 size={14} strokeWidth={2.25} /></button>
                  </td>
                )}
              </tr>
            ))}
            {estimates && estimates.length === 0 && (
              <tr><td colSpan={canDelete ? 9 : 8} className="text-center text-slate-500 dark:text-slate-400 py-12" data-testid="estimates-empty">
                No estimates yet — click "Create Estimate" to add your first one.
              </td></tr>
            )}
          </tbody>
        </table>
      </div>

      <EstimateFormModal open={modal} onOpenChange={setModal} categories={categories} statuses={statuses} />
      <SendForApprovalModal open={sendModal.open} onOpenChange={(o) => setSendModal({ open: o, estimate: o ? sendModal.estimate : null })} estimate={sendModal.estimate} />
      <ProjectFormModal open={projectModal.open} onOpenChange={(o) => setProjectModal({ open: o, estimate: o ? projectModal.estimate : null })}
        fromEstimate={projectModal.estimate} onCreated={(project) => { setProjectModal({ open: false, estimate: null }); linkProject(projectModal.estimate, project); }} />
    </div>
  );
}
