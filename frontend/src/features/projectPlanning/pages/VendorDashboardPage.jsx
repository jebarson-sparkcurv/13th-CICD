import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { ShoppingCart, FileText, IndianRupee, Truck, Receipt, CalendarClock, Package, Award } from "lucide-react";
import api from "../../../api/client";
import { CommitmentStatusBadge } from "../components/CommitmentStatusBadge";

const fmt = (n) => `₹${Number(n || 0).toLocaleString("en-IN")}`;

const Card = ({ label, value, sub, icon: Icon, accent, testId }) => (
  <div className="surface rounded-lg p-5" data-testid={testId}>
    <div className="flex items-center justify-between">
      <span className="text-[11px] uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400 font-semibold">{label}</span>
      <Icon size={16} strokeWidth={2.5} className={accent} />
    </div>
    <div className="font-heading font-bold text-3xl mt-3 leading-none">{value}</div>
    {sub && <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-2">{sub}</div>}
  </div>
);

const Section = ({ title, children, testId }) => (
  <div data-testid={testId}>
    <div className="text-[11px] uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400 font-semibold mb-3">{title}</div>
    {children}
  </div>
);

const Empty = ({ text }) => (
  <div className="border border-slate-200 dark:border-slate-800 rounded-md p-6 text-center text-xs text-slate-500 dark:text-slate-400">{text}</div>
);

export default function VendorDashboardPage() {
  const { data: dash } = useQuery({
    queryKey: ["vendorDashboard"],
    queryFn: () => api.get("/vendor/dashboard").then((r) => r.data),
  });

  if (!dash) return <div className="p-4 sm:p-8 text-sm text-slate-500" data-testid="vendor-dashboard-loading">Loading dashboard…</div>;
  const o = dash.overview;
  const dp = dash.delivery_performance;

  return (
    <div className="p-4 sm:p-8" data-testid="vendor-dashboard">
      <div className="mb-8">
        <div className="text-blue-600 dark:text-blue-400 text-[11px] uppercase tracking-[0.3em] font-semibold mb-1">Vendor Portal</div>
        <h1 className="font-heading font-bold text-4xl sm:text-5xl tracking-tight leading-none">Dashboard</h1>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <Card label="Overall Portfolio" value={fmt(o.total_committed)} sub={`${o.purchase_orders} POs · ${o.subcontracts} subcontracts`} icon={IndianRupee} accent="text-blue-600 dark:text-blue-400" testId="vd-portfolio" />
        <Card label="Bids" value={`${o.bids_awarded} / ${o.bids_submitted}`} sub={`Awarded / submitted · ${o.open_bid_invites} open invites`} icon={Award} accent="text-amber-600 dark:text-amber-400" testId="vd-bids" />
        <Card label="Billed" value={fmt(o.total_billed)} sub={`Paid: ${fmt(o.total_paid)}`} icon={Receipt} accent="text-emerald-600 dark:text-emerald-400" testId="vd-billed" />
        <Card label="Payment Pending" value={fmt(o.payment_pending)} icon={CalendarClock} accent="text-red-600 dark:text-red-400" testId="vd-pending" />
      </div>

      <div className="grid lg:grid-cols-2 gap-6 mb-6">
        <Section title="Purchase Order Status" testId="vd-po-section">
          {dash.purchase_orders.length === 0 && dash.subcontracts.length === 0 ? <Empty text="No purchase orders or subcontracts yet." /> : (
            <div className="space-y-2">
              {dash.purchase_orders.map((p) => (
                <div key={`po-${p.id}`} className="flex items-center gap-3 surface rounded-md p-3" data-testid={`vd-po-${p.id}`}>
                  <ShoppingCart size={15} strokeWidth={2.5} className="text-blue-600 dark:text-blue-400 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold truncate">{p.po_number}</div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">{p.project_name}</div>
                  </div>
                  <span className="text-sm font-semibold">{fmt(p.amount)}</span>
                  <CommitmentStatusBadge status={p.status} />
                </div>
              ))}
              {dash.subcontracts.map((s) => (
                <div key={`sc-${s.id}`} className="flex items-center gap-3 surface rounded-md p-3" data-testid={`vd-sc-${s.id}`}>
                  <FileText size={15} strokeWidth={2.5} className="text-purple-600 dark:text-purple-400 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold truncate">{s.contract_number}</div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">{s.project_name}</div>
                  </div>
                  <span className="text-sm font-semibold">{fmt(s.amount)}</span>
                  <CommitmentStatusBadge status={s.status} />
                </div>
              ))}
            </div>
          )}
        </Section>

        <Section title={`Delivery Performance · ${dp.total} deliveries`} testId="vd-delivery-section">
          {dp.total === 0 ? <Empty text="No deliveries recorded yet." /> : (
            <div className="grid grid-cols-3 gap-3 mb-3">
              {Object.entries(dp.by_status).map(([st, n]) => (
                <div key={st} className="surface rounded-md p-3 text-center" data-testid={`vd-dp-${st}`}>
                  <div className="font-heading font-bold text-2xl">{n}</div>
                  <div className="text-[10px] uppercase tracking-wide text-slate-500 dark:text-slate-400 font-semibold mt-1">{st}</div>
                </div>
              ))}
            </div>
          )}
          <div className="text-[11px] uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400 font-semibold mb-2 mt-4">Material Supply (recent)</div>
          {dash.material_supply.length === 0 ? <Empty text="No material supplied yet." /> : (
            <div className="space-y-1.5">
              {dash.material_supply.slice(0, 6).map((m, i) => (
                <div key={i} className="flex items-center gap-3 border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-md px-3 py-2 text-sm" data-testid={`vd-supply-${i}`}>
                  <Package size={13} strokeWidth={2.5} className="text-slate-400 shrink-0" />
                  <span className="truncate flex-1">{m.item_description}</span>
                  <span className="text-xs text-slate-500 dark:text-slate-400">{m.quantity_delivered} · {m.delivery_date || "—"}</span>
                  <CommitmentStatusBadge status={m.status} />
                </div>
              ))}
            </div>
          )}
        </Section>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <Section title="Invoices & Payments (Pay Applications)" testId="vd-invoices-section">
          {dash.invoices.length === 0 ? <Empty text="No pay applications yet." /> : (
            <div className="space-y-2">
              {dash.invoices.map((inv) => (
                <div key={inv.id} className="flex items-center gap-3 surface rounded-md p-3" data-testid={`vd-inv-${inv.id}`}>
                  <Receipt size={15} strokeWidth={2.5} className="text-emerald-600 dark:text-emerald-400 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold">App #{inv.application_number} · {inv.reference}</div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400">Period end {inv.period_end || "—"}</div>
                  </div>
                  <span className="text-sm font-semibold">{fmt(inv.amount_due)}</span>
                  <CommitmentStatusBadge status={inv.status} />
                </div>
              ))}
            </div>
          )}
        </Section>

        <Section title="Upcoming Deliveries" testId="vd-upcoming-section">
          {dash.upcoming_deliveries.length === 0 ? <Empty text="No upcoming deliveries scheduled." /> : (
            <div className="space-y-2">
              {dash.upcoming_deliveries.map((u, i) => (
                <div key={i} className="flex items-center gap-3 border border-amber-300 dark:border-amber-500/40 bg-amber-50 dark:bg-amber-500/10 rounded-md p-3" data-testid={`vd-upcoming-${i}`}>
                  <Truck size={15} strokeWidth={2.5} className="text-amber-600 dark:text-amber-400 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold">{u.po_number}</div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">{u.project_name}</div>
                  </div>
                  <span className="text-xs font-semibold text-amber-700 dark:text-amber-400">Due {u.expected_delivery_date}</span>
                </div>
              ))}
            </div>
          )}
        </Section>
      </div>

      <div className="mt-8">
        <Link to="/portal/vendor/bid-packages" data-testid="vd-bids-link"
          className="inline-flex items-center gap-2 border border-slate-300 dark:border-slate-700 rounded-md px-4 py-2.5 text-xs uppercase tracking-[0.15em] font-semibold text-slate-600 dark:text-slate-300 hover:border-blue-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
          <FileText size={14} strokeWidth={2.5} /> View Bid Invitations {o.open_bid_invites > 0 && `(${o.open_bid_invites} open)`}
        </Link>
      </div>
    </div>
  );
}
