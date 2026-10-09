import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, XCircle } from "lucide-react";
import api, { formatApiErrorDetail } from "../../../api/client";

export const ApprovalActionButtons = ({ estimate, onApproved, size = "sm" }) => {
  const qc = useQueryClient();
  const decide = async (action) => {
    const label = estimate.project_name || `Estimate #${estimate.id}`;
    let reason = null;
    if (action === "approve") {
      if (!window.confirm(`Mark estimate "${label}" as APPROVED?\n\nUse this for verbal/phone approvals — it has the same effect as the client's email approval.`)) return;
    } else {
      reason = window.prompt(`Reject estimate "${label}"? Optional reason:`);
      if (reason === null) return;
    }
    try {
      const { data } = await api.post(`/estimates/${estimate.id}/decision`, { action, reason: reason || null });
      toast.success(action === "approve" ? "Estimate approved" : "Estimate rejected");
      qc.invalidateQueries({ queryKey: ["estimates"] });
      if (action === "approve" && onApproved) onApproved(data);
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail) || e.message);
    }
  };
  return (
    <span className="inline-flex gap-1.5">
      <button data-testid={`approve-estimate-${estimate.id}`} title="Mark Approved" onClick={() => decide("approve")}
        className="inline-flex items-center gap-1 border border-emerald-400/60 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 px-2 py-1 text-[10px] uppercase tracking-[0.1em] font-bold transition-colors">
        <CheckCircle2 size={12} strokeWidth={2.5} /> Approve
      </button>
      <button data-testid={`reject-estimate-${estimate.id}`} title="Mark Rejected" onClick={() => decide("reject")}
        className="inline-flex items-center gap-1 border border-red-400/60 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 px-2 py-1 text-[10px] uppercase tracking-[0.1em] font-bold transition-colors">
        <XCircle size={12} strokeWidth={2.5} /> Reject
      </button>
    </span>
  );
};
