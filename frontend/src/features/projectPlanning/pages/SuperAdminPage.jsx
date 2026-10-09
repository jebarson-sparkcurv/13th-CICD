import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Navigate, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  Building2, Plus, Shield, Users, Check, X, ChevronRight, LogOut,
  Pause, Play, Trash2, LogIn, Search, Activity, Layers, Sparkles,
  BadgeCheck, LayoutGrid, ArrowUpRight, Download,
} from "lucide-react";
import api, { formatApiErrorDetail } from "../../../api/client";
import { useAuth } from "../../../context/AuthContext";

const MODULE_LABELS = {
  projects: "Projects",
  phases_tracking: "Phases & Tracking",
  field_ops: "Field Ops (Attendance/Payroll)",
  clients: "Clients",
  leads: "Leads (Sales Pipeline)",
  leave_attendance: "Leave & Attendance (Staff)",
  finance: "Finance (Ledger/Balance Sheet)",
  estimates: "Estimates",
  procurement: "Procurement",
  change_orders: "Change Orders",
  model3d_viewer: "3D Drawing Viewer",
  concept_studio: "AI Concept Studio",
  client_portal: "Client Portal",
  vendor_portal: "Vendor Portal",
  site_engineer_portal: "Site Engineer Portal",
};

export default function SuperAdminPage() {
  const { user, isSuperAdmin, logout } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [showCreate, setShowCreate] = useState(false);
  const [editingTenant, setEditingTenant] = useState(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [tab, setTab] = useState("overview"); // overview | tenants | users | modules | audit

  const { data: modulesData } = useQuery({
    queryKey: ["tenant-modules"],
    queryFn: () => api.get("/tenants/modules").then((r) => r.data),
    enabled: !!user && isSuperAdmin,
  });
  const modules = modulesData?.modules || Object.keys(MODULE_LABELS);

  const { data: tenants = [], isLoading } = useQuery({
    queryKey: ["tenants"],
    queryFn: () => api.get("/tenants").then((r) => r.data),
    enabled: !!user && isSuperAdmin,
  });

  const patchTenant = useMutation({
    mutationFn: ({ id, ...body }) => api.patch(`/tenants/${id}`, body).then((r) => r.data),
    onSuccess: () => { qc.invalidateQueries(["tenants"]); toast.success("Tenant updated"); },
    onError: (e) => toast.error(formatApiErrorDetail(e.response?.data?.detail) || "Update failed"),
  });
  const toggleHold = useMutation({
    mutationFn: ({ id, active }) => api.patch(`/tenants/${id}`, { is_active: active }).then((r) => r.data),
    onSuccess: (_, v) => { qc.invalidateQueries(["tenants"]); toast.success(v.active ? "Tenant resumed" : "Tenant on hold"); },
  });
  const deleteTenant = useMutation({
    mutationFn: (id) => api.delete(`/tenants/${id}/permanent`).then((r) => r.data),
    onSuccess: () => { qc.invalidateQueries(["tenants"]); toast.success("Tenant deleted"); },
    onError: (e) => toast.error(formatApiErrorDetail(e.response?.data?.detail) || "Delete failed"),
  });

  const downloadBackup = async (t) => {
    try {
      const res = await api.get(`/tenants/${t.id}/export`, { responseType: "blob" });
      const url = URL.createObjectURL(new Blob([res.data], { type: "application/json" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `sitera-tenant-${t.slug}-${t.id}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success(`Backup downloaded for ${t.name}`);
      return true;
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail) || "Backup failed");
      return false;
    }
  };

  const deleteWithBackup = async (t) => {
    const ok = window.confirm(
      `Delete "${t.name}" and ALL its data? This cannot be undone.\n\n` +
      `Click OK to first download a JSON backup, then permanently delete.`
    );
    if (!ok) return;
    const backupOk = await downloadBackup(t);
    if (!backupOk) {
      if (!window.confirm("Backup failed. Delete anyway?")) return;
    }
    deleteTenant.mutate(t.id);
  };
  const impersonate = useMutation({
    mutationFn: (id) => api.post(`/tenants/${id}/impersonate`).then((r) => r.data),
    onSuccess: async (data) => {
      try {
        sessionStorage.setItem("sitera_impersonation", JSON.stringify({
          tenant_name: data.tenant_name, admin_name: data.user.name,
          admin_email: data.user.email, superadmin_email: data.impersonated_by,
        }));
      } catch (e) { /* ignore */ }
      toast.success(`Signed in as ${data.user.name} · ${data.tenant_name}`);
      window.location.href = "/admin";
    },
    onError: (e) => toast.error(formatApiErrorDetail(e.response?.data?.detail) || "Impersonation failed"),
  });

  if (user === null) return null;
  if (!user || !isSuperAdmin) return <Navigate to="/login" replace />;

  const totalActive = tenants.filter((t) => t.is_active).length;
  const totalOnHold = tenants.length - totalActive;
  const totalUsers = tenants.reduce((s, t) => s + (t.user_count || 0), 0);
  const activeShare = tenants.length ? Math.round((totalActive * 100) / tenants.length) : 0;

  const filtered = tenants.filter((t) => {
    if (filter === "active" && !t.is_active) return false;
    if (filter === "hold" && t.is_active) return false;
    if (!search.trim()) return true;
    const q = search.trim().toLowerCase();
    return t.name.toLowerCase().includes(q) ||
           (t.admin_email || "").toLowerCase().includes(q) ||
           (t.slug || "").toLowerCase().includes(q);
  });

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-[#0a0e17] text-slate-900 dark:text-slate-100 flex" data-testid="superadmin-page">
      {/* ================================ SIDEBAR ================================ */}
      <aside className="w-64 shrink-0 bg-[#0a0e17] text-slate-300 border-r border-slate-800/60 hidden lg:flex lg:flex-col sticky top-0 h-screen">
        <div className="px-6 py-6 flex items-center gap-3 border-b border-slate-800/60">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-amber-500 to-amber-600 flex items-center justify-center shadow-lg shadow-amber-900/30 ring-1 ring-amber-400/40">
            <Shield size={17} className="text-white" strokeWidth={2.5} />
          </div>
          <div>
            <div className="text-[9px] uppercase tracking-[0.18em] font-semibold text-slate-500">Sitera</div>
            <div className="font-heading font-semibold text-sm text-white leading-tight">Platform Console</div>
          </div>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-0.5" data-testid="superadmin-nav">
          <SidebarLink icon={<LayoutGrid size={15} />} label="Overview" active={tab === "overview"} onClick={() => setTab("overview")} testid="nav-overview" />
          <SidebarLink icon={<Building2 size={15} />} label="Tenants" count={tenants.length} active={tab === "tenants"} onClick={() => setTab("tenants")} testid="nav-tenants" />
          <SidebarLink icon={<Users size={15} />}     label="All users" count={totalUsers} active={tab === "users"} onClick={() => setTab("users")} testid="nav-users" />
          <SidebarLink icon={<Sparkles size={15} />}  label="Modules"   count={modules.length} active={tab === "modules"} onClick={() => setTab("modules")} testid="nav-modules" />
          <SidebarLink icon={<Activity size={15} />}  label="Audit log" active={tab === "audit"} onClick={() => setTab("audit")} testid="nav-audit" />
        </nav>

        <div className="p-3 border-t border-slate-800/60">
          <div className="rounded-lg bg-slate-800/40 p-3 flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-amber-400 to-amber-600 text-white font-heading font-semibold flex items-center justify-center text-xs shadow-md">
              {user.name?.[0]?.toUpperCase() || "S"}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-xs font-semibold text-white truncate">{user.name}</div>
              <div className="text-[10px] text-slate-500 truncate">{user.email}</div>
            </div>
            <button data-testid="superadmin-logout" onClick={logout}
              title="Sign out"
              className="p-1.5 text-slate-500 hover:text-white rounded-md hover:bg-slate-800 transition-colors">
              <LogOut size={13} strokeWidth={2.25} />
            </button>
          </div>
        </div>
      </aside>

      {/* ================================ MAIN ================================ */}
      <div className="flex-1 min-w-0">
        {/* Mobile top bar */}
        <div className="lg:hidden border-b border-slate-200 dark:border-slate-800/60 bg-white dark:bg-[#0a0e17] px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield size={16} className="text-amber-500" />
            <span className="font-heading font-semibold text-sm">SuperAdmin</span>
          </div>
          <button onClick={logout} className="p-2 text-slate-500 hover:text-slate-900 dark:hover:text-white">
            <LogOut size={16} />
          </button>
        </div>

        <div className="max-w-[1360px] mx-auto px-4 sm:px-8 py-8 lg:py-10">
          {/* Hero */}
          <div className="mb-8 flex flex-col sm:flex-row sm:items-end justify-between gap-4">
            <div>
              <div className="text-[10px] uppercase tracking-[0.2em] font-semibold text-amber-600 dark:text-amber-500 mb-2 flex items-center gap-1.5">
                <BadgeCheck size={12} strokeWidth={2.5} /> Platform overview
              </div>
              <h1 className="font-heading font-semibold text-3xl lg:text-4xl tracking-tight text-slate-900 dark:text-white">
                {tenants.length === 0 ? "Welcome to Sitera" : `${tenants.length} companies`}
                <span className="text-slate-400 dark:text-slate-600"> on the platform</span>
              </h1>
              <div className="text-sm text-slate-500 dark:text-slate-400 mt-2 max-w-xl">
                Provision new tenants, tune module access, or sign in as any tenant Admin. Data is fully isolated between tenants.
              </div>
            </div>
            <button data-testid="new-tenant-btn" onClick={() => setShowCreate(true)}
              className="inline-flex items-center gap-2 px-5 py-3 rounded-lg bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-100 text-white dark:text-slate-900 text-xs uppercase tracking-[0.15em] font-semibold shadow-sm transition-colors">
              <Plus size={14} strokeWidth={2.75} /> New Tenant
            </button>
          </div>

          {/* KPI cards — always visible */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8" data-testid="platform-stats">
            <MetricCard icon={<Building2 size={14} />} label="Total tenants" value={tenants.length}
              hint={`${activeShare}% active`} accent="slate" />
            <MetricCard icon={<Activity size={14} />}  label="Active"        value={totalActive}
              hint={totalActive === tenants.length ? "All active" : `${totalActive} of ${tenants.length}`} accent="emerald" />
            <MetricCard icon={<Pause size={14} />}     label="On hold"       value={totalOnHold}
              hint={totalOnHold ? "Users blocked" : "Nothing paused"} accent="amber" />
            <MetricCard icon={<Users size={14} />}     label="Total users"   value={totalUsers}
              hint={`across ${tenants.length || 0} ${tenants.length === 1 ? "tenant" : "tenants"}`} accent="indigo" />
          </div>

          {/* --- Tab: Overview / Tenants --- */}
          {(tab === "overview" || tab === "tenants") && (<>
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 mb-5">
              <div className="relative flex-1 min-w-[220px]">
                <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input data-testid="tenant-search" value={search} onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search by company, admin email, or slug…"
                  className="w-full pl-10 pr-3 py-2.5 bg-white dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 rounded-lg text-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500/40" />
              </div>
              <div className="inline-flex bg-white dark:bg-slate-900/50 rounded-lg p-1 border border-slate-200 dark:border-slate-800">
                {[["all", "All"], ["active", "Active"], ["hold", "On hold"]].map(([k, l]) => (
                  <button key={k} data-testid={`filter-${k}`} onClick={() => setFilter(k)}
                    className={`px-3 py-1.5 text-[11px] uppercase tracking-[0.15em] font-semibold rounded-md transition-all ${
                      filter === k
                        ? "bg-slate-900 dark:bg-white text-white dark:text-slate-900 shadow-sm"
                        : "text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                    }`}>{l}</button>
                ))}
              </div>
            </div>

            {isLoading ? (
              <div className="rounded-xl bg-white dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 p-10 text-center text-sm text-slate-500">Loading…</div>
            ) : filtered.length === 0 ? (
              <div className="rounded-xl bg-white dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 p-12 text-center" data-testid="tenants-empty">
                <div className="w-14 h-14 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center mx-auto mb-3">
                  <Building2 size={22} className="text-slate-400" strokeWidth={2.25} />
                </div>
                <div className="font-semibold text-slate-900 dark:text-slate-100">
                  {tenants.length === 0 ? "No tenants yet" : "No results"}
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  {tenants.length === 0 ? "Provision your first company to get started." : "Try a different search term."}
                </div>
              </div>
            ) : (
              <div className="rounded-xl bg-white dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800/60 overflow-hidden" data-testid="tenants-list">
                <div className="hidden md:grid grid-cols-[minmax(0,1fr)_120px_100px_180px] gap-4 px-6 py-3 bg-slate-50/60 dark:bg-slate-900/60 text-[10px] uppercase tracking-[0.18em] font-semibold text-slate-500 dark:text-slate-500">
                  <div>Tenant</div>
                  <div>Modules</div>
                  <div>Users</div>
                  <div className="text-right">Actions</div>
                </div>
                {filtered.map((t) => (
                  <TenantRow key={t.id} tenant={t} modules={modules}
                    onOpen={() => setEditingTenant(t)}
                    onHold={() => toggleHold.mutate({ id: t.id, active: false })}
                    onResume={() => toggleHold.mutate({ id: t.id, active: true })}
                    onBackup={() => downloadBackup(t)}
                    onDelete={() => deleteWithBackup(t)}
                    onImpersonate={() => impersonate.mutate(t.id)}
                    impersonating={impersonate.isPending && impersonate.variables === t.id} />
                ))}
              </div>
            )}
          </>)}

          {/* --- Tab: All users --- */}
          {tab === "users" && <AllUsersTab tenants={tenants} />}

          {/* --- Tab: Modules --- */}
          {tab === "modules" && <ModulesTab tenants={tenants} modules={modules} moduleLabels={MODULE_LABELS} />}

          {/* --- Tab: Audit --- */}
          {tab === "audit" && <AuditTab />}
        </div>
      </div>

      {showCreate && (
        <CreateTenantModal modules={modules} onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); qc.invalidateQueries(["tenants"]); }} />
      )}
      {editingTenant && (
        <EditTenantModal tenant={editingTenant} modules={modules}
          onClose={() => setEditingTenant(null)}
          onSave={(patch) => patchTenant.mutate({ id: editingTenant.id, ...patch },
            { onSuccess: () => setEditingTenant(null) })} />
      )}
    </div>
  );
}


