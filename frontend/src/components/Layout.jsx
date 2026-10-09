import { useState, useEffect } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { LayoutDashboard, Building2, Users, LogOut, IndianRupee, Truck, UserCog, FileText, ClipboardCheck, Sun, Moon, Calculator, Menu, X, PanelLeftClose, PanelLeftOpen, Sparkles, Target, CalendarCheck } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import { NotificationBell } from "./NotificationBell";

const STAFF = ["Admin", "SiteEngineer", "Accountant", "ProcurementOfficer"];
const navItems = [
  { to: "/admin", label: "Dashboard", icon: LayoutDashboard, end: true, roles: [...STAFF, "Client"], module: null },
  { to: "/admin/projects", label: "Projects", icon: Building2, roles: [...STAFF, "Client"], module: "projects" },
  { to: "/portal/site-engineer", label: "Field Ops", icon: ClipboardCheck, roles: ["Admin", "SiteEngineer", "Client"], module: "field_ops" },
  { to: "/admin/leads", label: "Leads", icon: Target, roles: STAFF, module: "leads" },
  { to: "/admin/clients", label: "Clients", icon: Users, roles: ["Admin", "SiteEngineer", "Accountant"], module: "clients" },
  { to: "/admin/finance", label: "Finance", icon: IndianRupee, roles: ["Admin", "Accountant"], module: "finance" },
  { to: "/admin/estimates", label: "Estimates", icon: Calculator, roles: ["Admin", "Accountant", "SiteEngineer", "ProcurementOfficer"], module: "estimates" },
  { to: "/admin/concepts", label: "AI Studio", icon: Sparkles, roles: ["Admin", "Accountant", "SiteEngineer", "ProcurementOfficer", "Client"], module: "concept_studio" },
  { to: "/admin/procurement/vendors", label: "Vendors", icon: Truck, roles: ["Admin", "SiteEngineer", "ProcurementOfficer"], module: "procurement" },
  { to: "/my/attendance", label: "My Attendance", icon: CalendarCheck, roles: ["SiteEngineer", "Accountant", "ProcurementOfficer"], module: "leave_attendance" },
  { to: "/admin/users", label: "Users", icon: UserCog, roles: ["Admin"], module: null },
  { to: "/portal/vendor/dashboard", label: "Dashboard", icon: LayoutDashboard, roles: ["Vendor"], module: "vendor_portal" },
  { to: "/portal/vendor/bid-packages", label: "Bid Invites", icon: FileText, roles: ["Vendor"], module: "vendor_portal" },
];

