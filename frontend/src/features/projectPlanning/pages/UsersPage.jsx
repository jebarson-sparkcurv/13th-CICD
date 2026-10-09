import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Pencil, KeyRound, UserX, UserCheck, Trash2, HardHat, ShieldCheck, Check, X } from "lucide-react";
import api, { formatApiErrorDetail } from "../../../api/client";
import { Button } from "../../../components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../../components/ui/select";
import { RoleBadge } from "../components/RoleBadge";
import { UserFormModal } from "../components/UserFormModal";
import { ProjectAssignmentPicker } from "../components/ProjectAssignmentPicker";
import { useSearchParams } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../../components/ui/tabs";
import { useAuth } from "../../../context/AuthContext";
import { LeaveRequestsTab } from "../components/LeaveRequestsTab";
import { StaffAttendanceTab } from "../components/StaffAttendanceTab";

const tabTrigger = "rounded-md px-4 py-2 text-[11px] uppercase tracking-[0.15em] font-semibold text-slate-500 dark:text-slate-400 data-[state=active]:text-slate-900 dark:data-[state=active]:text-slate-100 transition-colors whitespace-nowrap";

const ROLES = ["Admin", "SiteEngineer", "Accountant", "ProcurementOfficer", "Client", "Vendor"];
const STATUSES = ["Invited", "Active", "Disabled"];
const STATUS_STYLE = {
  Active: "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/30",
  Invited: "bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-500/30",
  Disabled: "bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400 border-red-200 dark:border-red-500/30",
};
const MODULE_LABELS = {
  projects: "Projects", phases_tracking: "Phases & Tracking",
  field_ops: "Field Ops", clients: "Clients", leads: "Leads", leave_attendance: "Leave & Attendance", finance: "Finance",
  estimates: "Estimates", procurement: "Procurement",
  change_orders: "Change Orders", model3d_viewer: "3D Viewer",
  concept_studio: "AI Concept", client_portal: "Client Portal",
  vendor_portal: "Vendor Portal", site_engineer_portal: "SE Portal",
};
const fmt = (n) => (n ? `₹${Number(n).toLocaleString("en-IN")}` : "—");