/* --------------------------------------------------------------------- */
/* Sidebar link                                                            */
/* --------------------------------------------------------------------- */
function SidebarLink({ icon, label, count, active, onClick, testid }) {
  return (
    <button
      type="button" data-testid={testid} onClick={onClick}
      className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-xs font-medium transition-colors text-left ${
        active
          ? "bg-slate-800/80 text-white ring-1 ring-slate-700"
          : "text-slate-400 hover:text-white hover:bg-slate-800/50"
      }`}>
      <span className={active ? "text-amber-500" : "text-slate-500"}>{icon}</span>
      <span className="flex-1">{label}</span>
      {count !== undefined && (
        <span className={`text-[10px] font-mono tabular-nums ${active ? "text-slate-300" : "text-slate-600"}`}>{count}</span>
      )}
    </button>
  );
}


/* --------------------------------------------------------------------- */
/* Metric card                                                             */
/* --------------------------------------------------------------------- */
const ACCENTS = {
  slate:   "text-slate-500 dark:text-slate-400",
  emerald: "text-emerald-600 dark:text-emerald-400",
  amber:   "text-amber-600 dark:text-amber-500",
  indigo:  "text-indigo-600 dark:text-indigo-400",
};

function MetricCard({ icon, label, value, hint, accent = "slate" }) {
  return (
    <div className="rounded-xl bg-white dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 p-4">
      <div className="flex items-center justify-between mb-2">
        <div className={`inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.15em] font-semibold ${ACCENTS[accent]}`}>
          {icon}<span>{label}</span>
        </div>
      </div>
      <div className="font-heading text-3xl font-semibold text-slate-900 dark:text-white leading-none tabular-nums">{value}</div>
      <div className="text-[11px] text-slate-500 dark:text-slate-500 mt-2 truncate">{hint}</div>
    </div>
  );
}


/* --------------------------------------------------------------------- */
/* Tenant row                                                              */
/* --------------------------------------------------------------------- */
const AV_PALETTE = [
  "from-emerald-500 to-teal-600",
  "from-sky-500 to-blue-600",
  "from-fuchsia-500 to-purple-600",
  "from-amber-500 to-orange-600",
  "from-indigo-500 to-violet-600",
  "from-rose-500 to-pink-600",
];
const initialsFor = (n = "?") => n.split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "?";
const gradientFor = (id = 0) => AV_PALETTE[id % AV_PALETTE.length];


function TenantRow({ tenant: t, modules, onOpen, onHold, onResume, onBackup, onDelete, onImpersonate, impersonating }) {
  const modulePct = Math.round(((t.allowed_modules || []).length * 100) / (modules.length || 1));
  return (
    <div data-testid={`tenant-row-${t.id}`}
      className="grid md:grid-cols-[minmax(0,1fr)_120px_100px_180px] gap-4 px-6 py-4 hover:bg-slate-50 dark:hover:bg-slate-900/40 transition-colors group items-center">
      {/* Tenant identity */}
      <button onClick={onOpen} className="flex items-center gap-3.5 min-w-0 text-left w-full">
        <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${gradientFor(t.id)} text-white font-heading font-semibold text-sm flex items-center justify-center shadow-md ring-1 ring-black/5`}>
          {initialsFor(t.name)}
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="font-heading font-semibold text-slate-900 dark:text-white truncate group-hover:text-amber-600 dark:group-hover:text-amber-500 transition-colors">{t.name}</span>
            {!t.is_active && <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] uppercase tracking-[0.1em] font-bold bg-amber-500/10 text-amber-700 dark:text-amber-500 ring-1 ring-inset ring-amber-500/30"><Pause size={9} strokeWidth={3} /> Hold</span>}
            {t.id === 1 && <span className="text-[9px] uppercase tracking-[0.1em] font-bold text-slate-500 bg-slate-100 dark:bg-slate-800 ring-1 ring-inset ring-slate-200 dark:ring-slate-700 rounded px-1.5 py-0.5">Default</span>}
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5 font-mono">
            {t.admin_email || "no admin"}
          </div>
        </div>
      </button>

      {/* Modules bar */}
      <div className="hidden md:block">
        <div className="flex items-center gap-1.5 text-xs">
          <span className="tabular-nums font-semibold text-slate-900 dark:text-white">{(t.allowed_modules || []).length}</span>
          <span className="text-slate-400 dark:text-slate-600">/ {modules.length}</span>
        </div>
        <div className="mt-1.5 h-1 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
          <div className={`h-full rounded-full ${modulePct === 100 ? "bg-emerald-500" : modulePct > 50 ? "bg-amber-500" : "bg-slate-400"}`}
               style={{ width: `${modulePct}%` }} />
        </div>
      </div>

      {/* Users */}
      <div className="hidden md:block tabular-nums text-sm">
        <span className="font-semibold text-slate-900 dark:text-white">{t.user_count}</span>
        <span className="text-slate-400 dark:text-slate-600 text-xs ml-1">user{t.user_count === 1 ? "" : "s"}</span>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 justify-end">
        <button data-testid={`impersonate-${t.id}`} onClick={onImpersonate}
          disabled={!t.is_active || !t.admin_email || impersonating}
          title={!t.is_active ? "Resume the tenant to sign in" : `Sign in as ${t.admin_email}`}
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-slate-900 dark:bg-white text-white dark:text-slate-900 hover:bg-amber-500 dark:hover:bg-amber-500 dark:hover:text-white text-[10px] uppercase tracking-[0.12em] font-bold transition-colors disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-slate-900 dark:disabled:hover:bg-white dark:disabled:hover:text-slate-900">
          <LogIn size={11} strokeWidth={2.75} />
          <span className="hidden lg:inline">{impersonating ? "…" : "Login"}</span>
        </button>
        {t.is_active ? (
          <IconAction testid={`hold-tenant-${t.id}`} title="Put on hold" onClick={onHold}
            className="hover:text-amber-600"><Pause size={13} strokeWidth={2.5} /></IconAction>
        ) : (
          <IconAction testid={`resume-tenant-${t.id}`} title="Resume tenant" onClick={onResume}
            className="hover:text-emerald-600"><Play size={13} strokeWidth={2.5} /></IconAction>
        )}
        <IconAction testid={`backup-tenant-${t.id}`} title="Download JSON backup" onClick={onBackup}
          className="hover:text-sky-600"><Download size={13} strokeWidth={2.5} /></IconAction>
        {t.id !== 1 && (
          <IconAction testid={`delete-tenant-${t.id}`} title="Delete (backup first)" onClick={onDelete}
            className="hover:text-rose-600"><Trash2 size={13} strokeWidth={2.5} /></IconAction>
        )}
        <IconAction testid={`open-tenant-${t.id}`} title="Edit tenant" onClick={onOpen}
          className="hover:text-slate-900 dark:hover:text-white"><ChevronRight size={15} /></IconAction>
      </div>
    </div>
  );
}


