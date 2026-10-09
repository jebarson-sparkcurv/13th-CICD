import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Phone, Mail, MessageCircle, Pencil, Trash2, MapPin, Building2, IndianRupee,
  CalendarClock, UserRound, Trophy, XCircle, CheckCircle2, ArrowRight, Loader2, StickyNote,
  Footprints, Users, Globe, Settings2, Shuffle, Calculator } from "lucide-react";
import api, { formatApiErrorDetail } from "../../../api/client";
import { useAuth } from "../../../context/AuthContext";
import { Skeleton } from "../../../components/ui/skeleton";
import { Button } from "../../../components/ui/button";
import { Textarea } from "../../../components/ui/textarea";
import { Input } from "../../../components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../../../components/ui/dialog";
import { LeadFormModal, selectCls } from "../components/LeadFormModal";
import { useLead, useUpdateLead, useAddLeadActivity, invalidateLeadQueries } from "../hooks/useLeads";
import { useClients } from "../hooks/useProjects";
import { LEAD_STATUS_META, OPEN_STATUSES, ACTIVITY_TYPES, PRIORITY_CHIP, statusLabel, fmtINR,
  fmtDateTime, fmtRelative, toLocalInput, fromLocalInput, waLink } from "../components/leadConstants";

const ACTIVITY_ICON = {
  Call: Phone, WhatsApp: MessageCircle, Email: Mail, Meeting: Users, SiteVisit: Footprints,
  Note: StickyNote, StatusChange: Shuffle, Enquiry: Globe, System: Settings2,
};

const primaryBtn = "rounded-md bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-100 text-white dark:text-slate-900 font-semibold uppercase tracking-wide";

const quickDates = () => {
  const at = (days, h = 10) => { const d = new Date(); d.setDate(d.getDate() + days); d.setHours(h, 0, 0, 0); return d; };
  return [["Tomorrow", at(1)], ["In 3 days", at(3)], ["Next week", at(7)]];
};

function Row({ icon: Icon, label, children }) {
  return (
    <div className="flex items-start gap-3 py-2.5">
      <Icon size={15} className="text-slate-400 mt-0.5 shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="text-[10px] uppercase tracking-[0.15em] text-slate-500 dark:text-slate-400 font-semibold">{label}</div>
        <div className="text-sm text-slate-900 dark:text-slate-100 break-words">{children || <span className="text-slate-400">—</span>}</div>
      </div>
    </div>
  );
}

/** datetime-local that only saves on blur / Enter, so editing the
 *  day-month-year segments doesn't fire a request per keystroke. */
function CustomFollowUp({ value, onSave }) {
  const [v, setV] = useState(toLocalInput(value));
  const commit = () => { if (v && v !== toLocalInput(value)) onSave(fromLocalInput(v)); };
  return (
    <input type="datetime-local" aria-label="Custom follow-up" value={v}
      onChange={(e) => setV(e.target.value)} onBlur={commit}
      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); commit(); } }}
      className="text-xs px-2 py-1 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900" />
  );
}

