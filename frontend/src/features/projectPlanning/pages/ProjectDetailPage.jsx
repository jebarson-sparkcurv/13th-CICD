import { useState } from "react";
import { useParams, Link, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import api from "../../../api/client";
import { ArrowLeft, Pencil, Plus, AlertTriangle, MapPin, IndianRupee, CalendarDays, UserRound, Users } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../../components/ui/tabs";
import { Skeleton } from "../../../components/ui/skeleton";
import { Button } from "../../../components/ui/button";
import { useProject, useUpdatesFeed } from "../hooks/useProjects";
import { ProjectStatusBadge } from "../components/ProjectStatusBadge";
import { PhaseTimeline } from "../components/PhaseTimeline";
import { PhaseFormModal } from "../components/PhaseFormModal";
import { ProgressUpdateFeed } from "../components/ProgressUpdateFeed";
import { ProgressUpdateFormModal } from "../components/ProgressUpdateFormModal";
import { ProjectFormModal } from "../components/ProjectFormModal";
import { DocumentsPanel } from "../components/DocumentsPanel";
import { EmployeesTab } from "../components/EmployeesTab";
import { ProjectBalanceSheetTab } from "../components/ProjectBalanceSheetTab";
import { ChangeOrdersTab } from "../components/ChangeOrdersTab";
import { useAuth } from "../../../context/AuthContext";

const fmtBudget = (b) => (b == null ? "—" : `₹${Number(b).toLocaleString("en-IN")}`);

const InfoCell = ({ icon: Icon, label, value, testId }) => (
  <div className="surface surface-hover p-5" data-testid={testId}>
    <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400 font-semibold">
      <div className="w-6 h-6 rounded-md bg-slate-100 dark:bg-slate-800/60 flex items-center justify-center text-slate-600 dark:text-slate-300">
        <Icon size={12} strokeWidth={2.25} />
      </div>
      {label}
    </div>
    <div className="font-heading font-semibold text-xl mt-3 leading-tight tracking-tight text-slate-900 dark:text-slate-100 num-wrap">{value || "—"}</div>
  </div>
);

const SubcontractorsCard = ({ subs }) => {
  const total = subs.reduce((sum, s) => sum + Number(s.allocated_amount || 0), 0);
  return (
    <div className="surface p-5 mt-6" data-testid="overview-subcontractors">
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400 font-semibold">Sub-Contractors</div>
          <div className="font-heading font-semibold text-lg mt-1 text-slate-900 dark:text-slate-100">
            {subs.length} allocated
            {subs.length > 0 && <span className="ml-2 text-sm text-slate-500 dark:text-slate-400 font-normal">· ₹{total.toLocaleString("en-IN")} total</span>}
          </div>
        </div>
      </div>
      {subs.length === 0 ? (
        <div className="text-xs text-slate-500 dark:text-slate-400 border border-dashed border-slate-200 dark:border-slate-700 rounded-md p-4 text-center" data-testid="overview-subcontractors-empty">
          None allocated yet. Use "Edit Project" to add sub-contractors, budgets and materials.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="data-table w-full" data-testid="overview-subcontractors-table">
            <thead>
              <tr>
                <th>Type</th>
                <th>Firm / Contact</th>
                <th className="text-right">Allocated</th>
                <th>Materials</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              {subs.map((s) => (
                <tr key={s.id} data-testid={`overview-subcontractor-row-${s.id}`}>
                  <td className="font-semibold text-slate-900 dark:text-slate-100">{s.type}</td>
                  <td className="text-slate-700 dark:text-slate-300">{s.name || "—"}</td>
                  <td className="text-right font-heading font-semibold tabular-nums num-wrap">₹{Number(s.allocated_amount || 0).toLocaleString("en-IN")}</td>
                  <td>
                    {(s.materials || []).length === 0 ? <span className="text-slate-400">—</span> : (
                      <div className="flex flex-wrap gap-1">
                        {s.materials.map((m) => (
                          <span key={m} className="inline-block bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-full px-2 py-0.5 text-[11px] text-slate-700 dark:text-slate-300">
                            {m}
                          </span>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="text-slate-600 dark:text-slate-400 text-xs">{s.notes || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default function ProjectDetailPage() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const initialTab = ["overview", "phases", "tracking", "variations", "employees", "balancesheet"].includes(searchParams.get("tab")) ? searchParams.get("tab") : "overview";
  const projectId = Number(id);
  const { user, canWrite: roleCanWrite, isAdmin } = useAuth();
  const { data: project, isLoading, isError } = useProject(projectId);
  const { data: feed, isLoading: feedLoading } = useUpdatesFeed(projectId);
  const [phaseModal, setPhaseModal] = useState({ open: false, phase: null });
  const [updateModal, setUpdateModal] = useState(false);
  const [editUpdate, setEditUpdate] = useState(null);
  const [editModal, setEditModal] = useState(false);
  const qc = useQueryClient();

  const deleteUpdate = async (u) => {
    if (!window.confirm("Delete this progress update?")) return;
    try {
      await api.delete(`/updates/${u.id}`);
      toast.success("Update deleted");
      qc.invalidateQueries({ queryKey: ["updates", projectId] });
      qc.invalidateQueries({ queryKey: ["project", projectId] });
    } catch (e) {
      toast.error(e.response?.data?.detail || e.message);
    }
  };
  const { data: coData } = useQuery({
    queryKey: ["changeOrders", projectId, "", "", ""],
    queryFn: () => api.get(`/projects/${projectId}/change-orders`).then((r) => r.data),
    enabled: user?.role !== "Vendor",
  });
  const coByPhase = (coData?.change_orders || []).reduce((m, c) => {
    if (c.status === "Approved" && c.phase_id) {
      const amt = c.approved_cost != null ? c.approved_cost : c.estimated_cost;
      m[c.phase_id] = { amount: (m[c.phase_id]?.amount || 0) + amt, count: (m[c.phase_id]?.count || 0) + 1 };
    }
    return m;
  }, {});

  const canWrite = roleCanWrite && (isAdmin || project?.site_engineer_id === user?.id);

  if (isLoading)
    return <div className="p-4 sm:p-8 space-y-4"><Skeleton className="h-16 bg-slate-200 dark:bg-slate-800 rounded-md w-1/2" /><Skeleton className="h-64 bg-slate-200 dark:bg-slate-800 rounded-md" /></div>;
  if (isError || !project)
    return <div className="p-4 sm:p-8"><div className="border border-red-200 dark:border-red-500/30 bg-red-50 dark:bg-red-500/10 p-8 text-center text-red-600 dark:text-red-400" data-testid="project-error">Project not found or failed to load.</div></div>;

  return (
    <div className="p-4 sm:p-8" data-testid="project-detail-page">
      <Link to="/admin/projects" data-testid="back-to-projects" className="inline-flex items-center gap-1.5 text-xs uppercase tracking-[0.15em] font-semibold text-slate-500 dark:text-slate-400 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-400 transition-colors mb-4">
        <ArrowLeft size={14} strokeWidth={2.5} /> All Projects
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="font-heading font-bold text-4xl sm:text-5xl tracking-tight leading-none" data-testid="project-title">{project.name}</h1>
            <ProjectStatusBadge status={project.status} />
            {project.has_active_issues && (
              <span className="flex items-center gap-1.5 border border-red-200 dark:border-red-500/30 bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400 px-2 py-0.5 text-[11px] uppercase tracking-[0.12em] font-semibold" data-testid="active-issues-flag">
                <AlertTriangle size={12} strokeWidth={2.5} /> Active Issues
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400 mt-2">
            <MapPin size={13} strokeWidth={2.5} /> {project.location || "Location not set"} · Client: {project.client_name}
          </div>
        </div>
        {canWrite && (
          <div className="flex gap-3">
            <Link to={`/admin/projects/${id}/finance`} data-testid="project-finance-link">
              <Button variant="outline" className="rounded-md border-slate-300 dark:border-slate-700 hover:border-blue-400">
                Finance
              </Button>
            </Link>
            <Link to={`/admin/projects/${id}/procurement`} data-testid="procurement-link">
              <Button variant="outline" className="rounded-md border-slate-300 dark:border-slate-700 hover:border-blue-400">
                Procurement
              </Button>
            </Link>
            <Link to={`/admin/projects/${id}/3d-viewer`} data-testid="model3d-link">
              <Button variant="outline" className="rounded-md border-slate-300 dark:border-slate-700 hover:border-blue-400">
                3D Drawings
              </Button>
            </Link>
            <Button data-testid="edit-project-button" onClick={() => setEditModal(true)} variant="outline" className="rounded-md border-slate-300 dark:border-slate-700 hover:border-blue-400">
              <Pencil size={14} strokeWidth={2.5} /> Edit Project
            </Button>
          </div>
        )}
      </div>

      <div className="surface p-5 mb-6" data-testid="overall-progress">
        <div className="flex items-center justify-between mb-3">
          <span className="section-eyebrow">Overall Completion</span>
          <span className="font-heading font-semibold text-2xl text-slate-900 dark:text-slate-100 leading-none tabular-nums">{project.percent_complete}%</span>
        </div>
        <div className="h-2 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
          <div className={`h-full rounded-full transition-[width] duration-500 ${project.percent_complete >= 100 ? "bg-emerald-500" : project.percent_complete >= 60 ? "bg-amber-500" : "bg-sky-500"}`} style={{ width: `${project.percent_complete}%` }} />
        </div>
      </div>

      <Tabs defaultValue={initialTab}>
        <TabsList className="tab-strip w-full h-auto justify-start flex-nowrap bg-slate-100 dark:bg-slate-900/60">
          {["overview", "phases", "tracking", ...(user?.role !== "Vendor" ? ["variations"] : []), ...(user?.role !== "Client" && user?.role !== "Vendor" ? ["employees", "balancesheet"] : [])].map((t) => (
            <TabsTrigger key={t} value={t} data-testid={`tab-${t}`}
              className="rounded-md px-4 py-2 text-[11px] uppercase tracking-[0.15em] font-semibold text-slate-500 dark:text-slate-400 data-[state=active]:text-slate-900 dark:data-[state=active]:text-slate-100 transition-colors whitespace-nowrap">
              {t === "balancesheet" ? "balance sheet" : t === "variations" ? "change orders" : t}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="overview" className="mt-6" data-testid="overview-tab-content">
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
            <InfoCell icon={IndianRupee} label="Budget" value={fmtBudget(project.budget)} testId="overview-budget" />
            <InfoCell icon={Users} label="Client" value={project.client_name} testId="overview-client" />
            <InfoCell icon={UserRound} label="Site Engineer" value={project.site_engineer_name} testId="overview-engineer" />
            <InfoCell icon={CalendarDays} label="Planned Start" value={project.start_date_planned} testId="overview-start-planned" />
            <InfoCell icon={CalendarDays} label="Planned End" value={project.end_date_planned} testId="overview-end-planned" />
            <InfoCell icon={CalendarDays} label="Actual Start" value={project.start_date_actual} testId="overview-start-actual" />
          </div>
          <SubcontractorsCard subs={project.subcontractors || []} />
        </TabsContent>

        <TabsContent value="phases" className="mt-6" data-testid="phases-tab-content">
          <div className="flex items-center justify-between mb-6">
            <div className="text-[11px] uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400 font-semibold">Phase Timeline · {project.phases?.length || 0} phases</div>
            {canWrite && (
              <Button data-testid="add-phase-button" onClick={() => setPhaseModal({ open: true, phase: null })} size="sm"
                className="rounded-md bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-100 text-white dark:text-slate-900 font-bold uppercase tracking-[0.12em]">
                <Plus size={14} strokeWidth={3} /> Add Phase
              </Button>
            )}
          </div>
          <PhaseTimeline phases={project.phases} canWrite={canWrite} onEdit={(ph) => setPhaseModal({ open: true, phase: ph })} coByPhase={coByPhase} />
        </TabsContent>

        <TabsContent value="tracking" className="mt-6" data-testid="tracking-tab-content">
          <div className="grid lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2">
              <div className="flex items-center justify-between mb-6">
                <div className="text-[11px] uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400 font-semibold">Progress Feed · {feed?.total ?? 0} updates</div>
                {canWrite && (
                  <Button data-testid="post-update-button" onClick={() => setUpdateModal(true)} size="sm"
                    className="rounded-md bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-100 text-white dark:text-slate-900 font-bold uppercase tracking-[0.12em]">
                    <Plus size={14} strokeWidth={3} /> Post Update
                  </Button>
                )}
              </div>
              {feedLoading ? (
                <div className="space-y-3">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-28 bg-white dark:bg-slate-900 rounded-md" />)}</div>
              ) : (
                <ProgressUpdateFeed updates={feed?.items} canManage={canWrite}
                  onEdit={(u) => { setEditUpdate(u); setUpdateModal(true); }} onDelete={deleteUpdate} />
              )}
            </div>
            <DocumentsPanel projectId={projectId} canWrite={canWrite} isAdmin={isAdmin} />
          </div>
        </TabsContent>

        {user?.role !== "Vendor" && (
          <TabsContent value="variations" className="mt-6" data-testid="variations-tab-content">
            <ChangeOrdersTab projectId={projectId} phases={project.phases} />
          </TabsContent>
        )}

        {user?.role !== "Client" && user?.role !== "Vendor" && (
          <>
            <TabsContent value="employees" className="mt-6">
              <EmployeesTab projectId={projectId} />
            </TabsContent>
            <TabsContent value="balancesheet" className="mt-6" data-testid="balancesheet-tab-content">
              <ProjectBalanceSheetTab projectId={projectId} />
            </TabsContent>
          </>
        )}
      </Tabs>

      <PhaseFormModal open={phaseModal.open} onOpenChange={(o) => setPhaseModal({ open: o, phase: o ? phaseModal.phase : null })}
        projectId={projectId} phase={phaseModal.phase}
        nextOrder={(project.phases?.reduce((m, p) => Math.max(m, p.sequence_order), 0) || 0) + 1} />
      <ProgressUpdateFormModal open={updateModal} onOpenChange={(o) => { setUpdateModal(o); if (!o) setEditUpdate(null); }} projectId={projectId} phases={project.phases} update={editUpdate} />
      <ProjectFormModal open={editModal} onOpenChange={setEditModal} project={project} />
    </div>
  );
}
