import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "../../../api/client";

const TZ = Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Kolkata";

export const useLeads = (filters = {}) =>
  useQuery({
    queryKey: ["leads", filters],
    queryFn: () => api.get("/leads", { params: { ...filters, tz: TZ } }).then((r) => r.data),
  });

export const useLead = (id) =>
  useQuery({
    queryKey: ["lead", Number(id)],
    queryFn: () => api.get(`/leads/${id}`).then((r) => r.data),
    enabled: !!id,
  });

export const useLeadStats = () =>
  useQuery({
    queryKey: ["leadStats"],
    queryFn: () => api.get("/leads/stats", { params: { tz: TZ } }).then((r) => r.data),
  });

export const useLeadMeta = () =>
  useQuery({
    queryKey: ["leadMeta"],
    queryFn: () => api.get("/leads/meta").then((r) => r.data),
    staleTime: Infinity,
  });

export const useLeadAssignees = () =>
  useQuery({
    queryKey: ["leadAssignees"],
    queryFn: () => api.get("/leads/assignees").then((r) => r.data),
    staleTime: 5 * 60 * 1000,
  });

const invalidateAll = (qc, id) => {
  qc.invalidateQueries({ queryKey: ["leads"] });
  qc.invalidateQueries({ queryKey: ["leadStats"] });
  if (id) qc.invalidateQueries({ queryKey: ["lead", Number(id)] });
};

export const useUpdateLead = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }) => api.patch(`/leads/${id}`, body).then((r) => r.data),
    onSuccess: (data) => {
      qc.setQueryData(["lead", data.id], data);
      invalidateAll(qc);
    },
  });
};

export const useAddLeadActivity = (id) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body) => api.post(`/leads/${id}/activities`, body).then((r) => r.data),
    onSuccess: (data) => {
      qc.setQueryData(["lead", data.id], data);
      invalidateAll(qc);
    },
  });
};

export { invalidateAll as invalidateLeadQueries };
