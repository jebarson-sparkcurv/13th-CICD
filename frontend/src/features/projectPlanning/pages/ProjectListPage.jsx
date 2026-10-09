import { useState, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { Plus, Search, Building2, Activity, AlertTriangle, IndianRupee } from "lucide-react";
import debounce from "lodash/debounce";
import { useProjects, useClients, useEngineers, useDashboardSummary, useBudgetBreakdown } from "../hooks/useProjects";
import { ProjectTable } from "../components/ProjectTable";
import { ProjectFormModal } from "../components/ProjectFormModal";
import { DashboardStatCard } from "../components/DashboardStatCard";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../../../components/ui/dialog";
import { Skeleton } from "../../../components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../../components/ui/select";
import { Button } from "../../../components/ui/button";
import { useAuth } from "../../../context/AuthContext";

const STATUSES = ["Planning", "Ongoing", "OnHold", "Completed", "Cancelled"];
const PAGE_SIZE = 10;
const fmtCr = (b) => `₹${(b || 0).toLocaleString("en-IN")}`;

export default function ProjectListPage() {
  const { isAdmin, canWrite, user } = useAuth();
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState(params.get("search") || "");
  const [modalOpen, setModalOpen] = useState(false);
  const [budgetOpen, setBudgetOpen] = useState(false);
  const { data: summary } = useDashboardSummary();
  const { data: budgetProjects } = useBudgetBreakdown(budgetOpen);

  const filters = {
    limit: PAGE_SIZE,
    offset: Number(params.get("offset") || 0),
  };
  if (params.get("client_id")) filters.client_id = params.get("client_id");
  if (params.get("status")) filters.status = params.get("status");
  if (params.get("site_engineer_id")) filters.site_engineer_id = params.get("site_engineer_id");
  if (params.get("search")) filters.search = params.get("search");
  if (params.get("has_issues")) filters.has_issues = params.get("has_issues");

  const { data, isLoading, isError } = useProjects(filters);
  const { data: clients } = useClients(canWrite);
  const { data: engineers } = useEngineers(canWrite);

  const setParam = (key, value) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value); else next.delete(key);
    next.delete("offset");
    setParams(next);
  };

  const debouncedSearch = useMemo(() => debounce((v) => setParam("search", v), 350), [params]); // eslint-disable-line

  const total = data?.total || 0;
  const offset = filters.offset;

  const ongoingActive = params.get("status") === "Ongoing" && !params.get("has_issues");
  const issuesActive = params.get("has_issues") === "true";
  const totalActive = !params.get("status") && !params.get("has_issues") && !params.get("client_id") && !params.get("site_engineer_id") && !params.get("search");

  const clickTotal = () => { setSearch(""); setParams(new URLSearchParams()); };
  const clickOngoing = () => {
    const n = new URLSearchParams(params);
    n.delete("has_issues"); n.delete("offset");
    if (ongoingActive) n.delete("status"); else n.set("status", "Ongoing");
    setParams(n);
  };
  const clickCompleted = () => {
    const n = new URLSearchParams(params);
    n.delete("has_issues"); n.delete("offset");
    if (params.get("status") === "Completed") n.delete("status"); else n.set("status", "Completed");
    setParams(n);
  };
  const clickIssues = () => {
    const n = new URLSearchParams(params);
    n.delete("status"); n.delete("offset");
    if (issuesActive) n.delete("has_issues"); else n.set("has_issues", "true");
    setParams(n);
  };

  return (
    <div className="p-4 sm:p-8" data-testid="project-list-page">
      <div className="flex items-end justify-between mb-8 flex-wrap gap-4">
        <div>
          <div className="text-blue-600 dark:text-blue-400 text-[11px] uppercase tracking-[0.3em] font-semibold mb-1">Project Planning</div>
          <h1 className="font-heading font-bold text-4xl sm:text-5xl tracking-tight leading-none">Projects</h1>
        </div>
        {isAdmin && (
          <Button data-testid="new-project-button" onClick={() => setModalOpen(true)}
            className="rounded-md bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-100 text-white dark:text-slate-900 font-bold uppercase tracking-[0.12em]">
            <Plus size={16} strokeWidth={3} /> New Project
          </Button>
        )}
      </div>

      <div className="kpi-scroller mb-6" style={{ ["--kpi-cols"]: 2, ["--kpi-cols-lg"]: 5 }} data-testid="dashboard-stat-cards">
        <DashboardStatCard label="Total Projects" value={summary?.total_projects ?? "—"} icon={Building2}
          isActive={totalActive} onClick={clickTotal} variant="default" testId="stat-card-total" />
        <DashboardStatCard label="Ongoing" value={summary?.ongoing ?? "—"} icon={Activity}
          isActive={ongoingActive} onClick={clickOngoing} variant="success" testId="stat-card-ongoing" />
        <DashboardStatCard label="Completed" value={summary?.completed ?? "—"} icon={Activity}
          isActive={params.get("status") === "Completed"} onClick={clickCompleted} variant="info" testId="stat-card-completed" />
        <DashboardStatCard label="With Issues" value={summary?.with_issues ?? "—"} icon={AlertTriangle}
          isActive={issuesActive} onClick={clickIssues} variant="warning" testId="stat-card-issues" />
        <DashboardStatCard label="Total Budget" value={summary ? fmtCr(summary.total_budget) : "—"} icon={IndianRupee}
          isActive={budgetOpen} onClick={() => setBudgetOpen(true)} variant="info" testId="stat-card-budget" />
      </div>

      <div className="flex flex-wrap gap-3 mb-5">
        <div className="relative flex-1 min-w-[220px] max-w-sm">
          <Search size={15} strokeWidth={2.5} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 dark:text-slate-400" />
          <input data-testid="project-search-input" value={search}
            onChange={(e) => { setSearch(e.target.value); debouncedSearch(e.target.value); }}
            placeholder="Search projects…"
            className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500" />
        </div>
        {user?.role !== "Client" && (
          <Select value={params.get("client_id") || "all"} onValueChange={(v) => setParam("client_id", v === "all" ? "" : v)}>
            <SelectTrigger data-testid="filter-client-select" className="w-44 bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 rounded-md">
              <SelectValue placeholder="All Clients" />
            </SelectTrigger>
            <SelectContent className="bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700">
              <SelectItem value="all">All Clients</SelectItem>
              {clients?.map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        <Select value={params.get("status") || "all"} onValueChange={(v) => setParam("status", v === "all" ? "" : v)}>
          <SelectTrigger data-testid="filter-status-select" className="w-40 bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 rounded-md">
            <SelectValue placeholder="All Statuses" />
          </SelectTrigger>
          <SelectContent className="bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700">
            <SelectItem value="all">All Statuses</SelectItem>
            {STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
        {user?.role !== "Client" && (
          <Select value={params.get("site_engineer_id") || "all"} onValueChange={(v) => setParam("site_engineer_id", v === "all" ? "" : v)}>
            <SelectTrigger data-testid="filter-engineer-select" className="w-44 bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 rounded-md">
              <SelectValue placeholder="All Engineers" />
            </SelectTrigger>
            <SelectContent className="bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700">
              <SelectItem value="all">All Engineers</SelectItem>
              {engineers?.map((e) => <SelectItem key={e.id} value={String(e.id)}>{e.name}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-2" data-testid="projects-loading">
          {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-14 bg-white dark:bg-slate-900 rounded-md" />)}
        </div>
      ) : isError ? (
        <div className="border border-red-200 dark:border-red-500/30 bg-red-50 dark:bg-red-500/10 p-8 text-center text-red-600 dark:text-red-400" data-testid="projects-error">
          Failed to load projects. Please try again.
        </div>
      ) : (
        <>
          <ProjectTable projects={data?.items} />
          {total > PAGE_SIZE && (
            <div className="flex items-center justify-between mt-4" data-testid="pagination">
              <span className="text-xs text-slate-500 dark:text-slate-400">
                Showing {offset + 1}–{Math.min(offset + PAGE_SIZE, total)} of {total}
              </span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={offset === 0} data-testid="pagination-prev"
                  onClick={() => { const n = new URLSearchParams(params); n.set("offset", Math.max(0, offset - PAGE_SIZE)); setParams(n); }}
                  className="rounded-md border-slate-300 dark:border-slate-700">Prev</Button>
                <Button variant="outline" size="sm" disabled={offset + PAGE_SIZE >= total} data-testid="pagination-next"
                  onClick={() => { const n = new URLSearchParams(params); n.set("offset", offset + PAGE_SIZE); setParams(n); }}
                  className="rounded-md border-slate-300 dark:border-slate-700">Next</Button>
              </div>
            </div>
          )}
        </>
      )}
      <ProjectFormModal open={modalOpen} onOpenChange={setModalOpen} />
      <Dialog open={budgetOpen} onOpenChange={setBudgetOpen}>
        <DialogContent className="bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 rounded-md max-w-lg" data-testid="budget-breakdown-dialog">
          <DialogHeader>
            <DialogTitle className="font-heading text-2xl uppercase tracking-wide">Budget Breakdown</DialogTitle>
          </DialogHeader>
          <div className="max-h-96 overflow-y-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-[0.15em] text-slate-500 dark:text-slate-400 border-b border-slate-300 dark:border-slate-700">
                  <th className="py-2 font-semibold">Project</th>
                  <th className="py-2 font-semibold">Client</th>
                  <th className="py-2 font-semibold text-right">Budget</th>
                </tr>
              </thead>
              <tbody>
                {(budgetProjects || []).map((p) => (
                  <tr key={p.id} className="border-b border-slate-200 dark:border-slate-800" data-testid={`budget-row-${p.id}`}>
                    <td className="py-2.5 text-slate-900 dark:text-slate-100 font-medium">{p.name}</td>
                    <td className="py-2.5 text-slate-500 dark:text-slate-400">{p.client_name}</td>
                    <td className="py-2.5 text-right text-slate-600 dark:text-slate-400">{p.budget != null ? fmtCr(p.budget) : "—"}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={2} className="py-3 text-[11px] uppercase tracking-[0.15em] text-slate-500 dark:text-slate-400 font-semibold">Total</td>
                  <td className="py-3 text-right font-heading font-bold text-xl text-blue-600 dark:text-blue-400" data-testid="budget-total">
                    {summary ? fmtCr(summary.total_budget) : "—"}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
