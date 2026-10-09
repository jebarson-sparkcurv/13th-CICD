import { useMemo, useState, useEffect } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { Plus, Search, Download, Upload, Globe, Columns3, List, Target, CalendarClock,
  AlertTriangle, Sparkles, Trophy, Phone, MapPin, ArrowRight } from "lucide-react";
import { useAuth } from "../../../context/AuthContext";
import { Skeleton } from "../../../components/ui/skeleton";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { formatApiErrorDetail } from "../../../api/client";
import { DashboardStatCard } from "../components/DashboardStatCard";
import { LeadFormModal, selectCls } from "../components/LeadFormModal";
import { LeadCaptureFormModal, LeadImportModal } from "../components/LeadToolsModals";
import { useLeads, useLeadStats, useLeadAssignees, useUpdateLead } from "../hooks/useLeads";
import { downloadFile } from "../utils/downloadFile";
import { LEAD_STATUSES, LEAD_STATUS_META, LEAD_SOURCES, PRIORITY_CHIP, statusLabel,
  fmtINR, fmtCompactINR, fmtRelative } from "../components/leadConstants";

const outlineBtn = "rounded-md border-slate-300 dark:border-slate-700 font-semibold uppercase tracking-wide text-xs";

const StatusChip = ({ status }) => (
  <span className={`chip ${LEAD_STATUS_META[status]?.chip || ""}`}>{statusLabel(status)}</span>
);