export default function UsersPage() {
  const qc = useQueryClient();
  const { user: me } = useAuth();
  const hrOn = me?.effective_modules == null || me.effective_modules.includes("leave_attendance");
  const [params, setParams] = useSearchParams();
  const tab = hrOn && ["leave", "attendance"].includes(params.get("tab")) ? params.get("tab") : "team";
  const setTab = (t) => setParams(t === "team" ? {} : { tab: t }, { replace: true });
  const { data: leavePending } = useQuery({
    queryKey: ["leaveRequests", "Pending"],
    queryFn: () => api.get("/leave/requests", { params: { status: "Pending" } }).then((r) => r.data),
    enabled: hrOn,
  });
  const [role, setRole] = useState("all");
  const [status, setStatus] = useState("all");
  const [formModal, setFormModal] = useState(false);
  const [editUser, setEditUser] = useState(null);
  const [assignUser, setAssignUser] = useState(null);
  const [permUser, setPermUser] = useState(null);

  const { data: users } = useQuery({
    queryKey: ["allUsers", role, status],
    queryFn: () => api.get("/users/all", {
      params: { ...(role !== "all" && { role }), ...(status !== "all" && { status }) },
    }).then((r) => r.data),
  });

  const { data: allowanceData } = useQuery({
    queryKey: ["admin-module-allowance"],
    queryFn: () => api.get("/users/allowed-modules").then((r) => r.data),
  });
  const tenantAllowed = allowanceData?.modules || [];

  const run = async (fn, ok) => {
    try { await fn(); toast.success(ok); qc.invalidateQueries({ queryKey: ["allUsers"] }); }
    catch (e) { toast.error(formatApiErrorDetail(e.response?.data?.detail) || e.message); }
  };

  const resetPassword = (u) => {
    const pw = window.prompt(`New password for ${u.name} (min 6 chars):`);
    if (!pw) return;
    if (pw.length < 6) { toast.error("Password must be at least 6 characters"); return; }
    run(() => api.post(`/users/${u.id}/reset-password`, { new_password: pw }), "Password reset");
  };

  return (
    <div className="p-4 sm:p-8" data-testid="users-page">
      <div className="flex items-end justify-between mb-8 flex-wrap gap-4">
        <div>
          <div className="text-blue-600 dark:text-blue-400 text-[11px] uppercase tracking-[0.3em] font-semibold mb-1">Administration</div>
          <h1 className="font-heading font-bold text-4xl sm:text-5xl tracking-tight leading-none">Users</h1>
        </div>
        <Button data-testid="add-user-button" onClick={() => { setEditUser(null); setFormModal(true); }}
          className="rounded-md bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-100 text-white dark:text-slate-900 font-bold uppercase tracking-wide">
          <Plus size={15} strokeWidth={3} /> Add User
        </Button>
      </div>
      <Tabs value={tab} onValueChange={setTab}>
      {hrOn && (
        <TabsList className="tab-strip w-fit h-auto justify-start mb-6 bg-slate-100 dark:bg-slate-900/60">
          <TabsTrigger value="team" data-testid="users-tab-team" className={tabTrigger}>Team</TabsTrigger>
          <TabsTrigger value="leave" data-testid="users-tab-leave" className={tabTrigger}>
            Leave Requests{leavePending?.pending_count ? <span className="ml-1.5 inline-flex min-w-[18px] h-[18px] px-1 rounded-full bg-amber-500 text-white text-[10px] items-center justify-center">{leavePending.pending_count}</span> : null}
          </TabsTrigger>
          <TabsTrigger value="attendance" data-testid="users-tab-attendance" className={tabTrigger}>Attendance</TabsTrigger>
        </TabsList>
      )}
      <TabsContent value="team">
      <div className="flex flex-wrap gap-3 mb-6">
        <Select value={role} onValueChange={setRole}>
          <SelectTrigger data-testid="users-role-filter" className="w-48 bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 rounded-md"><SelectValue /></SelectTrigger>
          <SelectContent className="bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700">
            <SelectItem value="all">All Roles</SelectItem>
            {ROLES.map((r) => <SelectItem key={r} value={r}>{r.replace(/([A-Z])/g, " $1").trim()}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger data-testid="users-status-filter" className="w-40 bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 rounded-md"><SelectValue /></SelectTrigger>
          <SelectContent className="bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700">
            <SelectItem value="all">All Statuses</SelectItem>
            {STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="border border-slate-200 dark:border-slate-800 overflow-x-auto">
        <table className="w-full text-sm" data-testid="users-table">
          <thead>
            <tr className="text-left text-[10px] uppercase tracking-[0.15em] text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
              <th className="px-4 py-3">User</th>
              <th className="px-4 py-3">Role</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Modules</th>
              <th className="px-4 py-3 text-right">Base Salary</th>
              <th className="px-4 py-3">Last Login</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {(users || []).map((u) => (
              <tr key={u.id} className="border-b border-slate-100 dark:border-slate-800/60 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors" data-testid={`user-row-${u.id}`}>
                <td className="px-4 py-3">
                  <div className="font-semibold text-slate-900 dark:text-slate-100">{u.name}</div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">{u.email}</div>
                </td>
                <td className="px-4 py-3"><RoleBadge role={u.role} /></td>
                <td className="px-4 py-3">
                  <span className={`inline-block border px-2 py-0.5 text-[11px] uppercase tracking-[0.12em] font-semibold ${STATUS_STYLE[u.status] || STATUS_STYLE.Active}`}>{u.status}</span>
                </td>
                <td className="px-4 py-3">
                  <button data-testid={`modules-${u.id}`} onClick={() => setPermUser(u)}
                    className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] font-semibold text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-800/60 hover:bg-amber-500/10 hover:text-amber-700 dark:hover:text-amber-400 transition-colors">
                    <ShieldCheck size={12} strokeWidth={2.5} />
                    {(u.allowed_modules && u.allowed_modules.length > 0)
                      ? `${u.allowed_modules.length}/${tenantAllowed.length}`
                      : (u.role === "Admin" ? "Full" : `All ${tenantAllowed.length}`)}
                  </button>
                </td>
                <td className="px-4 py-3 text-right text-slate-600 dark:text-slate-400">{fmt(u.base_salary)}</td>
                <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400">{u.last_login_at ? u.last_login_at.slice(0, 10) : "Never"}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-1">
                    {(u.role === "SiteEngineer" || u.role === "ProcurementOfficer") && (
                      <button data-testid={`assign-user-${u.id}`} title="Assign to project" onClick={() => setAssignUser(u)}
                        className="p-1.5 text-slate-500 dark:text-slate-400 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-400 transition-colors"><HardHat size={15} strokeWidth={2.5} /></button>
                    )}
                    <button data-testid={`edit-user-${u.id}`} title="Edit" onClick={() => { setEditUser(u); setFormModal(true); }}
                      className="p-1.5 text-slate-500 dark:text-slate-400 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-400 transition-colors"><Pencil size={15} strokeWidth={2.5} /></button>
                    <button data-testid={`reset-password-${u.id}`} title="Reset password" onClick={() => resetPassword(u)}
                      className="p-1.5 text-slate-500 dark:text-slate-400 hover:text-amber-600 dark:text-amber-400 transition-colors"><KeyRound size={15} strokeWidth={2.5} /></button>
                    {u.status !== "Disabled" ? (
                      <button data-testid={`disable-user-${u.id}`} title="Disable" onClick={() => run(() => api.post(`/users/${u.id}/disable`), `${u.name} disabled`)}
                        className="p-1.5 text-slate-500 dark:text-slate-400 hover:text-red-600 dark:text-red-400 dark:hover:text-red-400 transition-colors"><UserX size={15} strokeWidth={2.5} /></button>
                    ) : (
                      <button data-testid={`enable-user-${u.id}`} title="Enable" onClick={() => run(() => api.patch(`/users/${u.id}`, { status: "Active" }), `${u.name} enabled`)}
                        className="p-1.5 text-slate-500 dark:text-slate-400 hover:text-emerald-600 dark:text-emerald-400 dark:hover:text-emerald-400 transition-colors"><UserCheck size={15} strokeWidth={2.5} /></button>
                    )}
                    <button data-testid={`delete-user-${u.id}`} title="Delete"
                      onClick={() => window.confirm(`Delete ${u.name}? This cannot be undone.`) && run(() => api.delete(`/users/${u.id}`), "User deleted")}
                      className="p-1.5 text-slate-500 dark:text-slate-400 hover:text-red-500 transition-colors"><Trash2 size={15} strokeWidth={2.5} /></button>
                  </div>
                </td>
              </tr>
            ))}
            {(users || []).length === 0 && (
              <tr><td colSpan={7} className="px-4 py-10 text-center text-slate-500 dark:text-slate-400" data-testid="users-empty">No users match the filters.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      </TabsContent>
      {hrOn && <TabsContent value="leave"><LeaveRequestsTab /></TabsContent>}
      {hrOn && <TabsContent value="attendance"><StaffAttendanceTab /></TabsContent>}
      </Tabs>
      <UserFormModal open={formModal} onOpenChange={setFormModal} user={editUser} />
      <ProjectAssignmentPicker open={!!assignUser} onOpenChange={(v) => !v && setAssignUser(null)} targetUser={assignUser || {}} />
      <UserModulesModal user={permUser} onClose={() => setPermUser(null)}
        tenantAllowed={tenantAllowed} moduleLabels={MODULE_LABELS}
        onSaved={() => { setPermUser(null); qc.invalidateQueries({ queryKey: ["allUsers"] }); }} />
    </div>
  );
}


function UserModulesModal({ user, onClose, tenantAllowed, moduleLabels, onSaved }) {
  const [selected, setSelected] = useState(new Set());
  const [inherit, setInherit] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    const has = user.allowed_modules || [];
    setInherit(has.length === 0);
    setSelected(new Set(has));
  }, [user?.id]);

  if (!user) return null;

  const toggle = (m) => {
    const next = new Set(selected);
    next.has(m) ? next.delete(m) : next.add(m);
    setSelected(next);
    if (inherit) setInherit(false);
  };

  const save = async () => {
    setSaving(true);
    try {
      const body = { allowed_modules: inherit ? [] : Array.from(selected) };
      await api.patch(`/users/${user.id}`, body);
      toast.success("Permissions updated");
      onSaved();
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail) || "Update failed");
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm overflow-y-auto" data-testid="user-modules-modal">
      <div className="surface p-6 w-full max-w-2xl my-8">
        <div className="section-eyebrow mb-1">Module permissions</div>
        <h2 className="font-heading font-semibold text-xl text-slate-900 dark:text-slate-100 mb-1">{user.name}</h2>
        <div className="text-xs text-slate-500 dark:text-slate-400 mb-5">
          {user.email} · <span className="font-semibold">{user.role}</span>
        </div>

        <label className="flex items-center gap-2.5 mb-5 cursor-pointer p-3 rounded-lg bg-slate-50 dark:bg-slate-900 ring-1 ring-slate-200 dark:ring-slate-800">
          <input type="checkbox" checked={inherit} onChange={(e) => setInherit(e.target.checked)} data-testid="modules-inherit"
            className="w-4 h-4 rounded border-slate-300 dark:border-slate-700 text-amber-600 focus:ring-amber-500/40" />
          <div>
            <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">Inherit all tenant modules</div>
            <div className="text-xs text-slate-500 dark:text-slate-400">User sees every module the company is entitled to ({tenantAllowed.length} total).</div>
          </div>
        </label>

        <div className={inherit ? "opacity-50 pointer-events-none" : ""}>
          <div className="section-eyebrow mb-2">Custom module set · {selected.size} selected</div>
          <div className="grid sm:grid-cols-2 gap-1.5">
            {tenantAllowed.map((m) => (
              <button key={m} type="button" onClick={() => toggle(m)} data-testid={`umodule-${m}`}
                className={`flex items-center justify-between px-3 py-2 rounded-lg text-sm text-left transition-colors ${
                  selected.has(m)
                    ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 ring-1 ring-emerald-500/30"
                    : "bg-slate-50 dark:bg-slate-900 text-slate-600 dark:text-slate-400 ring-1 ring-slate-200 dark:ring-slate-800 hover:ring-slate-300 dark:hover:ring-slate-700"
                }`}>
                <span className="truncate">{moduleLabels[m] || m}</span>
                {selected.has(m) ? <Check size={14} strokeWidth={2.5} /> : <X size={14} strokeWidth={2.5} className="opacity-40" />}
              </button>
            ))}
            {tenantAllowed.length === 0 && (
              <div className="col-span-2 text-xs text-slate-500 dark:text-slate-400 border border-dashed border-slate-200 dark:border-slate-800 rounded-lg p-4 text-center">
                Your tenant has no modules enabled. Ask your SuperAdmin to enable modules first.
              </div>
            )}
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-6">
          <button type="button" onClick={onClose}
            className="px-4 py-2 text-[11px] uppercase tracking-[0.15em] font-semibold text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white">
            Cancel
          </button>
          <button type="button" onClick={save} disabled={saving} data-testid="save-modules-btn"
            className="px-5 py-2.5 rounded-lg bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-100 text-white dark:text-slate-900 text-[11px] uppercase tracking-[0.15em] font-semibold disabled:opacity-50">
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
