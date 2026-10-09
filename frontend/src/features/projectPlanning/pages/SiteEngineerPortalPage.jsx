import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Link } from "react-router-dom";
import { HardHat, Plus, ArrowRight, ClipboardCheck, Tags } from "lucide-react";
import api, { formatApiErrorDetail } from "../../../api/client";
import { useAuth } from "../../../context/AuthContext";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../../components/ui/select";
import { DailyAttendanceCard } from "../components/DailyAttendanceCard";
import { EmployeeFormModal } from "../components/EmployeeFormModal";
import { CategoryManagerModal } from "../components/CategoryManagerModal";

const iso = (d) => d.toISOString().slice(0, 10);
const todayIso = () => iso(new Date());
const minDate = () => { const d = new Date(); d.setDate(d.getDate() - 3); return iso(d); };

export default function SiteEngineerPortalPage() {
  const { user, isAdmin } = useAuth();
  const isClient = user?.role === "Client";
  const qc = useQueryClient();
  const [projectId, setProjectId] = useState("");
  const [day, setDay] = useState(todayIso());
  const [modal, setModal] = useState(false);
  const [catModal, setCatModal] = useState(false);

  const { data: projects } = useQuery({
    queryKey: ["fieldProjects"],
    queryFn: () => api.get("/projects", { params: { limit: 200 } }).then((r) => r.data.items),
  });

  useEffect(() => {
    if (!projectId && projects?.length) setProjectId(String(projects[0].id));
  }, [projects, projectId]);

  const pid = projectId ? Number(projectId) : null;
  const { data: employees } = useQuery({
    queryKey: ["employees", pid],
    queryFn: () => api.get(`/projects/${pid}/employees`).then((r) => r.data),
    enabled: !!pid,
  });
  const { data: attendance } = useQuery({
    queryKey: ["attendance", pid, day, day],
    queryFn: () => api.get(`/projects/${pid}/attendance`, { params: { date_from: day, date_to: day } }).then((r) => r.data),
    enabled: !!pid && !!day,
  });
  const { data: allEmployees } = useQuery({
    queryKey: ["allEmployees"],
    queryFn: () => api.get("/employees").then((r) => r.data),
    enabled: !isClient,
  });

  const active = (employees || []).filter((e) => e.status === "active");
  const statusMap = {};
  (attendance || []).forEach((a) => { statusMap[a.employee_id] = a.status; });
  const markedCount = active.filter((e) => statusMap[e.id]).length;

  const mark = async (employee, status) => {
    try {
      await api.post(`/projects/${pid}/attendance`, { employee_id: employee.id, attendance_date: day, status });
      toast.success(`${employee.name}: ${status.replace("_", " ")}`);
      qc.invalidateQueries({ queryKey: ["attendance", pid] });
      qc.invalidateQueries({ queryKey: ["labourCost", pid] });
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail) || e.message);
    }
  };

  const project = projects?.find((p) => String(p.id) === projectId);

  return (
    <div className="p-4 sm:p-8" data-testid="se-portal-page">
      <div className="flex items-end justify-between mb-8 flex-wrap gap-4">
        <div>
          <div className="text-blue-600 dark:text-blue-400 text-[11px] uppercase tracking-[0.3em] font-semibold mb-1">Field Operations</div>
          <h1 className="font-heading font-bold text-4xl sm:text-5xl tracking-tight leading-none">Daily Attendance</h1>
          {isClient && <div className="text-xs text-slate-500 dark:text-slate-400 mt-2" data-testid="client-viewonly-note">View-only — attendance for your projects</div>}
        </div>
        {!isClient && (
          <div className="flex gap-2">
            {["Admin", "Accountant"].includes(user?.role) && (
              <Button data-testid="manage-categories-button" variant="outline" onClick={() => setCatModal(true)}
                className="rounded-md border-slate-300 dark:border-slate-700 font-semibold uppercase tracking-wide text-xs">
                <Tags size={15} strokeWidth={2.5} /> Categories
              </Button>
            )}
            <Button data-testid="se-add-employee-button" onClick={() => setModal(true)}
              className="rounded-md bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-100 text-white dark:text-slate-900 font-bold uppercase tracking-wide">
              <Plus size={15} strokeWidth={3} /> Add Employee
            </Button>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-end gap-3 mb-6">
        <div>
          <div className="text-[10px] uppercase tracking-[0.15em] text-slate-500 dark:text-slate-400 mb-1">Project</div>
          <Select value={projectId} onValueChange={setProjectId}>
            <SelectTrigger data-testid="se-project-select" className="w-64 bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 rounded-md">
              <SelectValue placeholder="Select project" />
            </SelectTrigger>
            <SelectContent className="bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700">
              {(projects || []).map((p) => <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-[0.15em] text-slate-500 dark:text-slate-400 mb-1">Date</div>
          <Input data-testid="se-date-input" type="date" value={day}
            min={isAdmin || isClient ? undefined : minDate()} max={todayIso()}
            onChange={(e) => setDay(e.target.value)} className="bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 rounded-md h-10 w-44" />
        </div>
        {pid && (
          <Link to={`/admin/projects/${pid}`} data-testid="se-project-link"
            className="ml-auto flex items-center gap-1.5 text-[11px] uppercase tracking-[0.15em] font-semibold text-slate-500 dark:text-slate-400 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-400 transition-colors pb-2">
            Full Project View <ArrowRight size={13} strokeWidth={2.5} />
          </Link>
        )}
      </div>

      {project && (
        <div className="surface p-4 mb-6 flex flex-wrap items-center gap-x-6 gap-y-2" data-testid="se-summary-bar">
          <span className="flex items-center gap-2.5 text-sm text-slate-700 dark:text-slate-200">
            <div className="w-8 h-8 rounded-lg bg-sky-100 dark:bg-sky-500/15 flex items-center justify-center">
              <HardHat size={15} strokeWidth={2.25} className="text-sky-600 dark:text-sky-400" />
            </div>
            <span className="font-semibold truncate">{project.name}</span>
          </span>
          <span className="flex items-center gap-2.5 text-sm text-slate-500 dark:text-slate-400">
            <div className="w-8 h-8 rounded-lg bg-emerald-100 dark:bg-emerald-500/15 flex items-center justify-center">
              <ClipboardCheck size={15} strokeWidth={2.25} className="text-emerald-600 dark:text-emerald-400" />
            </div>
            <span><span data-testid="se-marked-count" className="font-heading font-semibold text-slate-900 dark:text-slate-100 text-base">{markedCount}</span>/{active.length} marked for {day}</span>
          </span>
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-3" data-testid="se-attendance-list">
        {active.map((e) => (
          <DailyAttendanceCard key={e.id} employee={e} status={statusMap[e.id]} onMark={mark} readOnly={isClient} />
        ))}
        {pid && active.length === 0 && (
          <div className="surface p-10 text-center text-slate-500 dark:text-slate-400 md:col-span-2" data-testid="se-empty">
            {isClient ? "No employees on this project yet." : 'No employees on this project yet. Tap "Add Employee" to register your first field worker.'}
          </div>
        )}
        {!pid && (
          <div className="surface p-10 text-center text-slate-500 dark:text-slate-400 md:col-span-2">
            No assigned projects found.
          </div>
        )}
      </div>

      {!isClient && (
      <div className="mt-10" data-testid="org-employee-register">
        <div className="section-eyebrow mb-3">Employee Register (Organisation) · {(allEmployees || []).length}</div>

        {/* Desktop table */}
        <div className="surface overflow-x-auto table-desktop">
          <table className="data-table" data-testid="org-employees-table">
            <thead>
              <tr>
                <th>Name</th><th>Trade</th>
                <th className="text-right">Wage</th><th>Assigned Projects (via phases)</th>
                <th className="text-center">Status</th>
              </tr>
            </thead>
            <tbody>
              {(allEmployees || []).map((e) => (
                <tr key={e.id} data-testid={`org-employee-row-${e.id}`}>
                  <td className="font-semibold text-slate-900 dark:text-slate-100">{e.name}</td>
                  <td className="text-slate-600 dark:text-slate-400">{e.role_title || "—"}</td>
                  <td className="text-right text-slate-700 dark:text-slate-300 num-wrap">{e.daily_wage != null ? `₹${Number(e.daily_wage).toLocaleString("en-IN")}/${e.wage_type === "daily" ? "day" : e.wage_type}` : "—"}</td>
                  <td className="text-xs text-slate-500 dark:text-slate-400">
                    {(e.assigned_projects || []).length ? e.assigned_projects.join(", ") : <span className="text-slate-400 dark:text-slate-500">Unassigned — assign via Project → Phases</span>}
                  </td>
                  <td className="text-center">
                    <span className={`chip ${e.status === "active" ? "chip-success" : ""}`}>{e.status}</span>
                  </td>
                </tr>
              ))}
              {(allEmployees || []).length === 0 && (
                <tr><td colSpan={5} className="text-center text-slate-500 dark:text-slate-400 py-8">No employees yet — add your first worker above.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile card list */}
        <div className="row-card space-y-2">
          {(allEmployees || []).map((e) => (
            <div key={e.id} className="surface p-4" data-testid={`org-employee-card-${e.id}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-semibold text-slate-900 dark:text-slate-100 truncate">{e.name}</div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{e.role_title || "—"}</div>
                </div>
                <span className={`chip ${e.status === "active" ? "chip-success" : ""}`}>{e.status}</span>
              </div>
              <div className="grid grid-cols-2 gap-3 mt-3 pt-3 border-t border-slate-100 dark:border-slate-800/60">
                <div>
                  <div className="text-[9px] uppercase tracking-[0.15em] text-slate-500 dark:text-slate-400 font-semibold">Wage</div>
                  <div className="text-sm font-semibold text-slate-800 dark:text-slate-200 num-wrap mt-0.5">{e.daily_wage != null ? `₹${Number(e.daily_wage).toLocaleString("en-IN")}/${e.wage_type === "daily" ? "day" : e.wage_type}` : "—"}</div>
                </div>
                <div>
                  <div className="text-[9px] uppercase tracking-[0.15em] text-slate-500 dark:text-slate-400 font-semibold">Projects</div>
                  <div className="text-xs text-slate-600 dark:text-slate-400 mt-0.5 truncate">{(e.assigned_projects || []).length ? e.assigned_projects.join(", ") : <span className="text-slate-400 dark:text-slate-500">Unassigned</span>}</div>
                </div>
              </div>
            </div>
          ))}
          {(allEmployees || []).length === 0 && (
            <div className="surface p-10 text-center text-slate-500 dark:text-slate-400 text-sm">No employees yet — tap the button below to add your first worker.</div>
          )}
        </div>
      </div>
      )}

      {!isClient && (
        <button onClick={() => setModal(true)} data-testid="se-add-employee-fab" className="fab md:hidden">
          <Plus size={16} strokeWidth={3} /> Add Employee
        </button>
      )}

      <EmployeeFormModal open={modal} onOpenChange={setModal} projectId={null} />
      <CategoryManagerModal open={catModal} onOpenChange={setCatModal} />
    </div>
  );
}