const FollowUp = ({ lead }) => {
  if (!lead.next_follow_up || lead.status === "Won" || lead.status === "Lost") return null;
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] font-semibold ${lead.follow_up_overdue ? "text-rose-600 dark:text-rose-400" : "text-slate-500 dark:text-slate-400"}`}>
      <CalendarClock size={12} /> {fmtRelative(lead.next_follow_up)}
    </span>
  );
};

const LeadCard = ({ lead, onDragStart }) => (
  <Link to={`/admin/leads/${lead.id}`} draggable onDragStart={(e) => onDragStart(e, lead)}
    data-testid={`lead-card-${lead.id}`}
    className="surface surface-hover block p-3 cursor-grab active:cursor-grabbing">
    <div className="flex items-start justify-between gap-2">
      <div className="font-semibold text-sm text-slate-900 dark:text-slate-100 leading-snug">{lead.name}</div>
      {lead.priority === "High" && <span className="chip chip-danger shrink-0">Hot</span>}
    </div>
    {(lead.project_type || lead.location) && (
      <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">
        {[lead.project_type, lead.location].filter(Boolean).join(" · ")}
      </div>
    )}
    <div className="flex items-center justify-between mt-2.5 gap-2">
      <span className="font-mono text-xs font-semibold text-slate-700 dark:text-slate-300 tabular-nums">
        {lead.budget ? fmtCompactINR(lead.budget) : ""}
      </span>
      <FollowUp lead={lead} />
    </div>
    <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-100 dark:border-slate-800/60 text-[10px] uppercase tracking-[0.12em] text-slate-400">
      <span>{lead.source}</span>
      <span className="truncate max-w-[50%]">{lead.assignee_name || "Unassigned"}</span>
    </div>
  </Link>
);

function Board({ leads, onMove }) {
  const [over, setOver] = useState(null);
  const columns = useMemo(() => {
    const m = Object.fromEntries(LEAD_STATUSES.map((s) => [s, []]));
    leads.forEach((l) => (m[l.status] || (m[l.status] = [])).push(l));
    return m;
  }, [leads]);

  const onDragStart = (e, lead) => {
    e.dataTransfer.setData("text/plain", String(lead.id));
    e.dataTransfer.effectAllowed = "move";
  };
  const onDrop = (e, status) => {
    e.preventDefault();
    setOver(null);
    const id = Number(e.dataTransfer.getData("text/plain"));
    const lead = leads.find((l) => l.id === id);
    if (lead && lead.status !== status) onMove(lead, status);
  };

  return (
    <div className="flex gap-3 overflow-x-auto pb-4 -mx-4 px-4 sm:mx-0 sm:px-0 snap-x" data-testid="leads-board">
      {LEAD_STATUSES.map((s) => {
        const items = columns[s] || [];
        const total = items.reduce((a, l) => a + (l.budget || 0), 0);
        return (
          <div key={s} data-testid={`lead-column-${s}`}
            onDragOver={(e) => { e.preventDefault(); setOver(s); }}
            onDragLeave={() => setOver((o) => (o === s ? null : o))}
            onDrop={(e) => onDrop(e, s)}
            className={`snap-start shrink-0 w-[260px] rounded-xl p-2 transition-colors ${over === s ? "bg-amber-500/10 ring-2 ring-amber-500/30" : "bg-slate-100/70 dark:bg-slate-900/50"}`}>
            <div className="flex items-center justify-between px-1.5 py-1.5 mb-1">
              <div className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${LEAD_STATUS_META[s].dot}`} />
                <span className="text-[11px] uppercase tracking-[0.15em] font-semibold text-slate-600 dark:text-slate-300">{statusLabel(s)}</span>
                <span className="text-[11px] font-mono text-slate-400">{items.length}</span>
              </div>
              {total > 0 && <span className="text-[10px] font-mono text-slate-400 tabular-nums">{fmtCompactINR(total)}</span>}
            </div>
            <div className="space-y-2 min-h-[80px]">
              {items.map((l) => <LeadCard key={l.id} lead={l} onDragStart={onDragStart} />)}
              {items.length === 0 && (
                <div className="text-[11px] text-slate-400 text-center py-6 border border-dashed border-slate-300/70 dark:border-slate-700/70 rounded-lg">Drop here</div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ListView({ leads }) {
  const navigate = useNavigate();
  return (
    <>
      <div className="surface overflow-x-auto table-desktop">
        <table className="data-table" data-testid="leads-table">
          <thead>
            <tr>
              <th>Lead</th><th>Contact</th><th>Status</th><th>Source</th>
              <th className="text-right">Budget</th><th>Follow-up</th><th>Owner</th><th />
            </tr>
          </thead>
          <tbody>
            {leads.map((l) => (
              <tr key={l.id} data-testid={`lead-row-${l.id}`} className="cursor-pointer" onClick={() => navigate(`/admin/leads/${l.id}`)}>
                <td>
                  <div className="font-semibold text-slate-900 dark:text-slate-100">{l.name}</div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">{[l.project_type, l.location].filter(Boolean).join(" · ") || l.company || "—"}</div>
                </td>
                <td className="text-xs text-slate-500 dark:text-slate-400"><div>{l.phone || "—"}</div><div>{l.email || ""}</div></td>
                <td>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <StatusChip status={l.status} />
                    {l.priority !== "Medium" && <span className={`chip ${PRIORITY_CHIP[l.priority]}`}>{l.priority}</span>}
                  </div>
                </td>
                <td className="text-xs">{l.source}</td>
                <td className="text-right font-mono font-semibold tabular-nums">{fmtINR(l.budget)}</td>
                <td><FollowUp lead={l} /></td>
                <td className="text-xs">{l.assignee_name || <span className="text-slate-400">—</span>}</td>
                <td className="text-right"><ArrowRight size={13} className="inline text-slate-400" /></td>
              </tr>
            ))}
            {leads.length === 0 && <tr><td colSpan={8} className="text-center text-slate-500 dark:text-slate-400 py-10">No leads match these filters.</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="row-card space-y-2">
        {leads.map((l) => (
          <Link key={l.id} to={`/admin/leads/${l.id}`} className="surface surface-hover block p-4" data-testid={`lead-mobile-${l.id}`}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="font-semibold text-slate-900 dark:text-slate-100 truncate">{l.name}</div>
                <div className="text-xs text-slate-500 dark:text-slate-400 truncate flex items-center gap-1">
                  {l.phone && <><Phone size={11} /> {l.phone}</>}
                  {l.location && <><MapPin size={11} className="ml-1" /> {l.location}</>}
                </div>
              </div>
              <StatusChip status={l.status} />
            </div>
            <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-100 dark:border-slate-800/60">
              <span className="font-mono font-semibold text-sm tabular-nums">{fmtINR(l.budget)}</span>
              <FollowUp lead={l} />
            </div>
          </Link>
        ))}
        {leads.length === 0 && <div className="surface p-10 text-center text-slate-500 dark:text-slate-400 text-sm">No leads match these filters.</div>}
      </div>
    </>
  );
}

export default function LeadsPage() {
  const { isAdmin } = useAuth();
  const [params, setParams] = useSearchParams();
  const isMobile = typeof window !== "undefined" && window.matchMedia("(max-width: 767px)").matches;
  const [view, setView] = useState(params.get("view") || (isMobile ? "list" : "board"));
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [source, setSource] = useState("");
  const [owner, setOwner] = useState("");
  const [followUp, setFollowUp] = useState(params.get("follow_up") || "");
  const [showClosed, setShowClosed] = useState(true);
  const [modal, setModal] = useState(null); // "add" | "form" | "import"

  useEffect(() => { const t = setTimeout(() => setDebouncedQ(q), 300); return () => clearTimeout(t); }, [q]);
  useEffect(() => {
    const next = new URLSearchParams();
    if (view) next.set("view", view);
    if (followUp) next.set("follow_up", followUp);
    setParams(next, { replace: true });
  }, [view, followUp, setParams]);

  const filters = {
    ...(debouncedQ && { q: debouncedQ }), ...(source && { source }),
    ...(owner && { assigned_to: owner }), ...(followUp && { follow_up: followUp }),
    include_closed: view === "board" ? true : showClosed,
  };
  const { data: leads, isLoading } = useLeads(filters);
  const { data: stats } = useLeadStats();
  const { data: assignees } = useLeadAssignees();
  const update = useUpdateLead();

  const onMove = (lead, status) => {
    let extra = {};
    if (status === "Lost") {
      const reason = window.prompt(`Why was "${lead.name}" lost?`, "Went with another builder");
      if (!reason) return;
      extra = { lost_reason: reason };
    }
    update.mutate({ id: lead.id, status, ...extra }, {
      onSuccess: () => toast.success(`${lead.name} → ${statusLabel(status)}`),
      onError: (e) => toast.error(formatApiErrorDetail(e.response?.data?.detail)),
    });
  };

  const toggleFollowUp = (v) => setFollowUp((cur) => (cur === v ? "" : v));
  const exportCsv = () => {
    const p = new URLSearchParams();
    if (debouncedQ) p.set("q", debouncedQ);
    if (source) p.set("source", source);
    if (owner) p.set("assigned_to", owner);
    const qs = p.toString();
    return downloadFile(`/leads/export${qs ? `?${qs}` : ""}`, "leads.csv")
      .catch(() => toast.error("Export failed"));
  };

  return (
    <div className="p-4 sm:p-8" data-testid="leads-page">
      <div className="flex items-end justify-between mb-6 flex-wrap gap-4">
        <div>
          <div className="text-amber-600 dark:text-amber-400 text-[11px] uppercase tracking-[0.3em] font-semibold mb-1">Sales Pipeline</div>
          <h1 className="font-heading font-bold text-4xl sm:text-5xl tracking-tight leading-none">Leads</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          {isAdmin && (
            <>
              <Button variant="outline" className={outlineBtn} onClick={() => setModal("form")} data-testid="lead-webform-button"><Globe size={14} /> Web Form</Button>
              <Button variant="outline" className={outlineBtn} onClick={() => setModal("import")} data-testid="lead-import-button"><Upload size={14} /> Import</Button>
            </>
          )}
          <Button variant="outline" className={outlineBtn} onClick={exportCsv} data-testid="lead-export-button"><Download size={14} /> Export</Button>
          <Button data-testid="add-lead-button" onClick={() => setModal("add")}
            className="rounded-md bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-100 text-white dark:text-slate-900 font-bold uppercase tracking-wide">
            <Plus size={15} strokeWidth={3} /> Add Lead
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-6">
        <DashboardStatCard label="Open Leads" icon={Target} testId="lead-stat-open"
          value={<span>{stats?.open ?? "—"}<span className="block text-xs font-mono font-normal text-slate-500 mt-1">{stats ? `${fmtCompactINR(stats.pipeline_value)} pipeline` : ""}</span></span>} />
        <DashboardStatCard label="Due Today" icon={CalendarClock} variant="info" testId="lead-stat-today"
          value={stats?.follow_ups_today ?? "—"} isActive={followUp === "today"} onClick={() => toggleFollowUp("today")} />
        <DashboardStatCard label="Overdue" icon={AlertTriangle} variant="warning" testId="lead-stat-overdue"
          value={stats?.overdue_follow_ups ?? "—"} isActive={followUp === "overdue"} onClick={() => toggleFollowUp("overdue")} />
        <DashboardStatCard label="New This Month" icon={Sparkles} testId="lead-stat-new" value={stats?.new_this_month ?? "—"} />
        <DashboardStatCard label="Win Rate" icon={Trophy} variant="success" testId="lead-stat-winrate"
          value={<span>{stats?.win_rate != null ? `${stats.win_rate}%` : "—"}<span className="block text-xs font-mono font-normal text-slate-500 mt-1">{stats ? `${fmtCompactINR(stats.won_value)} won` : ""}</span></span>} />
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, phone, place…" data-testid="lead-search"
            className="pl-9 bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 rounded-md" />
        </div>
        <select value={source} onChange={(e) => setSource(e.target.value)} className={`${selectCls} !mt-0 !w-auto`} data-testid="lead-source-filter">
          <option value="">All sources</option>
          {LEAD_SOURCES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={owner} onChange={(e) => setOwner(e.target.value)} className={`${selectCls} !mt-0 !w-auto`} data-testid="lead-owner-filter">
          <option value="">{isAdmin ? "Everyone" : "All my leads"}</option>
          <option value="me">Assigned to me</option>
          {isAdmin && <option value="none">Unassigned</option>}
          {isAdmin && (assignees || []).map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
        </select>
        {view === "list" && (
          <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400 px-2">
            <input type="checkbox" checked={showClosed} onChange={(e) => setShowClosed(e.target.checked)} className="accent-amber-600" />
            Show won/lost
          </label>
        )}
        <div className="ml-auto inline-flex rounded-md border border-slate-300 dark:border-slate-700 overflow-hidden" role="group">
          {[["board", Columns3, "Board"], ["list", List, "List"]].map(([k, Icon, label]) => (
            <button key={k} onClick={() => setView(k)} data-testid={`lead-view-${k}`} aria-pressed={view === k}
              className={`px-3 h-9 text-xs font-semibold uppercase tracking-wide inline-flex items-center gap-1.5 ${view === k ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900" : "bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300"}`}>
              <Icon size={13} /> {label}
            </button>
          ))}
        </div>
      </div>

      {followUp && (
        <div className="mb-3 text-xs text-slate-500 dark:text-slate-400">
          Showing follow-ups {followUp === "today" ? "due today" : "that are overdue"} ·{" "}
          <button className="font-semibold text-amber-600 dark:text-amber-400 hover:underline" onClick={() => setFollowUp("")}>clear</button>
        </div>
      )}

      {isLoading ? (
        <Skeleton className="h-72 bg-slate-200 dark:bg-slate-800 rounded-md" />
      ) : stats?.total === 0 && !debouncedQ && !source && !owner && !followUp ? (
        <div className="surface p-10 text-center" data-testid="leads-empty">
          <Target size={32} className="mx-auto text-slate-300 dark:text-slate-600 mb-3" />
          <div className="font-heading font-semibold text-xl">No leads yet</div>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 max-w-md mx-auto">
            Add enquiries as they come in, import a CSV from JustDial or IndiaMART, or share your web enquiry form so customers can reach you directly.
          </p>
          <div className="flex justify-center gap-2 mt-5 flex-wrap">
            <Button onClick={() => setModal("add")} className="rounded-md bg-slate-900 text-white dark:bg-white dark:text-slate-900 font-semibold"><Plus size={14} /> Add first lead</Button>
            {isAdmin && <Button variant="outline" onClick={() => setModal("form")}><Globe size={14} /> Set up web form</Button>}
          </div>
        </div>
      ) : view === "board" ? (
        <Board leads={leads || []} onMove={onMove} />
      ) : (
        <ListView leads={leads || []} />
      )}

      <LeadFormModal open={modal === "add"} onOpenChange={(o) => setModal(o ? "add" : null)} />
      {isAdmin && <LeadCaptureFormModal open={modal === "form"} onOpenChange={(o) => setModal(o ? "form" : null)} />}
      {isAdmin && <LeadImportModal open={modal === "import"} onOpenChange={(o) => setModal(o ? "import" : null)} />}
    </div>
  );
}
