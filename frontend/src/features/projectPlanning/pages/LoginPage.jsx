import { useState } from "react";
import { useNavigate, Navigate } from "react-router-dom";
import { Loader2, Sun, Moon } from "lucide-react";
import { useAuth } from "../../../context/AuthContext";
import { useTheme } from "../../../context/ThemeContext";
import { formatApiErrorDetail } from "../../../api/client";

const BG = "https://images.pexels.com/photos/4458205/pexels-photo-4458205.jpeg?auto=compress&cs=tinysrgb&w=1600";

export default function LoginPage() {
  const { user, login } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  if (user) return <Navigate to={user.role === "SuperAdmin" ? "/superadmin" : "/admin"} replace />;

  const submit = async (ev, e = email, p = password) => {
    ev?.preventDefault();
    if (!e || !p) { setError("Email and password are required"); return; }
    setLoading(true);
    setError("");
    try {
      const u = await login(e, p);
      navigate(u?.role === "SuperAdmin" ? "/superadmin" : "/admin");
    } catch (err) {
      setError(formatApiErrorDetail(err.response?.data?.detail) || err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100">
      <div className="hidden lg:block flex-1 relative grain-bg">
        <img src={BG} alt="Architectural blueprint" className="absolute inset-0 w-full h-full object-cover" />
        <div className="absolute inset-0 bg-slate-900/70" />
        <div className="absolute bottom-0 left-0 p-12">
          <div className="text-amber-400 text-xs uppercase tracking-[0.3em] font-semibold mb-4">Construction Management Portal</div>
          <h1 className="font-heading font-bold text-5xl xl:text-6xl leading-[1.05] tracking-tight max-w-lg text-white">
            Build with <span className="text-amber-400">precision.</span><br />Track every phase.
          </h1>
          <p className="text-slate-300 mt-4 max-w-md leading-relaxed">
            Projects, phases and site progress — one command center for your entire construction operation.
          </p>
        </div>
      </div>
      <div className="w-full lg:w-[480px] flex flex-col justify-center px-8 sm:px-14 border-l border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 relative">
        <button data-testid="theme-toggle-login" onClick={toggleTheme}
          title={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
          className="absolute top-6 right-6 p-2 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 hover:text-amber-600 dark:hover:text-amber-400 hover:border-slate-300 dark:hover:border-slate-700 transition-colors">
          {theme === "dark" ? <Sun size={15} strokeWidth={2.5} /> : <Moon size={15} strokeWidth={2.5} />}
        </button>
        <div className="mb-10">
          <div className="inline-flex items-center gap-3">
            <div className="bg-slate-900 rounded-lg p-2 w-11 h-11 flex items-center justify-center shrink-0 ring-1 ring-slate-800">
              <img src="/sitera-logo.png" alt="Sitera" className="w-7 h-7 object-contain" />
            </div>
            <div>
              <div className="font-heading font-bold text-2xl tracking-tight leading-none text-slate-900 dark:text-white">
                SITE<span className="text-amber-500">RA</span>
              </div>
              <div className="text-[9px] uppercase tracking-[0.22em] text-slate-500 mt-1">Building Excellence</div>
            </div>
          </div>
        </div>
        <h2 className="font-heading font-semibold text-3xl tracking-tight mb-1.5">Sign in</h2>
        <p className="text-slate-500 dark:text-slate-400 text-sm mb-8">Access your project command center</p>
        <form onSubmit={submit} className="space-y-5">
          <div>
            <label className="text-[10px] uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400 font-semibold">Email</label>
            <input data-testid="login-email-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)}
              className="mt-2 w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500 focus:bg-white dark:focus:bg-slate-900 transition-all" placeholder="you@company.com" />
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400 font-semibold">Password</label>
            <input data-testid="login-password-input" type="password" value={password} onChange={(e) => setPassword(e.target.value)}
              className="mt-2 w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500 focus:bg-white dark:focus:bg-slate-900 transition-all" placeholder="••••••••" />
          </div>
          {error && <p className="text-rose-600 dark:text-rose-400 text-sm" data-testid="login-error">{error}</p>}
          <button data-testid="login-submit-button" type="submit" disabled={loading}
            className="w-full bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-100 text-white dark:text-slate-900 font-semibold uppercase tracking-[0.15em] rounded-lg py-3.5 text-xs flex items-center justify-center gap-2 transition-all tap-scale disabled:opacity-60 shadow-sm">
            {loading && <Loader2 size={14} className="animate-spin" />} Sign In
          </button>
        </form>
      </div>
    </div>
  );
}
