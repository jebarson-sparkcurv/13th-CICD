import { useState } from "react";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Plus } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../../../components/ui/dialog";
import { Input } from "../../../components/ui/input";
import { Button } from "../../../components/ui/button";
import api, { formatApiErrorDetail } from "../../../api/client";

export const CategoryManagerModal = ({ open, onOpenChange }) => {
  const qc = useQueryClient();
  const [edits, setEdits] = useState({});
  const [newName, setNewName] = useState("");

  const { data: categories } = useQuery({
    queryKey: ["employeeCategories", "all"],
    queryFn: () => api.get("/employee-categories?include_inactive=true").then((r) => r.data),
    enabled: open,
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ["employeeCategories"] });

  const rename = async (cat) => {
    const name = (edits[cat.id] ?? cat.name).trim();
    if (!name || name === cat.name) return;
    try {
      await api.patch(`/employee-categories/${cat.id}`, { name });
      toast.success("Category updated");
      setEdits((e) => ({ ...e, [cat.id]: undefined }));
      refresh();
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || err.message);
    }
  };

  const toggleActive = async (cat) => {
    try {
      await api.patch(`/employee-categories/${cat.id}`, { is_active: !cat.is_active });
      toast.success(cat.is_active ? "Category deactivated" : "Category activated");
      refresh();
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || err.message);
    }
  };

  const add = async () => {
    if (!newName.trim()) return;
    try {
      await api.post("/employee-categories", { name: newName.trim() });
      toast.success("Category added");
      setNewName("");
      refresh();
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || err.message);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 rounded-md max-w-md" data-testid="category-manager-modal">
        <DialogHeader>
          <DialogTitle className="font-heading text-2xl uppercase tracking-wide">Employee Categories</DialogTitle>
          <DialogDescription className="text-xs text-slate-500 dark:text-slate-400">Rename, deactivate or add worker trade categories.</DialogDescription>
        </DialogHeader>
        <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
          {(categories || []).map((cat) => (
            <div key={cat.id} className="flex items-center gap-2" data-testid={`category-row-${cat.id}`}>
              <Input value={edits[cat.id] ?? cat.name}
                onChange={(e) => setEdits((ed) => ({ ...ed, [cat.id]: e.target.value }))}
                data-testid={`category-name-input-${cat.id}`}
                className={`bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 rounded-md ${!cat.is_active ? "opacity-50" : ""}`} />
              <Button type="button" size="sm" onClick={() => rename(cat)} data-testid={`category-save-${cat.id}`}
                disabled={(edits[cat.id] ?? cat.name).trim() === cat.name}
                className="rounded-md bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-100 text-white dark:text-slate-900 shrink-0"><Check size={14} /></Button>
              <Button type="button" size="sm" variant="outline" onClick={() => toggleActive(cat)} data-testid={`category-toggle-${cat.id}`}
                className="rounded-md border-slate-300 dark:border-slate-700 shrink-0 text-xs">
                {cat.is_active ? "Disable" : "Enable"}
              </Button>
            </div>
          ))}
          {(categories || []).length === 0 && <div className="text-xs text-slate-500 p-3">No categories yet.</div>}
        </div>
        <div className="flex items-center gap-2 border-t border-slate-200 dark:border-slate-800 pt-3">
          <Input placeholder="New category name…" value={newName} onChange={(e) => setNewName(e.target.value)}
            data-testid="category-new-input" className="bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 rounded-md" />
          <Button type="button" onClick={add} data-testid="category-add-button"
            className="rounded-md bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-100 text-white dark:text-slate-900 shrink-0"><Plus size={14} /> Add</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