function IconAction({ testid, title, onClick, className = "", children }) {
  return (
    <button data-testid={testid} title={title}
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      className={`p-1.5 rounded-md text-slate-400 dark:text-slate-500 transition-colors ${className}`}>
      {children}
    </button>
  );
}


/* --------------------------------------------------------------------- */
/* Create tenant modal                                                     */
/* --------------------------------------------------------------------- */
function CreateTenantModal({ modules, onClose, onCreated }) {
  const [name, setName] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [adminName, setAdminName] = useState("");
  const [password, setPassword] = useState("");
  const [selected, setSelected] = useState(new Set(modules));
  const [saving, setSaving] = useState(false);

  const toggle = (m) => {
    const next = new Set(selected);
    next.has(m) ? next.delete(m) : next.add(m);
    setSelected(next);
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!name || !adminEmail || !adminName || !password) return;
    setSaving(true);
    try {
      await api.post("/tenants", {
        name, admin_email: adminEmail, admin_name: adminName,
        admin_password: password, allowed_modules: Array.from(selected),
      });
      toast.success(`Tenant "${name}" created`);
      onCreated();
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || "Create failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm overflow-y-auto" data-testid="create-tenant-modal">
      <form onSubmit={submit} className="w-full max-w-2xl my-8 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden">
        <div className="px-6 py-5 border-b border-slate-200 dark:border-slate-800 flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-slate-900 dark:bg-white text-white dark:text-slate-900 flex items-center justify-center">
            <Building2 size={16} strokeWidth={2.5} />
          </div>
          <div>
            <h2 className="font-heading font-semibold text-lg text-slate-900 dark:text-white leading-tight">Provision a new company</h2>
            <div className="text-xs text-slate-500 dark:text-slate-400">Create the tenant + initial Admin login in one step.</div>
          </div>
        </div>

        <div className="p-6 space-y-5 max-h-[70vh] overflow-y-auto">
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="text-[10px] uppercase tracking-[0.15em] font-semibold text-slate-500 dark:text-slate-400 block mb-1.5">Company name</label>
              <input required data-testid="tenant-name-input" value={name} onChange={(e) => setName(e.target.value)}
                className="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/40" />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-[0.15em] font-semibold text-slate-500 dark:text-slate-400 block mb-1.5">Admin name</label>
              <input required data-testid="tenant-admin-name-input" value={adminName} onChange={(e) => setAdminName(e.target.value)}
                className="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/40" />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-[0.15em] font-semibold text-slate-500 dark:text-slate-400 block mb-1.5">Admin email</label>
              <input required type="email" data-testid="tenant-admin-email-input" value={adminEmail} onChange={(e) => setAdminEmail(e.target.value)}
                className="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/40" />
            </div>
            <div className="sm:col-span-2">
              <label className="text-[10px] uppercase tracking-[0.15em] font-semibold text-slate-500 dark:text-slate-400 block mb-1.5">Admin password</label>
              <input required type="text" minLength={6} data-testid="tenant-admin-password-input" value={password} onChange={(e) => setPassword(e.target.value)}
                placeholder="Min 6 characters"
                className="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-amber-500/40" />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="text-[10px] uppercase tracking-[0.15em] font-semibold text-slate-500 dark:text-slate-400">Allowed modules</div>
              <div className="text-xs font-semibold text-slate-900 dark:text-white tabular-nums">{selected.size} of {modules.length}</div>
            </div>
            <div className="grid sm:grid-cols-2 gap-1.5">
              {modules.map((m) => (
                <ModuleChip key={m} module={m} label={MODULE_LABELS[m] || m} active={selected.has(m)} onToggle={() => toggle(m)} testidPrefix="tenant-module" />
              ))}
            </div>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-800 flex justify-end gap-2 bg-slate-50/50 dark:bg-slate-900/50">
          <button type="button" onClick={onClose}
            className="px-4 py-2 text-[11px] uppercase tracking-[0.15em] font-semibold text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white">
            Cancel
          </button>
          <button type="submit" disabled={saving} data-testid="tenant-create-submit"
            className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-lg bg-slate-900 dark:bg-white text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-100 text-[11px] uppercase tracking-[0.15em] font-semibold disabled:opacity-50 shadow-sm">
            {saving ? "Creating…" : (<>Create Tenant <ArrowUpRight size={12} strokeWidth={2.75} /></>)}
          </button>
        </div>
      </form>
    </div>
  );
}