function ConvertModal({ open, onOpenChange, lead }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { data: clients } = useClients(open);
  const [mode, setMode] = useState("new");
  const [clientId, setClientId] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);

  const convert = async () => {
    setBusy(true);
    try {
      const { data } = await api.post(`/leads/${lead.id}/convert`, mode === "existing" ? { client_id: Number(clientId) } : {});
      invalidateLeadQueries(qc, lead.id);
      qc.invalidateQueries({ queryKey: ["clients"] });
      setDone(data.client);
      toast.success(`${lead.name} is now a client`);
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail));
    } finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) setDone(null); }}>
      <DialogContent className="bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 rounded-md max-w-md" data-testid="lead-convert-modal">
        <DialogHeader>
          <DialogTitle className="font-heading text-2xl uppercase tracking-wide">{done ? "Lead Won 🎉" : "Convert to Client"}</DialogTitle>
          <DialogDescription className="text-xs text-slate-500 dark:text-slate-400">
            {done ? "The client record is ready. What next?" : "Marks the lead as Won and creates (or links) a client record."}
          </DialogDescription>
        </DialogHeader>
        {done ? (
          <div className="space-y-2">
            <Button className={`${primaryBtn} w-full justify-between`} onClick={() => navigate(`/admin/clients/${done.id}`)}>
              Open client {done.name} <ArrowRight size={14} />
            </Button>
            <Button variant="outline" className="w-full justify-between" onClick={() => navigate("/admin/estimates")}>
              <span className="inline-flex items-center gap-2"><Calculator size={14} /> Prepare an estimate</span> <ArrowRight size={14} />
            </Button>
            <Button variant="outline" className="w-full justify-between" onClick={() => navigate("/admin/projects")}>
              <span className="inline-flex items-center gap-2"><Building2 size={14} /> Create a project</span> <ArrowRight size={14} />
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            {[["new", "Create a new client", `From this lead's details — ${lead.name}${lead.phone ? `, ${lead.phone}` : ""}`],
              ["existing", "Link to an existing client", "If this customer is already in your directory"]].map(([k, title, sub]) => (
              <label key={k} className={`flex gap-3 p-3 rounded-lg border cursor-pointer ${mode === k ? "border-amber-500 ring-2 ring-amber-500/20" : "border-slate-200 dark:border-slate-800"}`}>
                <input type="radio" name="convert-mode" checked={mode === k} onChange={() => setMode(k)} className="mt-1 accent-amber-600" />
                <div><div className="font-semibold text-sm">{title}</div><div className="text-xs text-slate-500 dark:text-slate-400">{sub}</div></div>
              </label>
            ))}
            {mode === "existing" && (
              <select value={clientId} onChange={(e) => setClientId(e.target.value)} className={selectCls} data-testid="convert-client-select">
                <option value="">Select a client…</option>
                {(clients || []).filter((c) => c.is_active).map((c) => <option key={c.id} value={c.id}>{c.name}{c.phone ? ` · ${c.phone}` : ""}</option>)}
              </select>
            )}
            <div className="flex justify-end gap-3 pt-2">
              <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button className={primaryBtn} disabled={busy || (mode === "existing" && !clientId)} onClick={convert} data-testid="convert-submit">
                {busy && <Loader2 size={14} className="animate-spin" />} Convert
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function LostModal({ open, onOpenChange, onConfirm, busy }) {
  const [reason, setReason] = useState("");
  const presets = ["Budget too high", "Went with another builder", "Project postponed", "Not reachable", "Not a genuine enquiry"];
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 rounded-md max-w-md">
        <DialogHeader>
          <DialogTitle className="font-heading text-2xl uppercase tracking-wide">Mark as Lost</DialogTitle>
          <DialogDescription className="text-xs text-slate-500 dark:text-slate-400">Recording why helps you spot patterns later.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap gap-1.5">
          {presets.map((p) => (
            <button key={p} type="button" onClick={() => setReason(p)}
              className={`chip ${reason === p ? "chip-danger" : ""} cursor-pointer`}>{p}</button>
          ))}
        </div>
        <Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason" data-testid="lost-reason-input"
          className="bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 rounded-md" />
        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={!reason.trim() || busy} onClick={() => onConfirm(reason.trim())} data-testid="lost-confirm"
            className="rounded-md bg-rose-600 hover:bg-rose-700 text-white font-semibold uppercase tracking-wide">Mark Lost</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function LeadDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { isAdmin } = useAuth();
  const { data: lead, isLoading, error } = useLead(id);
  const update = useUpdateLead();
  const addActivity = useAddLeadActivity(id);
  const [modal, setModal] = useState(null); // edit | convert | lost
  const [actType, setActType] = useState("Call");
  const [note, setNote] = useState("");
  const [nextFU, setNextFU] = useState("");

  if (isLoading) return <div className="p-4 sm:p-8"><Skeleton className="h-96 bg-slate-200 dark:bg-slate-800 rounded-md" /></div>;
  if (error || !lead) return (
    <div className="p-8 text-center text-slate-500">
      Lead not found. <Link to="/admin/leads" className="text-amber-600 font-semibold">Back to leads</Link>
    </div>
  );

  const isOpen = OPEN_STATUSES.includes(lead.status);
  const onErr = (e) => toast.error(formatApiErrorDetail(e.response?.data?.detail));
  const setStatus = (status, extra = {}) => update.mutate({ id: lead.id, status, ...extra }, {
    onSuccess: () => { toast.success(`Moved to ${statusLabel(status)}`); setModal(null); }, onError: onErr,
  });
  const setFollowUp = (iso) => update.mutate({ id: lead.id, next_follow_up: iso }, {
    onSuccess: () => toast.success(iso ? `Follow-up set for ${fmtDateTime(iso)}` : "Follow-up cleared"), onError: onErr,
  });

  const submitActivity = (e) => {
    e.preventDefault();
    if (!note.trim()) { toast.error("Add a short note"); return; }
    const body = { type: actType, content: note.trim() };
    if (nextFU) body.next_follow_up = fromLocalInput(nextFU);
    addActivity.mutate(body, {
      onSuccess: () => { setNote(""); setNextFU(""); toast.success("Activity logged"); }, onError: onErr,
    });
  };

  const remove = async () => {
    if (!window.confirm(`Delete lead "${lead.name}" and its history? This cannot be undone.`)) return;
    try {
      await api.delete(`/leads/${lead.id}`);
      invalidateLeadQueries(qc);
      toast.success("Lead deleted");
      navigate("/admin/leads");
    } catch (e) { onErr(e); }
  };

  const greeting = `Hi ${lead.name.split(" ")[0]}, thank you for your enquiry`;

  return (
    <div className="p-4 sm:p-8" data-testid="lead-detail-page">
      <Link to="/admin/leads" className="inline-flex items-center gap-1.5 text-xs uppercase tracking-[0.15em] font-semibold text-slate-500 hover:text-amber-600 mb-4">
        <ArrowLeft size={13} /> Leads
      </Link>

      <div className="flex items-start justify-between flex-wrap gap-4 mb-5">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className={`chip ${LEAD_STATUS_META[lead.status]?.chip || ""}`} data-testid="lead-status-chip">{statusLabel(lead.status)}</span>
            <span className={`chip ${PRIORITY_CHIP[lead.priority]}`}>{lead.priority} priority</span>
            <span className="chip">{lead.source}</span>
          </div>
          <h1 className="font-heading font-bold text-3xl sm:text-4xl tracking-tight leading-tight">{lead.name}</h1>
          {lead.company && <div className="text-sm text-slate-500 dark:text-slate-400">{lead.company}</div>}
        </div>
        <div className="flex flex-wrap gap-2">
          {lead.phone && <Button variant="outline" size="sm" asChild><a href={`tel:${lead.phone}`} data-testid="lead-call"><Phone size={14} /> Call</a></Button>}
          {lead.phone && <Button variant="outline" size="sm" asChild><a href={waLink(lead.phone, greeting)} target="_blank" rel="noreferrer" data-testid="lead-whatsapp"><MessageCircle size={14} /> WhatsApp</a></Button>}
          {lead.email && <Button variant="outline" size="sm" asChild><a href={`mailto:${lead.email}`}><Mail size={14} /> Email</a></Button>}
          <Button variant="outline" size="sm" onClick={() => setModal("edit")} data-testid="lead-edit"><Pencil size={14} /> Edit</Button>
          {isAdmin && <Button variant="outline" size="sm" onClick={remove} className="text-rose-600 hover:text-rose-700" data-testid="lead-delete"><Trash2 size={14} /></Button>}
        </div>
      </div>

      {/* Pipeline stepper */}
      <div className="surface p-2 mb-5 overflow-x-auto">
        <div className="flex items-center gap-1 min-w-max">
          {OPEN_STATUSES.map((s, i) => {
            const idx = OPEN_STATUSES.indexOf(lead.status);
            const reached = lead.status === "Won" || (idx >= 0 && i <= idx);
            return (
              <button key={s} disabled={update.isPending || !!lead.converted_client_id} onClick={() => setStatus(s)} data-testid={`lead-step-${s}`}
                className={`px-3 py-2 rounded-lg text-xs font-semibold uppercase tracking-wide transition-colors whitespace-nowrap ${
                  lead.status === s ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900"
                    : reached ? "bg-amber-500/10 text-amber-700 dark:text-amber-400 hover:bg-amber-500/20"
                      : "text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"}`}>
                {statusLabel(s)}
              </button>
            );
          })}
          <span className="w-px h-6 bg-slate-200 dark:bg-slate-700 mx-1" />
          {!lead.converted_client_id && isAdmin && (
            <button onClick={() => setModal("convert")} data-testid="lead-convert"
              className="px-3 py-2 rounded-lg text-xs font-semibold uppercase tracking-wide whitespace-nowrap text-emerald-700 dark:text-emerald-400 hover:bg-emerald-500/10 inline-flex items-center gap-1.5">
              <Trophy size={13} /> Won · Convert
            </button>
          )}
          {lead.status !== "Lost" && !lead.converted_client_id && (
            <button onClick={() => setModal("lost")} data-testid="lead-mark-lost"
              className="px-3 py-2 rounded-lg text-xs font-semibold uppercase tracking-wide whitespace-nowrap text-rose-600 dark:text-rose-400 hover:bg-rose-500/10 inline-flex items-center gap-1.5">
              <XCircle size={13} /> Lost
            </button>
          )}
        </div>
      </div>

      {lead.converted_client_id && (
        <div className="surface p-4 mb-5 flex items-center justify-between gap-3 flex-wrap border-emerald-500/30 bg-emerald-500/5" data-testid="lead-converted-banner">
          <div className="flex items-center gap-2 text-sm"><CheckCircle2 size={18} className="text-emerald-600" /> Converted to a client on {fmtDateTime(lead.converted_at)}</div>
          <Link to={`/admin/clients/${lead.converted_client_id}`} className="text-xs font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-400 inline-flex items-center gap-1">Open client <ArrowRight size={12} /></Link>
        </div>
      )}
      {lead.status === "Lost" && (
        <div className="surface p-4 mb-5 flex items-center justify-between gap-3 flex-wrap border-rose-500/30 bg-rose-500/5">
          <div className="text-sm"><b className="text-rose-600">Lost:</b> {lead.lost_reason || "No reason recorded"}</div>
          <Button size="sm" variant="outline" onClick={() => setStatus("Contacted")}>Reopen</Button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,360px)_minmax(0,1fr)] gap-5">
        <div className="space-y-5">
          <div className="surface p-4 divide-y divide-slate-100 dark:divide-slate-800/60">
            <Row icon={Phone} label="Phone">{lead.phone && <a href={`tel:${lead.phone}`} className="hover:text-amber-600">{lead.phone}</a>}</Row>
            <Row icon={Mail} label="Email">{lead.email && <a href={`mailto:${lead.email}`} className="hover:text-amber-600">{lead.email}</a>}</Row>
            <Row icon={MapPin} label="Location">{lead.location}</Row>
            <Row icon={Building2} label="Project type">{lead.project_type}</Row>
            <Row icon={IndianRupee} label="Budget"><span className="font-mono font-semibold">{lead.budget != null ? fmtINR(lead.budget) : null}</span></Row>
            <Row icon={UserRound} label="Owner">{lead.assignee_name}</Row>
            <Row icon={StickyNote} label="Requirement"><span className="whitespace-pre-wrap">{lead.requirement}</span></Row>
          </div>

          {isOpen && (
            <div className="surface p-4" data-testid="lead-follow-up-card">
              <div className="flex items-center justify-between mb-2">
                <div className="text-[10px] uppercase tracking-[0.15em] text-slate-500 dark:text-slate-400 font-semibold flex items-center gap-1.5"><CalendarClock size={13} /> Next follow-up</div>
                {lead.next_follow_up && <button className="text-[11px] text-slate-400 hover:text-rose-600" onClick={() => setFollowUp(null)}>Clear</button>}
              </div>
              <div className={`font-heading font-semibold text-lg ${lead.follow_up_overdue ? "text-rose-600 dark:text-rose-400" : ""}`}>
                {lead.next_follow_up ? <>{fmtDateTime(lead.next_follow_up)} <span className="text-xs font-normal text-slate-500">({fmtRelative(lead.next_follow_up)})</span></> : "Not scheduled"}
              </div>
              <div className="flex flex-wrap gap-1.5 mt-3">
                {quickDates().map(([label, d]) => (
                  <button key={label} onClick={() => setFollowUp(d.toISOString())} className="chip cursor-pointer hover:border-amber-500">{label}</button>
                ))}
                <CustomFollowUp key={lead.next_follow_up || "none"} value={lead.next_follow_up} onSave={setFollowUp} />
              </div>
            </div>
          )}

          <div className="text-[11px] text-slate-400 px-1">
            Added {fmtDateTime(lead.created_at)}{lead.last_contacted_at ? ` · last contacted ${fmtRelative(lead.last_contacted_at)}` : ""}
          </div>
        </div>

        <div className="space-y-4 min-w-0">
          <form onSubmit={submitActivity} className="surface p-4" data-testid="lead-activity-form">
            <div className="flex flex-wrap gap-1.5 mb-3">
              {ACTIVITY_TYPES.map(({ key, label }) => {
                const Icon = ACTIVITY_ICON[key];
                return (
                  <button type="button" key={key} onClick={() => setActType(key)} aria-pressed={actType === key} data-testid={`activity-type-${key}`}
                    className={`px-2.5 py-1.5 rounded-md text-xs font-semibold inline-flex items-center gap-1.5 border transition-colors ${
                      actType === key ? "bg-slate-900 text-white border-slate-900 dark:bg-white dark:text-slate-900 dark:border-white"
                        : "border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-slate-400"}`}>
                    <Icon size={13} /> {label}
                  </button>
                );
              })}
            </div>
            <Textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} data-testid="activity-note"
              placeholder={actType === "Call" ? "What did you discuss?" : actType === "SiteVisit" ? "Site visit notes — plot size, access, soil…" : "Add a note"}
              className="bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 rounded-md" />
            <div className="flex items-end justify-between gap-3 mt-3 flex-wrap">
              {isOpen ? (
                <label className="text-xs text-slate-500 dark:text-slate-400">
                  Next follow-up (optional)
                  <Input type="datetime-local" value={nextFU} onChange={(e) => setNextFU(e.target.value)}
                    className="mt-1 h-8 text-xs bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 rounded-md" />
                </label>
              ) : <span />}
              <Button type="submit" disabled={addActivity.isPending} className={primaryBtn} data-testid="activity-submit">
                {addActivity.isPending && <Loader2 size={14} className="animate-spin" />} Log activity
              </Button>
            </div>
          </form>

          <div className="surface p-4">
            <div className="text-[10px] uppercase tracking-[0.15em] text-slate-500 dark:text-slate-400 font-semibold mb-3">Timeline</div>
            <ol className="relative border-l border-slate-200 dark:border-slate-800 ml-2 space-y-4" data-testid="lead-timeline">
              {(lead.activities || []).map((a) => {
                const Icon = ACTIVITY_ICON[a.type] || StickyNote;
                const muted = a.type === "StatusChange" || a.type === "System";
                return (
                  <li key={a.id} className="ml-5">
                    <span className={`absolute -left-[13px] w-6 h-6 rounded-full flex items-center justify-center ring-4 ring-white dark:ring-slate-900 ${muted ? "bg-slate-100 dark:bg-slate-800 text-slate-400" : "bg-amber-500/15 text-amber-700 dark:text-amber-400"}`}>
                      <Icon size={12} />
                    </span>
                    <div className="flex items-baseline gap-2 flex-wrap">
                      <span className={`text-xs font-semibold ${muted ? "text-slate-500" : "text-slate-900 dark:text-slate-100"}`}>
                        {ACTIVITY_TYPES.find((t) => t.key === a.type)?.label || (a.type === "Enquiry" ? "Web enquiry" : a.type === "StatusChange" ? "Update" : a.type)}
                      </span>
                      <span className="text-[11px] text-slate-400">{fmtDateTime(a.created_at)}{a.author_name ? ` · ${a.author_name}` : ""}</span>
                    </div>
                    {a.content && <p className={`text-sm mt-0.5 whitespace-pre-wrap ${muted ? "text-slate-500 dark:text-slate-400" : "text-slate-700 dark:text-slate-300"}`}>{a.content}</p>}
                  </li>
                );
              })}
            </ol>
          </div>
        </div>
      </div>

      <LeadFormModal open={modal === "edit"} onOpenChange={(o) => setModal(o ? "edit" : null)} lead={lead} />
      {isAdmin && <ConvertModal open={modal === "convert"} onOpenChange={(o) => setModal(o ? "convert" : null)} lead={lead} />}
      <LostModal open={modal === "lost"} onOpenChange={(o) => setModal(o ? "lost" : null)} busy={update.isPending}
        onConfirm={(reason) => setStatus("Lost", { lost_reason: reason })} />
    </div>
  );
}
