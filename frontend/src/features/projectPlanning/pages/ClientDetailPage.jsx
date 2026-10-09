import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Pencil, Mail, Phone, MapPin, FileText, ArrowRight } from "lucide-react";
import api, { assetUrl } from "../../../api/client";
import { useAuth } from "../../../context/AuthContext";
import { useClient, useClientProjects } from "../hooks/useProjects";
import { Button } from "../../../components/ui/button";
import { ClientFormModal } from "../components/ClientFormModal";
import { ProjectStatusBadge } from "../components/ProjectStatusBadge";
import { InvoiceCard } from "./ProjectFinancePage";

const TABS = ["Projects", "Invoices", "Documents"];

export default function ClientDetailPage() {
  const { id } = useParams();
  const { isAdmin } = useAuth();
  const [tab, setTab] = useState("Projects");
  const [editModal, setEditModal] = useState(false);
  const { data: client } = useClient(id);
  const { data: projects } = useClientProjects(id);
  const { data: invoices } = useQuery({
    queryKey: ["clientInvoices", id],
    queryFn: () => api.get(`/clients/${id}/invoices`).then((r) => r.data),
    enabled: tab === "Invoices",
  });
  const { data: documents } = useQuery({
    queryKey: ["clientDocuments", id],
    queryFn: () => api.get(`/clients/${id}/documents`).then((r) => r.data),
    enabled: tab === "Documents",
  });

  return (
    <div className="p-4 sm:p-8" data-testid="client-detail-page">
      <Link to="/admin/clients" className="inline-flex items-center gap-1.5 text-xs uppercase tracking-[0.15em] font-semibold text-slate-500 dark:text-slate-400 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-400 mb-4">
        <ArrowLeft size={14} strokeWidth={2.5} /> Clients
      </Link>
      <div className="flex items-end justify-between flex-wrap gap-4 mb-6">
        <div>
          <div className="text-blue-600 dark:text-blue-400 text-[11px] uppercase tracking-[0.3em] font-semibold mb-1">{client?.company || "Client"}</div>
          <h1 className="font-heading font-bold text-4xl sm:text-5xl tracking-tight leading-none" data-testid="client-name">{client?.name}</h1>
          <div className="flex flex-wrap items-center gap-4 mt-3 text-xs text-slate-500 dark:text-slate-400">
            <span className="flex items-center gap-1.5"><Mail size={12} strokeWidth={2.5} /> {client?.email || "—"}</span>
            <span className="flex items-center gap-1.5"><Phone size={12} strokeWidth={2.5} /> {client?.phone || "—"}</span>
            <span className="flex items-center gap-1.5"><MapPin size={12} strokeWidth={2.5} /> {client?.address || "—"}</span>
          </div>
        </div>
        {isAdmin && (
          <Button data-testid="edit-client-button" onClick={() => setEditModal(true)} variant="outline" className="rounded-md border-slate-300 dark:border-slate-700 hover:border-blue-400">
            <Pencil size={14} strokeWidth={2.5} /> Edit Client
          </Button>
        )}
      </div>
      <div className="flex gap-1 border-b border-slate-200 dark:border-slate-800 mb-6">
        {TABS.map((t) => (
          <button key={t} data-testid={`client-tab-${t.toLowerCase()}`} onClick={() => setTab(t)}
            className={`px-5 py-2.5 text-xs uppercase tracking-[0.15em] font-semibold border-b-2 -mb-px transition-colors ${
              tab === t ? "border-blue-600 text-blue-600 dark:text-blue-400" : "border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:text-slate-100"}`}>
            {t}
          </button>
        ))}
      </div>

      {tab === "Projects" && (
        <div className="space-y-2" data-testid="client-projects-list">
          {(projects || []).map((p) => (
            <Link key={p.id} to={`/admin/projects/${p.id}`} data-testid={`client-project-${p.id}`}
              className="flex items-center gap-4 surface p-4 hover:border-blue-400 transition-colors group">
              <div className="font-heading font-bold text-2xl text-slate-700 dark:text-slate-300 group-hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-400 transition-colors w-16">{p.percent_complete}%</div>
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-slate-900 dark:text-slate-100 truncate">{p.name}</div>
                <div className="text-xs text-slate-500 dark:text-slate-400">{p.location || "—"}</div>
              </div>
              <ProjectStatusBadge status={p.status} />
              <ArrowRight size={15} strokeWidth={2.5} className="text-slate-400 dark:text-slate-500 group-hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-400 transition-colors" />
            </Link>
          ))}
          {(projects || []).length === 0 && <div className="border border-slate-200 dark:border-slate-800 p-10 text-center text-slate-500 dark:text-slate-400">No projects for this client.</div>}
        </div>
      )}

      {tab === "Invoices" && (
        <div className="space-y-3 max-w-3xl" data-testid="client-invoices-list">
          {(invoices || []).map((inv) => <InvoiceCard key={inv.id} inv={inv} canWrite={false} onPay={() => {}} />)}
          {(invoices || []).length === 0 && <div className="border border-slate-200 dark:border-slate-800 p-10 text-center text-slate-500 dark:text-slate-400">No invoices for this client.</div>}
        </div>
      )}

      {tab === "Documents" && (
        <div className="space-y-2 max-w-3xl" data-testid="client-documents-list">
          {(documents || []).map((doc) => (
            <a key={doc.id} href={assetUrl(doc.file_url)} target="_blank" rel="noreferrer" data-testid={`client-doc-${doc.id}`}
              className="flex items-center gap-3 surface p-3 hover:border-blue-400 transition-colors">
              <FileText size={16} strokeWidth={2.5} className="text-blue-600 dark:text-blue-400 shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">{doc.document_name}</div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400">{doc.category} · {doc.uploader_name || "—"} · {doc.uploaded_at?.slice(0, 10)}</div>
              </div>
              <span className="text-[10px] uppercase tracking-[0.15em] text-slate-500 dark:text-slate-400">{doc.file_type}</span>
            </a>
          ))}
          {(documents || []).length === 0 && <div className="border border-slate-200 dark:border-slate-800 p-10 text-center text-slate-500 dark:text-slate-400">No documents.</div>}
        </div>
      )}

      <ClientFormModal open={editModal} onOpenChange={setEditModal} client={client} />
    </div>
  );
}