/* --------------------------------------------------------------------- */
/* Edit tenant modal                                                       */
/* --------------------------------------------------------------------- */
function EditTenantModal({ tenant, modules, onClose, onSave }) {
  const [name, setName] = useState(tenant.name);
  const [isActive, setIsActive] = useState(tenant.is_active);
  const [selected, setSelected] = useState(new Set(tenant.allowed_modules || []));

  const { data: summary } = useQuery({
    queryKey: ["tenant-summary", tenant.id],
    queryFn: () => api.get(`/tenants/${tenant.id}/data-summary`).then((r) => r.data),
  });

  const toggle = (m) => {
    const next = new Set(selected);
    next.has(m) ? next.delete(m) : next.add(m);
    setSelected(next);
  };

  const SUMMARY_LABELS = {
    users: "Users", projects: "Projects", clients: "Clients",
    vendors: "Vendors", employees: "Employees", estimates: "Estimates",
    concept_generations: "AI Concepts", model3d_files: "3D Models",
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm overflow-y-auto" data-testid="edit-tenant-modal">
      <div className="w-full max-w-3xl my-8 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden">
        <div className="px-6 py-5 border-b border-slate-200 dark:border-slate-800 flex items-center gap-4">
          <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${gradientFor(tenant.id)} text-white font-heading font-semibold text-sm flex items-center justify-center shadow-md`}>
            {initialsFor(tenant.name)}
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="font-heading font-semibold text-lg text-slate-900 dark:text-white truncate">{tenant.name}</h2>
            <div className="text-xs text-slate-500 dark:text-slate-400 font-mono truncate">
              {tenant.admin_email || "no admin"} · #{tenant.id} · {tenant.slug}
            </div>
          </div>
        </div>

        <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto">
          {/* Data drill-down */}
          {summary && (
            <div data-testid="tenant-data-summary">
              <div className="text-[10px] uppercase tracking-[0.15em] font-semibold text-slate-500 dark:text-slate-400 mb-2">Data in this tenant</div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {Object.entries(SUMMARY_LABELS).map(([k, label]) => (
                  <div key={k} className="rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 px-3 py-2.5">
                    <div className="text-[9px] uppercase tracking-[0.15em] font-semibold text-slate-500 dark:text-slate-400">{label}</div>
                    <div className="text-lg font-heading font-semibold text-slate-900 dark:text-white tabular-nums leading-tight">{summary[k] ?? 0}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div>
            <label className="text-[10px] uppercase tracking-[0.15em] font-semibold text-slate-500 dark:text-slate-400 block mb-1.5">Company name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} data-testid="edit-tenant-name"
              className="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/40" />
          </div>

          <label className="flex items-center gap-3 cursor-pointer p-3.5 rounded-lg bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800">
            <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} data-testid="edit-tenant-active"
              className="w-4 h-4 rounded border-slate-300 dark:border-slate-700 text-amber-600 focus:ring-amber-500/40" />
            <div>
              <div className="text-sm font-semibold text-slate-900 dark:text-white">Tenant is active</div>
              <div className="text-xs text-slate-500 dark:text-slate-400">Users can log in. Uncheck to put every user on hold.</div>
            </div>
          </label>

          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="text-[10px] uppercase tracking-[0.15em] font-semibold text-slate-500 dark:text-slate-400">Allowed modules</div>
              <div className="text-xs font-semibold text-slate-900 dark:text-white tabular-nums">{selected.size} of {modules.length}</div>
            </div>
            <div className="grid sm:grid-cols-2 gap-1.5">
              {modules.map((m) => (
                <ModuleChip key={m} module={m} label={MODULE_LABELS[m] || m} active={selected.has(m)} onToggle={() => toggle(m)} testidPrefix="edit-module" />
              ))}
            </div>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-800 flex justify-end gap-2 bg-slate-50/50 dark:bg-slate-900/50">
          <button type="button" onClick={onClose}
            className="px-4 py-2 text-[11px] uppercase tracking-[0.15em] font-semibold text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white">
            Cancel
          </button>
          <button type="button" data-testid="edit-tenant-save"
            onClick={() => onSave({ name, is_active: isActive, allowed_modules: Array.from(selected) })}
            className="px-5 py-2.5 rounded-lg bg-slate-900 dark:bg-white text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-100 text-[11px] uppercase tracking-[0.15em] font-semibold shadow-sm">
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );
}


function ModuleChip({ module: m, label, active, onToggle, testidPrefix }) {
  return (
    <button type="button" onClick={onToggle} data-testid={`${testidPrefix}-${m}`}
      className={`flex items-center justify-between px-3 py-2.5 rounded-lg text-sm text-left transition-all ${
        active
          ? "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 ring-1 ring-emerald-500/40"
          : "bg-slate-50 dark:bg-slate-800/40 text-slate-600 dark:text-slate-400 ring-1 ring-slate-200 dark:ring-slate-700 hover:ring-slate-300 dark:hover:ring-slate-600"
      }`}>
      <span className="truncate">{label}</span>
      {active ? <Check size={14} strokeWidth={2.75} /> : <X size={14} strokeWidth={2.5} className="opacity-30" />}
    </button>
  );
}


/* --------------------------------------------------------------------- */
/* All users tab                                                           */
/* --------------------------------------------------------------------- */
function AllUsersTab({ tenants }) {
  const rows = [];
  tenants.forEach((t) => {
    (t.users || []).length === 0 && t.admin_email && rows.push({
      id: `${t.id}-admin`, tenant_name: t.name, tenant_id: t.id,
      email: t.admin_email, name: t.admin_name, role: "Admin",
    });
  });
  return (
    <div className="rounded-xl bg-white dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800 overflow-hidden" data-testid="all-users-tab">
      <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
        <div>
          <div className="font-heading font-semibold text-slate-900 dark:text-white">All users across tenants</div>
          <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">One row per tenant Admin. Detailed rosters live inside each tenant.</div>
        </div>
      </div>
      <div className="divide-y divide-slate-100 dark:divide-slate-800/60">
        <div className="hidden md:grid grid-cols-[minmax(0,1fr)_240px_120px_120px] gap-4 px-6 py-3 bg-slate-50/60 dark:bg-slate-900/60 text-[10px] uppercase tracking-[0.18em] font-semibold text-slate-500">
          <div>Tenant</div><div>Admin email</div><div>Users</div><div>Modules</div>
        </div>
        {tenants.map((t) => (
          <div key={t.id} className="grid md:grid-cols-[minmax(0,1fr)_240px_120px_120px] gap-4 px-6 py-3 items-center text-sm" data-testid={`allusers-row-${t.id}`}>
            <div className="font-heading font-semibold text-slate-900 dark:text-white truncate">{t.name}</div>
            <div className="text-slate-500 dark:text-slate-400 font-mono text-xs truncate">{t.admin_email || "—"}</div>
            <div className="tabular-nums text-slate-900 dark:text-white">{t.user_count}</div>
            <div className="tabular-nums text-slate-500 dark:text-slate-400">{(t.allowed_modules || []).length}</div>
          </div>
        ))}
      </div>
    </div>
  );
}


/* --------------------------------------------------------------------- */
/* Modules tab                                                             */
/* --------------------------------------------------------------------- */
function ModulesTab({ tenants, modules, moduleLabels }) {
  return (
    <div className="rounded-xl bg-white dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800 overflow-hidden" data-testid="modules-tab">
      <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800">
        <div className="font-heading font-semibold text-slate-900 dark:text-white">Module catalog</div>
        <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Every module Sitera offers and how many tenants have it enabled.</div>
      </div>
      <div className="divide-y divide-slate-100 dark:divide-slate-800/60">
        <div className="hidden md:grid grid-cols-[minmax(0,1fr)_140px_1fr] gap-4 px-6 py-3 bg-slate-50/60 dark:bg-slate-900/60 text-[10px] uppercase tracking-[0.18em] font-semibold text-slate-500">
          <div>Module</div><div>Adoption</div><div>Tenants using it</div>
        </div>
        {modules.map((m) => {
          const using = tenants.filter((t) => (t.allowed_modules || []).includes(m));
          const pct = tenants.length ? Math.round((using.length * 100) / tenants.length) : 0;
          return (
            <div key={m} className="grid md:grid-cols-[minmax(0,1fr)_140px_1fr] gap-4 px-6 py-3 items-center text-sm" data-testid={`module-row-${m}`}>
              <div>
                <div className="font-heading font-semibold text-slate-900 dark:text-white">{moduleLabels[m] || m}</div>
                <div className="text-[10px] text-slate-500 dark:text-slate-500 font-mono mt-0.5">{m}</div>
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="font-semibold text-slate-900 dark:text-white tabular-nums">{using.length}</span>
                  <span className="text-xs text-slate-400 dark:text-slate-600">/ {tenants.length}</span>
                </div>
                <div className="mt-1.5 h-1 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                  <div className={`h-full ${pct === 100 ? "bg-emerald-500" : pct > 0 ? "bg-amber-500" : "bg-slate-300 dark:bg-slate-700"}`} style={{ width: `${pct}%` }} />
                </div>
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400">
                {using.length === 0 ? <span className="italic">Not adopted yet</span> :
                  using.map((t) => t.name).join(" · ")}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}


/* --------------------------------------------------------------------- */
/* Audit log placeholder                                                   */
/* --------------------------------------------------------------------- */
function AuditTab() {
  return (
    <div className="rounded-xl bg-white dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800 p-12 text-center" data-testid="audit-tab">
      <div className="w-14 h-14 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center mx-auto mb-3">
        <Activity size={22} className="text-slate-400" strokeWidth={2.25} />
      </div>
      <div className="font-heading font-semibold text-slate-900 dark:text-white">Audit log — coming soon</div>
      <div className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-md mx-auto">
        Every impersonation, tenant update, module change, and destructive action will be logged here with actor + timestamp.
      </div>
    </div>
  );
}
