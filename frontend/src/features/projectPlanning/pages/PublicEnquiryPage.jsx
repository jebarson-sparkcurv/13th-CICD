import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import axios from "axios";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";

const API = process.env.REACT_APP_BACKEND_URL;

const inputCls = "mt-1 w-full h-11 px-3 rounded-md border border-slate-300 bg-white text-slate-900 text-[15px] focus:outline-none focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500";
const labelCls = "text-xs font-semibold uppercase tracking-[0.12em] text-slate-500";

function Shell({ embed, children }) {
  return (
    <div className={`${embed ? "bg-white" : "min-h-screen bg-slate-100"} flex justify-center ${embed ? "p-0" : "p-4 sm:p-8"}`}>
      <div className={`w-full max-w-lg bg-white ${embed ? "" : "rounded-xl border border-slate-200 shadow-sm"} overflow-hidden`} data-testid="public-enquiry-page">
        {children}
      </div>
    </div>
  );
}

/** Public, no-login enquiry form. Can be opened directly or embedded via
 *  <iframe src=".../enquiry/<token>?embed=1">. Always light-themed so it
 *  looks right on any customer website. */
export default function PublicEnquiryPage() {
  const { token } = useParams();
  const [params] = useSearchParams();
  const embed = params.get("embed") === "1";
  const [info, setInfo] = useState(null);
  const [error, setError] = useState(null);
  const [form, setForm] = useState({ name: "", phone: "", email: "", location: "", project_type: "", budget: "", requirement: "", website: "" });
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [formError, setFormError] = useState("");

  useEffect(() => {
    axios.get(`${API}/api/public/lead-form/${token}`)
      .then((r) => setInfo(r.data))
      .catch((e) => setError(e.response?.data?.detail || "This form is not available"));
  }, [token]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async (e) => {
    e.preventDefault();
    setFormError("");
    if (!form.name.trim()) return setFormError("Please enter your name");
    if (!form.phone.trim() && !form.email.trim()) return setFormError("Please enter a phone number or email so we can reach you");
    setBusy(true);
    try {
      await axios.post(`${API}/api/public/lead-form/${token}`, form);
      setDone(true);
    } catch (err) {
      const d = err.response?.data?.detail;
      setFormError(typeof d === "string" ? d : "Something went wrong. Please try again.");
    } finally { setBusy(false); }
  };

  if (error) return (
    <Shell embed={embed}><div className="p-10 text-center"><XCircle size={40} className="text-slate-300 mx-auto mb-3" /><p className="font-semibold text-slate-700">{error}</p></div></Shell>
  );
  if (!info) return <Shell embed={embed}><div className="p-12 flex justify-center"><Loader2 className="animate-spin text-slate-400" /></div></Shell>;
  if (done) return (
    <Shell embed={embed}>
      <div className="p-10 text-center" data-testid="enquiry-done">
        <CheckCircle2 size={48} className="text-emerald-500 mx-auto mb-3" />
        <h2 className="font-heading font-bold text-2xl text-slate-900">Thank you, {form.name.split(" ")[0]}!</h2>
        <p className="text-slate-500 mt-2">We've received your enquiry. Someone from {info.company_name} will contact you shortly.</p>
      </div>
    </Shell>
  );

  return (
    <Shell embed={embed}>
      <div className="px-6 pt-6 pb-4 border-b border-slate-100">
        <div className="text-[11px] uppercase tracking-[0.25em] font-semibold text-amber-600">{info.company_name}</div>
        <h1 className="font-heading font-bold text-2xl text-slate-900 mt-1 leading-tight">{info.headline || "Tell us about your project"}</h1>
        <p className="text-sm text-slate-500 mt-1">Share a few details and our team will get back to you.</p>
      </div>
      <form onSubmit={submit} className="p-6 space-y-4" noValidate>
        <div>
          <label className={labelCls} htmlFor="enq-name">Your name *</label>
          <input id="enq-name" autoComplete="name" value={form.name} onChange={(e) => set("name", e.target.value)} className={inputCls} data-testid="enquiry-name" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={labelCls} htmlFor="enq-phone">Phone *</label>
            <input id="enq-phone" type="tel" inputMode="tel" autoComplete="tel" value={form.phone} onChange={(e) => set("phone", e.target.value)} className={inputCls} data-testid="enquiry-phone" />
          </div>
          <div>
            <label className={labelCls} htmlFor="enq-email">Email</label>
            <input id="enq-email" type="email" autoComplete="email" value={form.email} onChange={(e) => set("email", e.target.value)} className={inputCls} data-testid="enquiry-email" />
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={labelCls} htmlFor="enq-type">Project type</label>
            <select id="enq-type" value={form.project_type} onChange={(e) => set("project_type", e.target.value)} className={inputCls}>
              <option value="">Select…</option>
              {(info.project_types || []).map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls} htmlFor="enq-loc">Site location</label>
            <input id="enq-loc" value={form.location} onChange={(e) => set("location", e.target.value)} className={inputCls} placeholder="City / area" />
          </div>
        </div>
        <div>
          <label className={labelCls} htmlFor="enq-budget">Approximate budget (₹)</label>
          <input id="enq-budget" type="number" inputMode="numeric" min="0" value={form.budget} onChange={(e) => set("budget", e.target.value)} className={inputCls} placeholder="e.g. 3500000" />
        </div>
        <div>
          <label className={labelCls} htmlFor="enq-req">What do you need?</label>
          <textarea id="enq-req" rows={4} value={form.requirement} onChange={(e) => set("requirement", e.target.value)}
            className={`${inputCls} h-auto py-2`} placeholder="Plot size, number of floors, timeline…" />
        </div>
        {/* Honeypot: hidden from people, bots fill it in */}
        <div aria-hidden="true" style={{ position: "absolute", left: "-10000px", width: 1, height: 1, overflow: "hidden" }}>
          <label htmlFor="enq-website">Website</label>
          <input id="enq-website" tabIndex={-1} autoComplete="off" value={form.website} onChange={(e) => set("website", e.target.value)} />
        </div>
        {formError && <p className="text-sm text-rose-600" role="alert" data-testid="enquiry-error">{formError}</p>}
        <button type="submit" disabled={busy} data-testid="enquiry-submit"
          className="w-full h-12 rounded-md bg-slate-900 hover:bg-slate-800 text-white font-semibold uppercase tracking-wide inline-flex items-center justify-center gap-2 disabled:opacity-60">
          {busy && <Loader2 size={16} className="animate-spin" />} Send enquiry
        </button>
        <p className="text-[11px] text-slate-400 text-center">Your details are only shared with {info.company_name}.</p>
      </form>
    </Shell>
  );
}
