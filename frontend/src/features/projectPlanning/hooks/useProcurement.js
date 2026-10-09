import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "../../../api/client";

export const useProcSummary = (projectId) =>
  useQuery({
    queryKey: ["procSummary", Number(projectId)],
    queryFn: () => api.get(`/projects/${projectId}/procurement/dashboard-summary`).then((r) => r.data),
    enabled: !!projectId,
  });

export const useCommitments = (projectId, filters) =>
  useQuery({
    queryKey: ["commitments", Number(projectId), filters],
    queryFn: () => api.get(`/projects/${projectId}/procurement/commitments`, { params: filters }).then((r) => r.data),
    enabled: !!projectId,
  });

export const useBudgetBreakdownProc = (projectId, enabled) =>
  useQuery({
    queryKey: ["procBudgetBreakdown", Number(projectId)],
    queryFn: () => api.get(`/projects/${projectId}/procurement/budget-breakdown`).then((r) => r.data),
    enabled: !!projectId && enabled,
  });

export const useCommitment = (type, id) =>
  useQuery({
    queryKey: ["commitment", type, Number(id)],
    queryFn: () => api.get(type === "po" ? `/purchase-orders/${id}` : `/subcontracts/${id}`).then((r) => r.data),
    enabled: !!type && !!id,
  });

export const useChangeOrders = (type, id) =>
  useQuery({
    queryKey: ["changeOrders", type, Number(id)],
    queryFn: () => api.get(`/commitments/${type}/${id}/change-orders`).then((r) => r.data),
    enabled: !!type && !!id,
  });

export const usePayApps = (type, id) =>
  useQuery({
    queryKey: ["payApps", type, Number(id)],
    queryFn: () => api.get(`/commitments/${type}/${id}/pay-applications`).then((r) => r.data),
    enabled: !!type && !!id,
  });

export const useProcDocs = (type, id) =>
  useQuery({
    queryKey: ["procDocs", type, Number(id)],
    queryFn: () => api.get(`/procurement/${type}/${id}/documents`).then((r) => r.data),
    enabled: !!type && !!id,
  });

export const invalidateCommitment = (qc, type, id, projectId) => {
  qc.invalidateQueries({ queryKey: ["commitment", type, Number(id)] });
  qc.invalidateQueries({ queryKey: ["changeOrders", type, Number(id)] });
  qc.invalidateQueries({ queryKey: ["payApps", type, Number(id)] });
  qc.invalidateQueries({ queryKey: ["commitments"] });
  qc.invalidateQueries({ queryKey: ["procSummary"] });
  qc.invalidateQueries({ queryKey: ["procBudgetBreakdown"] });
};

export const useProcMutation = (type, id, projectId) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ method = "post", url, data }) =>
      api[method](url, data).then((r) => r.data),
    onSuccess: () => invalidateCommitment(qc, type, id, projectId),
  });
};

export const useProcDocMutation = (type, id) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ method = "post", url, data }) => api[method](url, data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["procDocs", type, Number(id)] }),
  });
};