export default function Layout({ children }) {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem("sitera:nav") === "collapsed"; } catch { return false; }
  });

  useEffect(() => {
    try { localStorage.setItem("sitera:nav", collapsed ? "collapsed" : "expanded"); } catch { /* noop */ }
  }, [collapsed]);

  const width = collapsed ? "w-16" : "w-60";
  const marginLeft = collapsed ? "lg:ml-16" : "lg:ml-60";

  // Effective modules: null = unrestricted (SuperAdmin), [] = locked out,
  //                    [...] = only these module keys are visible.
  const effective = user?.effective_modules ?? null;
  const items = navItems.filter((i) => {
    if (!i.roles.includes(user?.role)) return false;
    if (i.module == null) return true; // Dashboard / Users always visible
    if (effective == null) return true; // SuperAdmin — unrestricted
    return effective.includes(i.module);
  });

  return (
    <div className="flex min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      {open && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm z-40 lg:hidden animate-in fade-in duration-200" data-testid="sidebar-overlay"
          onClick={() => setOpen(false)} />
      )}
      <aside data-testid="sidebar"
        className={`${width} shrink-0 border-r border-slate-800/60 bg-slate-950 flex flex-col fixed inset-y-0 z-50 transform transition-all duration-300 ease-out lg:translate-x-0 ${open ? "translate-x-0 shadow-2xl w-60" : "-translate-x-full lg:translate-x-0"}`}>
        <div className={`h-16 flex items-center justify-between border-b border-slate-800/60 ${collapsed ? "px-3" : "px-4"}`}>
          {!collapsed ? (
            <div data-testid="sidebar-logo" className="flex items-center gap-2.5 min-w-0">
              <div className="bg-white rounded-md p-1 w-9 h-9 flex items-center justify-center shrink-0">
                <img src="/sitera-logo.png" alt="Sitera logo" className="w-7 h-7 object-contain" />
              </div>
              <div className="min-w-0">
                <div className="font-heading font-bold text-xl tracking-tight leading-none text-white">
                  SITE<span className="text-amber-400">RA</span>
                </div>
                <div className="text-[8px] uppercase tracking-[0.22em] text-slate-500 mt-0.5 truncate">Building Excellence</div>
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-md p-1 w-9 h-9 flex items-center justify-center mx-auto" data-testid="sidebar-logo-collapsed">
              <img src="/sitera-logo.png" alt="Sitera" className="w-7 h-7 object-contain" />
            </div>
          )}
          <button className="lg:hidden p-1.5 text-slate-400 hover:text-white rounded-md hover:bg-slate-800/60 transition-colors" data-testid="sidebar-close"
            onClick={() => setOpen(false)}><X size={18} /></button>
        </div>

        <nav className={`flex-1 py-4 space-y-0.5 overflow-y-auto ${collapsed ? "px-2" : "px-3"}`}>
          {items.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              onClick={() => setOpen(false)}
              title={collapsed ? label : undefined}
              data-testid={`nav-${label.toLowerCase()}`}
              className={({ isActive }) =>
                `group relative flex items-center ${collapsed ? "justify-center" : "gap-3"} px-3 py-2.5 text-sm font-medium rounded-lg transition-all duration-150 ${
                  isActive
                    ? "bg-amber-500/10 text-amber-400 ring-1 ring-inset ring-amber-500/20"
                    : "text-slate-400 hover:text-white hover:bg-slate-800/50"
                }`
              }
            >
              <Icon size={collapsed ? 19 : 17} strokeWidth={2.25} className="shrink-0" />
              {!collapsed && (
                <span className="uppercase tracking-[0.12em] text-[11px] font-semibold truncate">{label}</span>
              )}
              {collapsed && (
                <span className="absolute left-full ml-2 z-50 px-2.5 py-1.5 rounded-md bg-slate-900 border border-slate-700 text-slate-100 text-[11px] uppercase tracking-[0.12em] font-semibold whitespace-nowrap opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity shadow-xl">
                  {label}
                </span>
              )}
            </NavLink>
          ))}
        </nav>

        <div className={`${collapsed ? "px-2" : "px-3"} pb-2`}>
          <NotificationBell collapsed={collapsed} />
        </div>

        <div className={`border-t border-slate-800/60 ${collapsed ? "p-2 space-y-2" : "p-4"}`}>
          {!collapsed ? (
            <>
              <div className="flex items-center gap-3 mb-3">
                <div className="w-9 h-9 bg-gradient-to-br from-amber-500/20 to-amber-500/5 border border-amber-500/30 rounded-lg flex items-center justify-center font-heading font-bold text-amber-400 shrink-0">
                  {user?.name?.[0]?.toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold truncate text-white" data-testid="user-name">{user?.name}</div>
                  <div className="text-[10px] uppercase tracking-[0.15em] text-slate-500 mt-0.5">{user?.role}</div>
                </div>
                <button data-testid="theme-toggle" onClick={toggleTheme}
                  title={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
                  className="p-2 rounded-lg border border-slate-800 text-slate-400 hover:text-amber-400 hover:border-slate-700 hover:bg-slate-800/50 transition-colors">
                  {theme === "dark" ? <Sun size={15} strokeWidth={2.25} /> : <Moon size={15} strokeWidth={2.25} />}
                </button>
              </div>
              <button data-testid="logout-button"
                onClick={async () => { await logout(); navigate("/login"); }}
                className="w-full flex items-center justify-center gap-2 border border-slate-800 rounded-lg py-2 text-[11px] uppercase tracking-[0.15em] font-semibold text-slate-400 hover:text-white hover:border-slate-700 hover:bg-slate-800/50 transition-colors tap-scale">
                <LogOut size={13} strokeWidth={2.5} /> Sign Out
              </button>
            </>
          ) : (
            <>
              <button data-testid="theme-toggle-collapsed" onClick={toggleTheme}
                title={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
                className="w-full p-2.5 rounded-lg text-slate-400 hover:text-amber-400 hover:bg-slate-800/50 transition-colors flex items-center justify-center">
                {theme === "dark" ? <Sun size={17} strokeWidth={2.25} /> : <Moon size={17} strokeWidth={2.25} />}
              </button>
              <button data-testid="logout-collapsed" title="Sign out"
                onClick={async () => { await logout(); navigate("/login"); }}
                className="w-full p-2.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800/50 transition-colors flex items-center justify-center">
                <LogOut size={17} strokeWidth={2.25} />
              </button>
            </>
          )}
        </div>

        {/* Collapse toggle rail (desktop only) — flips the whole sidebar */}
        <button data-testid="sidebar-collapse-toggle"
          onClick={() => setCollapsed((c) => !c)}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="hidden lg:flex absolute -right-3 top-20 w-6 h-6 items-center justify-center rounded-full bg-slate-900 border border-slate-700 text-slate-300 hover:text-amber-400 hover:border-amber-500/50 transition-colors shadow-lg z-10">
          {collapsed ? <PanelLeftOpen size={12} strokeWidth={2.5} /> : <PanelLeftClose size={12} strokeWidth={2.5} />}
        </button>
      </aside>

      <div className={`flex-1 min-w-0 ${marginLeft} flex flex-col transition-[margin] duration-300 ease-out`}>
        <header className="lg:hidden sticky top-0 z-30 h-14 flex items-center gap-3 px-4 glass-header" data-testid="mobile-topbar">
          <button data-testid="mobile-menu-button" onClick={() => setOpen(true)}
            className="p-2 -ml-2 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800/60 transition-colors">
            <Menu size={20} />
          </button>
          <div className="flex items-center gap-2">
            <div className="bg-slate-900 rounded-md p-1 w-7 h-7 flex items-center justify-center shrink-0">
              <img src="/sitera-logo.png" alt="Sitera" className="w-5 h-5 object-contain" />
            </div>
            <div className="font-heading font-bold text-base tracking-tight leading-none">
              SITE<span className="text-amber-500">RA</span>
            </div>
          </div>
        </header>
        <ImpersonationBanner />
        <main className="flex-1 min-w-0">{children}</main>
      </div>
    </div>
  );
}


function ImpersonationBanner() {
  const [info, setInfo] = useState(null);
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("sitera_impersonation");
      if (raw) setInfo(JSON.parse(raw));
    } catch (e) { /* ignore */ }
  }, []);
  if (!info) return null;
  const exit = async () => {
    try { sessionStorage.removeItem("sitera_impersonation"); } catch (e) {}
    // Sign out the impersonated session and return to SuperAdmin login.
    try { await fetch(`${process.env.REACT_APP_BACKEND_URL}/api/auth/logout`, {
      method: "POST", credentials: "include" }); } catch (e) {}
    window.location.href = "/login";
  };
  return (
    <div className="sticky top-0 z-40 bg-amber-500 text-slate-900 px-4 py-2 flex items-center justify-center gap-3 text-xs sm:text-sm font-semibold shadow-md" data-testid="impersonation-banner">
      <span className="inline-block w-2 h-2 rounded-full bg-slate-900 animate-pulse" />
      Impersonating <span className="font-mono">{info.admin_email}</span> · {info.tenant_name}
      <button onClick={exit} data-testid="exit-impersonation"
        className="ml-2 inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-slate-900 text-white text-[10px] uppercase tracking-[0.15em] font-semibold hover:bg-slate-800 transition-colors">
        Exit
      </button>
    </div>
  );
}
