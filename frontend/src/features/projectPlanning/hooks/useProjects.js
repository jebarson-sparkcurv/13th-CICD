import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "../../../api/client";

export const useProjects = (filters = {}) =>
  useQuery({
    queryKey: ["projects", filters],
    queryFn: () =>
      api.get("/projects", { params: filters }).then((r) => r.data),
  });

export const useProject = (id) =>
  useQuery({
    queryKey: ["project", Number(id)],
    queryFn: () => api.get(`/projects/${id}`).then((r) => r.data),
    enabled: !!id,
  });

export const useClients = (enabled = true) =>
  useQuery({
    queryKey: ["clients"],
    queryFn: () => api.get("/clients").then((r) => r.data),
    enabled,
  });

export const useClient = (id) =>
  useQuery({
    queryKey: ["client", id],
    queryFn: () => api.get(`/clients/${id}`).then((r) => r.data),
    enabled: !!id,
  });

export const useClientProjects = (clientId) =>
  useQuery({
    queryKey: ["clientProjects", clientId],
    queryFn: () => api.get(`/clients/${clientId}/projects`).then((r) => r.data),
    enabled: !!clientId,
  });

export const useEngineers = (enabled = true) =>
  useQuery({
    queryKey: ["engineers"],
    queryFn: () => api.get("/users", { params: { role: "SiteEngineer" } }).then((r) => r.data),
    enabled,
  });

export const useStats = () =>
  useQuery({
    queryKey: ["stats"],
    queryFn: () => api.get("/stats").then((r) => r.data),
  });

export const useDashboardSummary = () =>
  useQuery({
    queryKey: ["dashboardSummary"],
    queryFn: () => api.get("/projects/dashboard-summary").then((r) => r.data),
  });

export const useBudgetBreakdown = (enabled) =>
  useQuery({
    queryKey: ["budgetBreakdown"],
    queryFn: () => api.get("/projects", { params: { limit: 200 } }).then((r) => r.data.items),
    enabled,
  });

export const useDocuments = (projectId) =>
  useQuery({
    queryKey: ["documents", Number(projectId)],
    queryFn: () => api.get(`/projects/${projectId}/documents`).then((r) => r.data),
    enabled: !!projectId,
  });

export const useUpdatesFeed = (projectId) =>
  useQuery({
    queryKey: ["updates", Number(projectId)],
    queryFn: () => api.get(`/projects/${projectId}/updates`).then((r) => r.data),
    enabled: !!projectId,
  });

const invalidateProject = (qc, projectId) => {
  qc.invalidateQueries({ queryKey: ["project", projectId] });
  qc.invalidateQueries({ queryKey: ["projects"] });
  qc.invalidateQueries({ queryKey: ["stats"] });
  qc.invalidateQueries({ queryKey: ["dashboardSummary"] });
  qc.invalidateQueries({ queryKey: ["budgetBreakdown"] });
};

export const useCreateProject = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data) => api.post("/projects", data).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["projects"] });
      qc.invalidateQueries({ queryKey: ["stats"] });
      qc.invalidateQueries({ queryKey: ["dashboardSummary"] });
      qc.invalidateQueries({ queryKey: ["budgetBreakdown"] });
    },
  });
};

export const useUpdateProject = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }) => api.put(`/projects/${id}`, data).then((r) => r.data),
    onSuccess: (_, { id }) => invalidateProject(qc, id),
  });
};

export const useArchiveProject = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id) => api.delete(`/projects/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["projects"] });
      qc.invalidateQueries({ queryKey: ["stats"] });
    },
  });
};

export const useAddPhase = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ projectId, data }) =>
      api.post(`/projects/${projectId}/phases`, data).then((r) => r.data),
    onSuccess: (_, { projectId }) => invalidateProject(qc, projectId),
  });
};

export const useUpdatePhase = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ phaseId, data }) =>
      api.put(`/phases/${phaseId}`, data).then((r) => r.data),
    onSuccess: (_, { projectId }) => invalidateProject(qc, projectId),
  });
};

export const useDeletePhase = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ phaseId }) => api.delete(`/phases/${phaseId}`),
    onSuccess: (_, { projectId }) => invalidateProject(qc, projectId),
  });
};

export const usePostUpdate = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ projectId, data }) =>
      api.post(`/projects/${projectId}/updates`, data).then((r) => r.data),
    onMutate: async ({ projectId, data, authorName }) => {
      await qc.cancelQueries({ queryKey: ["updates", projectId] });
      const prev = qc.getQueryData(["updates", projectId]);
      if (prev) {
        const optimistic = {
          id: `temp-${Date.now()}`,
          ...data,
          author_name: authorName,
          update_date: data.update_date || new Date().toISOString().slice(0, 10),
          attachments: data.attachments || [],
          _optimistic: true,
        };
        qc.setQueryData(["updates", projectId], {
          ...prev,
          items: [optimistic, ...prev.items],
          total: prev.total + 1,
        });
      }
      return { prev };
    },
    onError: (_e, { projectId }, ctx) => {
      if (ctx?.prev) qc.setQueryData(["updates", projectId], ctx.prev);
    },
    onSettled: (_d, _e, { projectId }) => {
      qc.invalidateQueries({ queryKey: ["updates", projectId] });
      invalidateProject(qc, projectId);
    },
  });
};

export const useUploadDocument = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ projectId, formData }) =>
      api.post(`/projects/${projectId}/documents`, formData).then((r) => r.data),
    onSuccess: (_, { projectId }) =>
      qc.invalidateQueries({ queryKey: ["documents", Number(projectId)] }),
  });
};

export const usePatchDocument = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ documentId, data }) =>
      api.patch(`/documents/${documentId}`, data).then((r) => r.data),
    onSuccess: (_, { projectId }) =>
      qc.invalidateQueries({ queryKey: ["documents", Number(projectId)] }),
  });
};

export const useDeleteDocument = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ documentId }) => api.delete(`/documents/${documentId}`),
    onSuccess: (_, { projectId }) =>
      qc.invalidateQueries({ queryKey: ["documents", Number(projectId)] }),
  });
};
