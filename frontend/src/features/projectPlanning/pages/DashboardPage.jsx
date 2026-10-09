import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Building2, AlertTriangle, CheckCircle2, IndianRupee, Flag } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, Cell, ReferenceLine, PieChart, Pie } from "recharts";
import api from "../../../api/client";
import { useStats, useProjects } from "../hooks/useProjects";
import { ProjectTable } from "../components/ProjectTable";
import { Skeleton } from "../../../components/ui/skeleton";
import { useAuth } from "../../../context/AuthContext";

const STATUS_ORDER = ["Planning", "Ongoing", "OnHold", "Completed", "Cancelled"];
const BAR_COLORS = { Planning: "#0EA5E9", Ongoing: "#F59E0B", OnHold: "#8B5CF6", Completed: "#10B981", Cancelled: "#EF4444" };
const STAGE_COLORS = ["#2563EB", "#F59E0B", "#10B981", "#8B5CF6", "#64748B", "#0EA5E9"];
const TOOLTIP_STYLE = { background: "var(--tooltip-bg)", border: "1px solid var(--tooltip-border)", borderRadius: 8, fontSize: 12, color: "var(--tooltip-color)", boxShadow: "0 4px 12px rgba(15,23,42,0.15)" };

const StatCard = ({ icon: Icon, label, value, accent, testId }) => (
  <div className="stat-card surface surface-hover p-5 fade-up" data-testid={testId}>
    <div className="flex items-center justify-between">
      <span className="text-[10px] uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400 font-semibold">{label}</span>
      <div className={`w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800/60 flex items-center justify-center ${accent}`}>
        <Icon size={15} strokeWidth={2.25} />
      </div>
    </div>
    <div className="stat-value mt-4 text-slate-900 dark:text-slate-100">{value}</div>
  </div>
);

const Card = ({ title, testId, children, className = "" }) => (
  <div className={`surface p-5 min-w-0 overflow-hidden ${className}`} data-testid={testId}>
    <div className="text-[11px] uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400 font-semibold mb-4">{title}</div>
    {children}
  </div>
);

