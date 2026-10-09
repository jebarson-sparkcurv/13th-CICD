import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, AlertTriangle, Clock, CheckCheck } from "lucide-react";
import api from "../api/client";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";

const timeAgo = (iso) => {
  if (!iso) return "";
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
};

export const NotificationBell = ({ collapsed = false }) => {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data: countData } = useQuery({
    queryKey: ["notifUnreadCount"],
    queryFn: () => api.get("/notifications/unread-count").then((r) => r.data),
    refetchInterval: 30000,
  });
  const { data: notifications } = useQuery({
    queryKey: ["notifications"],
    queryFn: () => api.get("/notifications").then((r) => r.data),
    enabled: open,
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["notifications"] });
    qc.invalidateQueries({ queryKey: ["notifUnreadCount"] });
  };

  const onClickNotif = async (n) => {
    if (!n.is_read) { try { await api.post(`/notifications/${n.id}/read`); } catch (e) { /* ignore */ } refresh(); }
    setOpen(false);
    if (n.link) navigate(n.link);
    else if (n.project_id) navigate(`/admin/projects/${n.project_id}${n.type === "ChangeOrder" ? "?tab=variations" : ""}`);
  };

  const markAll = async () => {
    await api.post("/notifications/read-all");
    refresh();
  };

  const unread = countData?.count || 0;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button data-testid="notification-bell" title={collapsed ? "Alerts" : undefined}
          className={`group relative w-full flex items-center rounded-lg text-sm font-medium text-slate-400 hover:text-white hover:bg-slate-800/50 transition-colors ${collapsed ? "justify-center px-3 py-2.5" : "gap-3 px-3 py-2.5"}`}>
          <Bell size={collapsed ? 19 : 17} strokeWidth={2.25} className="shrink-0" />
          {!collapsed && <span className="uppercase tracking-[0.12em] text-[11px] font-semibold">Alerts</span>}
          {unread > 0 && (
            <span data-testid="notification-badge"
              className={collapsed
                ? "absolute top-1 right-1 min-w-[16px] h-4 px-1 flex items-center justify-center rounded-full bg-rose-500 text-white text-[9px] font-bold leading-none"
                : "ml-auto bg-rose-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none min-w-[18px] text-center"}>
              {unread > 99 ? "99+" : unread}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent side="right" align="start" sideOffset={8}
        className="w-96 p-0 bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 rounded-md" data-testid="notification-panel">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-800">
          <span className="text-[11px] uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400 font-semibold">Alerts</span>
          {unread > 0 && (
            <button data-testid="mark-all-read" onClick={markAll}
              className="flex items-center gap-1 text-[10px] uppercase tracking-[0.12em] font-bold text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300">
              <CheckCheck size={12} strokeWidth={2.5} /> Mark all read
            </button>
          )}
        </div>
        <div className="max-h-96 overflow-y-auto">
          {(notifications || []).map((n) => (
            <button key={n.id} data-testid={`notification-item-${n.id}`} onClick={() => onClickNotif(n)}
              className={`w-full text-left px-4 py-3 border-b border-slate-200 dark:border-slate-800/60 hover:bg-slate-200 dark:bg-slate-800/50 transition-colors ${n.is_read ? "opacity-60" : ""}`}>
              <div className="flex items-start gap-2.5">
                <span className={`mt-0.5 shrink-0 ${n.type.includes("Blocked") ? "text-red-600 dark:text-red-400" : "text-amber-600 dark:text-amber-400"}`}>
                  {n.type.includes("Blocked") ? <AlertTriangle size={15} strokeWidth={2.5} /> : <Clock size={15} strokeWidth={2.5} />}
                </span>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">{n.title}</span>
                    {!n.is_read && <span className="w-1.5 h-1.5 bg-blue-600 shrink-0" />}
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-2">{n.message}</div>
                  <div className="text-[10px] uppercase tracking-[0.12em] text-slate-400 dark:text-slate-500 mt-1">{timeAgo(n.created_at)}</div>
                </div>
              </div>
            </button>
          ))}
          {(notifications || []).length === 0 && (
            <div className="px-4 py-10 text-center text-xs text-slate-500 dark:text-slate-400" data-testid="notifications-empty">
              No alerts yet. You'll be notified when work gets blocked or delayed.
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
};
