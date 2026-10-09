import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { ArrowLeft, Plus } from "lucide-react";
import { useClient, useClientProjects } from "../hooks/useProjects";
import { ProjectTable } from "../components/ProjectTable";
import { ProjectFormModal } from "../components/ProjectFormModal";
import { Skeleton } from "../../../components/ui/skeleton";
import { Button } from "../../../components/ui/button";
import { useAuth } from "../../../context/AuthContext";

export default function ClientProjectsPage() {
  const { id } = useParams();
  const { isAdmin } = useAuth();
  const { data: client } = useClient(id);
  const { data: projects, isLoading, isError } = useClientProjects(id);
  const [modalOpen, setModalOpen] = useState(false);

  return (
    <div className="p-4 sm:p-8" data-testid="client-projects-page">
      <Link to="/admin/clients" data-testid="back-to-clients" className="inline-flex items-center gap-1.5 text-xs uppercase tracking-[0.15em] font-semibold text-slate-500 dark:text-slate-400 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-400 transition-colors mb-4">
        <ArrowLeft size={14} strokeWidth={2.5} /> All Clients
      </Link>
      <div className="flex items-end justify-between mb-8 flex-wrap gap-4">
        <div>
          <div className="text-blue-600 dark:text-blue-400 text-[11px] uppercase tracking-[0.3em] font-semibold mb-1">Client Portfolio</div>
          <h1 className="font-heading font-bold text-4xl sm:text-5xl tracking-tight leading-none" data-testid="client-name-heading">
            {client?.name || "…"}
          </h1>
          <div className="text-sm text-slate-500 dark:text-slate-400 mt-2">{client?.company}</div>
        </div>
        {isAdmin && (
          <Button data-testid="client-new-project-button" onClick={() => setModalOpen(true)}
            className="rounded-md bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-100 text-white dark:text-slate-900 font-bold uppercase tracking-[0.12em]">
            <Plus size={16} strokeWidth={3} /> New Project
          </Button>
        )}
      </div>
      {isLoading ? (
        <div className="space-y-2">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-14 bg-white dark:bg-slate-900 rounded-md" />)}</div>
      ) : isError ? (
        <div className="border border-red-200 dark:border-red-500/30 bg-red-50 dark:bg-red-500/10 p-8 text-center text-red-600 dark:text-red-400">Failed to load client projects.</div>
      ) : (
        <ProjectTable projects={projects} />
      )}
      <ProjectFormModal open={modalOpen} onOpenChange={setModalOpen} defaultClientId={Number(id)} />
    </div>
  );
}