const GanttChart = ({ timeline }) => {
  const rows = (timeline || []).filter((t) => t.planned_start && t.planned_end);
  if (rows.length === 0) return <div className="text-slate-500 dark:text-slate-400 text-sm py-8 text-center">No scheduled projects.</div>;
  const min = Math.min(...rows.map((r) => new Date(r.planned_start).getTime()));
  const max = Math.max(...rows.map((r) => new Date(r.planned_end).getTime()));
  const span = max - min || 1;
  const pos = (d) => ((new Date(d).getTime() - min) / span) * 100;
  const todayPct = Math.max(0, Math.min(100, ((Date.now() - min) / span) * 100));
  return (
    <div className="relative">
      <div className="absolute top-0 bottom-0 border-l border-dashed border-blue-400 z-10" style={{ left: `calc(160px + (100% - 160px) * ${todayPct / 100})` }}>
        <span className="absolute -top-1 left-1 text-[9px] uppercase tracking-wide text-blue-600 dark:text-blue-400 font-bold">Today</span>
      </div>
      <div className="space-y-2 pt-3">
        {rows.map((r) => {
          const left = pos(r.planned_start);
          const width = Math.max(2, pos(r.planned_end) - left);
          return (
            <div key={r.id} className="flex items-center gap-2" data-testid={`gantt-row-${r.id}`}>
              <div className="w-[150px] shrink-0 text-xs text-slate-600 dark:text-slate-400 truncate">{r.name}</div>
              <div className="flex-1 h-5 bg-slate-200 dark:bg-slate-800 relative">
                <div className="absolute top-0 h-full opacity-40" style={{ left: `${left}%`, width: `${width}%`, background: BAR_COLORS[r.status] || "#f97316" }} />
                <div className="absolute top-0 h-full" style={{ left: `${left}%`, width: `${Math.max(0, Math.min((width * r.percent_complete) / 100, todayPct - left))}%`, background: BAR_COLORS[r.status] || "#f97316" }} />
                <span className="absolute top-0.5 text-[9px] font-bold text-slate-900 dark:text-slate-100" style={{ left: `calc(${left}% + 4px)` }}>{r.percent_complete}%</span>
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex justify-between text-[10px] text-slate-400 dark:text-slate-500 mt-2 pl-[158px]">
        <span>{new Date(min).toLocaleDateString("en-IN", { month: "short", year: "numeric" })}</span>
        <span>{new Date(max).toLocaleDateString("en-IN", { month: "short", year: "numeric" })}</span>
      </div>
    </div>
  );
};

export default function DashboardPage() {
  const { user } = useAuth();
  const { data: stats, isLoading } = useStats();
  const { data: projectsData } = useProjects({ limit: 5 });
  const { data: charts } = useQuery({
    queryKey: ["dashboardCharts"],
    queryFn: () => api.get("/projects/dashboard-charts").then((r) => r.data),
  });

  const chartData = STATUS_ORDER.map((s) => ({ status: s, count: stats?.by_status?.[s] || 0 }));
  const pp = charts?.portfolio_progress;
  const ms = charts?.milestones;
  const gauge = [{ value: pp?.avg_pct || 0, fill: "#2563EB" }, { value: 100 - (pp?.avg_pct || 0), fill: "var(--gauge-track)" }];
  const msDonut = [
    { name: "Completed", value: ms?.completed || 0, fill: "#10B981" },
    { name: "Pending", value: ms?.pending || 0, fill: "#F59E0B" },
    { name: "Overdue", value: ms?.overdue || 0, fill: "#EF4444" },
  ];

  return (
    <div className="p-4 sm:p-8" data-testid="dashboard-page">
      <div className="mb-8">
        <div className="text-blue-600 dark:text-blue-400 text-[11px] uppercase tracking-[0.3em] font-semibold mb-1">Command Center</div>
        <h1 className="font-heading font-bold text-4xl sm:text-5xl tracking-tight leading-none">
          Welcome back, {user?.name?.split(" ")[0]}
        </h1>
      </div>
      {isLoading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-28 bg-white dark:bg-slate-900 rounded-md" />)}
        </div>
      ) : (
        <div className="kpi-scroller" style={{ ["--kpi-cols"]: 2, ["--kpi-cols-lg"]: 5 }}>
          <StatCard icon={Building2} label="Total Projects" value={stats?.total_projects ?? 0} accent="text-blue-600 dark:text-blue-400" testId="stat-total-projects" />
          <StatCard icon={CheckCircle2} label="Ongoing" value={stats?.by_status?.Ongoing ?? 0} accent="text-emerald-600 dark:text-emerald-400" testId="stat-ongoing" />
          <StatCard icon={CheckCircle2} label="Completed" value={stats?.by_status?.Completed ?? 0} accent="text-purple-600 dark:text-purple-400" testId="stat-completed" />
          <StatCard icon={AlertTriangle} label="With Issues" value={stats?.projects_with_issues ?? 0} accent="text-red-500" testId="stat-issues" />
          <StatCard icon={IndianRupee} label="Total Budget" value={stats ? `₹${(stats.total_budget || 0).toLocaleString("en-IN")}` : "—"} accent="text-sky-600 dark:text-sky-400" testId="stat-budget" />
        </div>
      )}

      <div className="grid lg:grid-cols-3 gap-4 mt-4">
        {/* 1. Overall portfolio progress */}
        <Card title="Overall Portfolio Progress" testId="portfolio-progress-chart">
          <div className="relative">
            <ResponsiveContainer width="100%" height={190}>
              <PieChart>
                <Pie data={gauge} dataKey="value" innerRadius={62} outerRadius={82}
                  startAngle={225} endAngle={-45} stroke="none" isAnimationActive={false} />
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <div className="font-heading font-bold text-4xl text-blue-600 dark:text-blue-400" data-testid="portfolio-avg-pct">{pp?.avg_pct ?? 0}%</div>
              <div className="text-[10px] uppercase tracking-[0.15em] text-slate-500 dark:text-slate-400">Avg Completion</div>
            </div>
          </div>
          <div className="flex justify-around text-center border-t border-slate-200 dark:border-slate-800 pt-3">
            <div><div className="font-heading font-bold text-xl">{pp?.total ?? 0}</div><div className="text-[10px] uppercase tracking-wide text-slate-500 dark:text-slate-400">Projects</div></div>
            <div><div className="font-heading font-bold text-xl text-emerald-600 dark:text-emerald-400">{pp?.completed ?? 0}</div><div className="text-[10px] uppercase tracking-wide text-slate-500 dark:text-slate-400">Completed</div></div>
          </div>
        </Card>

        {/* 3. Project status breakdown */}
        <Card title="Projects by Status" testId="status-chart">
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={chartData} layout="vertical" margin={{ left: 8 }}>
              <XAxis type="number" hide />
              <YAxis type="category" dataKey="status" width={80} tick={{ fill: "#64748b", fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip cursor={{ fill: "#e2e8f0" }} contentStyle={TOOLTIP_STYLE} />
              <Bar dataKey="count" barSize={16}>
                {chartData.map((d) => <Cell key={d.status} fill={BAR_COLORS[d.status]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Card>

        {/* 6. Projects by stage */}
        <Card title="Projects by Stage" testId="stages-chart">
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={charts?.stages || []} margin={{ left: -20 }}>
              <XAxis dataKey="stage" tick={{ fill: "#64748b", fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis allowDecimals={false} tick={{ fill: "#94a3b8", fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip cursor={{ fill: "#e2e8f0" }} contentStyle={TOOLTIP_STYLE} />
              <Bar dataKey="count" barSize={34}>
                {(charts?.stages || []).map((d, i) => <Cell key={d.stage} fill={STAGE_COLORS[i % STAGE_COLORS.length]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Card>
      </div>

      <div className="grid lg:grid-cols-3 gap-4 mt-4">
        {/* 2. Gantt / timeline */}
        <Card title="Project Timeline (Gantt)" testId="gantt-chart" className="lg:col-span-2">
          <GanttChart timeline={charts?.timeline} />
        </Card>

        {/* 5. Milestone completion tracker */}
        <Card title="Milestone Tracker" testId="milestone-chart">
          <div className="flex items-center gap-3">
            <div className="relative w-[110px] h-[110px] shrink-0">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={msDonut} dataKey="value" innerRadius={38} outerRadius={54} stroke="none" isAnimationActive={false} />
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <div className="font-heading font-bold text-lg" data-testid="milestone-total">{ms?.total ?? 0}</div>
              </div>
            </div>
            <div className="space-y-1.5 text-xs">
              <div className="flex items-center gap-2"><span className="w-2.5 h-2.5 bg-emerald-50 dark:bg-emerald-500/100" /> <span className="text-slate-600 dark:text-slate-400">{ms?.completed ?? 0} Completed</span></div>
              <div className="flex items-center gap-2"><span className="w-2.5 h-2.5 bg-amber-50 dark:bg-amber-500/100" /> <span className="text-slate-600 dark:text-slate-400">{ms?.pending ?? 0} Pending</span></div>
              <div className="flex items-center gap-2"><span className="w-2.5 h-2.5 bg-red-50 dark:bg-red-500/100" /> <span className="text-slate-600 dark:text-slate-400">{ms?.overdue ?? 0} Overdue</span></div>
            </div>
          </div>
          <div className="border-t border-slate-200 dark:border-slate-800 mt-3 pt-3 space-y-2">
            {(ms?.upcoming || []).slice(0, 4).map((m) => (
              <div key={m.id} className="flex items-center gap-2 text-xs" data-testid={`milestone-upcoming-${m.id}`}>
                <Flag size={11} strokeWidth={2.5} className={m.overdue ? "text-red-600 dark:text-red-400" : "text-amber-600 dark:text-amber-400"} />
                <span className="text-slate-600 dark:text-slate-400 truncate flex-1">{m.title}</span>
                <span className={`shrink-0 ${m.overdue ? "text-red-600 dark:text-red-400" : "text-slate-500 dark:text-slate-400"}`}>{m.due_date?.slice(5)}</span>
              </div>
            ))}
            {(ms?.upcoming || []).length === 0 && <div className="text-slate-400 dark:text-slate-500 text-xs">No upcoming milestones.</div>}
          </div>
        </Card>
      </div>

      <div className="grid lg:grid-cols-3 gap-4 mt-4">
        {/* 4. Schedule variance */}
        <Card title="Schedule Variance (Actual − Expected %)" testId="variance-chart">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={charts?.schedule_variance || []} margin={{ left: -20 }}>
              <XAxis dataKey="name" tick={{ fill: "#64748b", fontSize: 10 }} axisLine={false} tickLine={false}
                interval={0} tickFormatter={(v) => (v.length > 10 ? v.slice(0, 10) + "…" : v)} />
              <YAxis tick={{ fill: "#94a3b8", fontSize: 11 }} axisLine={false} tickLine={false} unit="%" />
              <Tooltip cursor={{ fill: "#e2e8f0" }} contentStyle={TOOLTIP_STYLE}
                formatter={(v, n) => [`${v}%`, n === "variance" ? "Variance" : n]} />
              <ReferenceLine y={0} stroke="#cbd5e1" />
              <Bar dataKey="variance" barSize={26}>
                {(charts?.schedule_variance || []).map((d) => <Cell key={d.id} fill={d.variance >= 0 ? "#10B981" : "#EF4444"} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <div className="lg:col-span-2 min-w-0">
          <div className="flex items-center justify-between mb-3">
            <div className="text-[11px] uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400 font-semibold">Recent Projects</div>
            <Link to="/admin/projects" data-testid="view-all-projects-link" className="text-xs uppercase tracking-[0.12em] font-semibold text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 transition-colors">View All →</Link>
          </div>
          <ProjectTable projects={projectsData?.items} />
        </div>
      </div>
    </div>
  );
}
