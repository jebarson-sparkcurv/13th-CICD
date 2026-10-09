import { CommitmentStatusBadge } from "./CommitmentStatusBadge";
import { Button } from "../../../components/ui/button";

const fmt = (n) => `₹${Math.abs(n).toLocaleString("en-IN")}`;

export const ChangeOrderCard = ({ co, isAdmin, onDecide }) => (
  <div className="surface p-4 flex flex-wrap items-center gap-4" data-testid={`co-card-${co.id}`}>
    <div className="font-heading font-bold text-lg text-blue-600 dark:text-blue-400">{co.co_number}</div>
    <div className="flex-1 min-w-[200px]">
      <div className="text-sm text-slate-700 dark:text-slate-300">{co.reason}</div>
      <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">Requested {co.requested_at?.slice(0, 10)}</div>
    </div>
    <div className={`font-heading font-bold text-xl ${co.amount < 0 ? "text-red-600 dark:text-red-400" : "text-slate-900 dark:text-slate-100"}`}>
      {co.amount < 0 ? "−" : "+"}{fmt(co.amount)}
    </div>
    <CommitmentStatusBadge status={co.status} />
    {isAdmin && co.status === "Pending" && (
      <div className="flex gap-2">
        <Button size="sm" data-testid={`co-approve-${co.id}`} onClick={() => onDecide(co, "Approved")}
          className="rounded-md bg-green-600 hover:bg-green-700 text-slate-900 dark:text-slate-100 text-xs uppercase tracking-wide h-8">Approve</Button>
        <Button size="sm" variant="outline" data-testid={`co-reject-${co.id}`} onClick={() => onDecide(co, "Rejected")}
          className="rounded-md border-red-500/50 text-red-600 dark:text-red-400 hover:bg-red-50 dark:bg-red-500/10 dark:hover:bg-red-500/10 text-xs uppercase tracking-wide h-8">Reject</Button>
      </div>
    )}
  </div>
);
