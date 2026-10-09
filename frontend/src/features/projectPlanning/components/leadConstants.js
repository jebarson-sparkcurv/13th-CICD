// Display metadata for the Leads module. Status keys match the backend
// (app/models/leads.py LEAD_STATUSES).

export const LEAD_STATUS_META = {
  New:          { label: "New",           chip: "chip-info",    dot: "bg-sky-500" },
  Contacted:    { label: "Contacted",     chip: "",             dot: "bg-slate-400" },
  Qualified:    { label: "Qualified",     chip: "chip-info",    dot: "bg-indigo-500" },
  SiteVisit:    { label: "Site Visit",    chip: "chip-warning", dot: "bg-amber-500" },
  ProposalSent: { label: "Proposal Sent", chip: "chip-warning", dot: "bg-orange-500" },
  Negotiation:  { label: "Negotiation",   chip: "chip-warning", dot: "bg-fuchsia-500" },
  Won:          { label: "Won",           chip: "chip-success", dot: "bg-emerald-500" },
  Lost:         { label: "Lost",          chip: "chip-danger",  dot: "bg-rose-500" },
};

export const LEAD_STATUSES = Object.keys(LEAD_STATUS_META);
export const OPEN_STATUSES = LEAD_STATUSES.filter((s) => s !== "Won" && s !== "Lost");

export const LEAD_SOURCES = ["Website", "Walk-in", "Referral", "Phone Call", "WhatsApp",
  "Facebook", "Instagram", "Google Ads", "JustDial", "IndiaMART", "Existing Client", "Other"];

export const LEAD_PRIORITIES = ["Low", "Medium", "High"];

export const PROJECT_TYPES = ["Residential", "Commercial", "Interior", "Renovation",
  "Villa", "Apartment", "Industrial", "Other"];

export const ACTIVITY_TYPES = [
  { key: "Call", label: "Call" },
  { key: "WhatsApp", label: "WhatsApp" },
  { key: "Email", label: "Email" },
  { key: "Meeting", label: "Meeting" },
  { key: "SiteVisit", label: "Site Visit" },
  { key: "Note", label: "Note" },
];

export const PRIORITY_CHIP = { High: "chip-danger", Medium: "chip-warning", Low: "" };

export const statusLabel = (s) => LEAD_STATUS_META[s]?.label || s;

export const fmtINR = (n) =>
  n == null || n === "" ? "—" : `₹${Number(n).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;

export const fmtCompactINR = (n) => {
  const v = Number(n || 0);
  if (v >= 1e7) return `₹${(v / 1e7).toFixed(v >= 1e8 ? 0 : 2)} Cr`;
  if (v >= 1e5) return `₹${(v / 1e5).toFixed(v >= 1e6 ? 1 : 2)} L`;
  return `₹${v.toLocaleString("en-IN")}`;
};

export const fmtDateTime = (iso) =>
  iso ? new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : "—";

export const fmtRelative = (iso) => {
  if (!iso) return "—";
  const diff = new Date(iso).getTime() - Date.now();
  const abs = Math.abs(diff);
  const mins = Math.round(abs / 60000);
  const hrs = Math.round(abs / 3600000);
  const days = Math.round(abs / 86400000);
  const txt = mins < 60 ? `${mins}m` : hrs < 24 ? `${hrs}h` : `${days}d`;
  return diff < 0 ? `${txt} ago` : `in ${txt}`;
};

// <input type="datetime-local"> <-> ISO helpers (local time on both sides)
export const toLocalInput = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (x) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
export const fromLocalInput = (v) => (v ? new Date(v).toISOString() : null);

export const waLink = (phone, text = "") => {
  let d = String(phone || "").replace(/\D/g, "");
  if (d.length === 10) d = `91${d}`;
  return `https://wa.me/${d}${text ? `?text=${encodeURIComponent(text)}` : ""}`;
};
