import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { FileText, ArrowRight } from "lucide-react";
import api from "../../../api/client";
import { CommitmentStatusBadge } from "../components/CommitmentStatusBadge";

const fmt = (n) => `₹${Number(n || 0).toLocaleString("en-IN")}`;

const RESPONSE_STYLE = {
  Invited: "text-amber-600 dark:text-amber-400", Viewed: "text-sky-600 dark:text-sky-400", Submitted: "text-emerald-600 dark:text-emerald-400", Declined: "text-red-600 dark:text-red-400",
};

export default function VendorPortalPage() {
  const { data: packages, isLoading } = useQuery({
    queryKey: ["vendorPackages"],
    queryFn: () => api.get("/vendor/bid-packages").then((r) => r.data),
  });

  return (
    <div className="p-4 sm:p-8" data-testid="vendor-portal-page">
      <div className="mb-8">
        <div className="text-blue-600 dark:text-blue-400 text-[11px] uppercase tracking-[0.3em] font-semibold mb-1">Vendor Portal</div>
        <h1 className="font-heading font-bold text-4xl sm:text-5xl tracking-tight leading-none">Bid Invitations</h1>
      </div>
      {isLoading && <div className="border border-slate-200 dark:border-slate-800 p-10 text-center text-slate-500 dark:text-slate-400">Loading…</div>}
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        {(packages || []).map((bp) => (
          <Link key={bp.id} to={`/portal/vendor/bid-packages/${bp.id}`} data-testid={`vendor-package-${bp.id}`}
            className="group surface p-5 hover:border-blue-400 transition-colors">
            <div className="flex items-center justify-between mb-3">
              <FileText size={18} strokeWidth={2.5} className="text-blue-600 dark:text-blue-400" />
              <CommitmentStatusBadge status={bp.status} />
            </div>
            <div className="font-heading font-semibold text-xl leading-tight">{bp.title}</div>
            <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">{bp.cost_code || "—"} · Due {bp.bid_due_date || "—"}</div>
            <div className="flex items-center gap-3 mt-3 text-xs">
              <span className={`uppercase tracking-[0.12em] font-semibold ${RESPONSE_STYLE[bp.response_status] || "text-slate-500 dark:text-slate-400"}`}>{bp.response_status}</span>
              {bp.my_bid_amount != null && <span className="ml-auto text-slate-900 dark:text-slate-100 font-semibold">{fmt(bp.my_bid_amount)}</span>}
            </div>
            <div className="flex items-center gap-1.5 mt-4 text-[11px] uppercase tracking-[0.15em] font-semibold text-slate-500 dark:text-slate-400 group-hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-400 transition-colors">
              {bp.response_status === "Submitted" ? "Update Quote" : "Submit Quote"} <ArrowRight size={13} strokeWidth={2.5} />
            </div>
          </Link>
        ))}
        {!isLoading && (packages || []).length === 0 && (
          <div className="border border-slate-200 dark:border-slate-800 p-10 text-center text-slate-500 dark:text-slate-400 md:col-span-3" data-testid="vendor-packages-empty">
            No bid invitations yet. You'll see packages here once you're invited to bid.
          </div>
        )}
      </div>
    </div>
  );
}
