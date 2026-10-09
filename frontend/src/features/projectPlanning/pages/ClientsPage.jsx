import { useState } from "react";
import { Link } from "react-router-dom";
import { Building2, Plus, ArrowRight } from "lucide-react";
import { useAuth } from "../../../context/AuthContext";
import { useClients } from "../hooks/useProjects";
import { Skeleton } from "../../../components/ui/skeleton";
import { Button } from "../../../components/ui/button";
import { ClientFormModal } from "../components/ClientFormModal";

const fmt = (n) => `₹${Number(n || 0).toLocaleString("en-IN")}`;

export default function ClientsPage() {
  const { isAdmin } = useAuth();
  const { data: clients, isLoading } = useClients();
  const [modal, setModal] = useState(false);

  return (
    <div className="p-4 sm:p-8" data-testid="clients-page">
      <div className="flex items-end justify-between mb-8 flex-wrap gap-4">
        <div>
          <div className="text-blue-600 dark:text-blue-400 text-[11px] uppercase tracking-[0.3em] font-semibold mb-1">Directory</div>
          <h1 className="font-heading font-bold text-4xl sm:text-5xl tracking-tight leading-none">Clients</h1>
        </div>
        {isAdmin && (
          <Button data-testid="add-client-button" onClick={() => setModal(true)}
            className="rounded-md bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-100 text-white dark:text-slate-900 font-bold uppercase tracking-wide">
            <Plus size={15} strokeWidth={3} /> Add Client
          </Button>
        )}
      </div>
      {isLoading ? (
        <Skeleton className="h-64 bg-slate-200 dark:bg-slate-800 rounded-md" />
      ) : (
        <>
          {/* Desktop table */}
          <div className="surface overflow-x-auto table-desktop">
            <table className="data-table" data-testid="clients-table">
              <thead>
                <tr>
                  <th>Client</th>
                  <th>Contact</th>
                  <th className="text-center">Active Projects</th>
                  <th className="text-right">Total Billed</th>
                  <th className="text-center">Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {clients?.map((c) => (
                  <tr key={c.id} data-testid={`client-row-${c.id}`}>
                    <td>
                      <Link to={`/admin/clients/${c.id}`} className="flex items-center gap-3 group">
                        <div className="w-9 h-9 bg-slate-100 dark:bg-slate-800/60 rounded-lg flex items-center justify-center text-slate-600 dark:text-slate-300">
                          <Building2 size={15} strokeWidth={2.25} />
                        </div>
                        <div>
                          <div className="font-semibold text-slate-900 dark:text-slate-100 group-hover:text-amber-600 dark:group-hover:text-amber-400 transition-colors">{c.name}</div>
                          <div className="text-xs text-slate-500 dark:text-slate-400">{c.company || "—"}</div>
                        </div>
                      </Link>
                    </td>
                    <td className="text-xs text-slate-500 dark:text-slate-400">
                      <div>{c.email || "—"}</div>
                      <div>{c.phone || "—"}</div>
                    </td>
                    <td className="text-center font-heading font-semibold text-2xl text-slate-600 dark:text-slate-400 tabular-nums">{c.project_count ?? 0}</td>
                    <td className="text-right font-mono font-semibold text-slate-900 dark:text-slate-100 tabular-nums num-wrap">{fmt(c.total_billed)}</td>
                    <td className="text-center">
                      <span className={`chip ${c.is_active ? "chip-success" : ""}`}>{c.is_active ? "Active" : "Inactive"}</span>
                    </td>
                    <td className="text-right">
                      <Link to={`/admin/clients/${c.id}`} data-testid={`client-view-${c.id}`}
                        className="inline-flex items-center gap-1 text-[11px] uppercase tracking-[0.15em] font-semibold text-slate-500 dark:text-slate-400 hover:text-amber-600 dark:hover:text-amber-400 transition-colors">
                        View <ArrowRight size={12} strokeWidth={2.5} />
                      </Link>
                    </td>
                  </tr>
                ))}
                {clients?.length === 0 && (
                  <tr><td colSpan={6} className="text-center text-slate-500 dark:text-slate-400 py-10">No clients yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="row-card space-y-2">
            {clients?.map((c) => (
              <Link key={c.id} to={`/admin/clients/${c.id}`} data-testid={`client-card-${c.id}`}
                className="surface surface-hover block p-4">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 bg-slate-100 dark:bg-slate-800/60 rounded-lg flex items-center justify-center text-slate-600 dark:text-slate-300 shrink-0">
                    <Building2 size={16} strokeWidth={2.25} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <div className="font-semibold text-slate-900 dark:text-slate-100 truncate">{c.name}</div>
                      <span className={`chip ${c.is_active ? "chip-success" : ""}`}>{c.is_active ? "Active" : "Inactive"}</span>
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400 truncate">{c.company || c.email || "—"}</div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3 mt-3 pt-3 border-t border-slate-100 dark:border-slate-800/60">
                  <div>
                    <div className="text-[9px] uppercase tracking-[0.15em] text-slate-500 dark:text-slate-400 font-semibold">Projects</div>
                    <div className="font-heading font-semibold text-lg text-slate-900 dark:text-slate-100 tabular-nums">{c.project_count ?? 0}</div>
                  </div>
                  <div>
                    <div className="text-[9px] uppercase tracking-[0.15em] text-slate-500 dark:text-slate-400 font-semibold">Total Billed</div>
                    <div className="font-mono font-semibold text-sm text-slate-800 dark:text-slate-200 tabular-nums num-wrap">{fmt(c.total_billed)}</div>
                  </div>
                </div>
              </Link>
            ))}
            {clients?.length === 0 && (
              <div className="surface p-10 text-center text-slate-500 dark:text-slate-400 text-sm">No clients yet.</div>
            )}
          </div>
        </>
      )}
      <ClientFormModal open={modal} onOpenChange={setModal} />
    </div>
  );
}
