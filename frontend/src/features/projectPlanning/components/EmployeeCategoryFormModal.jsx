import { useState, useEffect } from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../../../components/ui/dialog";
import { Input } from "../../../components/ui/input";
import { Label } from "../../../components/ui/label";
import { Button } from "../../../components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../../components/ui/select";
import api, { formatApiErrorDetail } from "../../../api/client";

const WAGE_TYPES = [["daily", "Daily"], ["monthly", "Monthly"], ["piece_rate", "Piece Rate"]];

export const EmployeeCategoryFormModal = ({ open, onOpenChange, onCreated }) => {
  const qc = useQueryClient();
  const [form, setForm] = useState({ name: "", default_wage_type: "daily" });
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (open) setForm({ name: "", default_wage_type: "daily" }); }, [open]);

  const submit = async (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    if (!form.name.trim()) { toast.error("Category name is required"); return; }
    setSaving(true);
    try {
      const { data } = await api.post("/employee-categories", {
        name: form.name.trim(), default_wage_type: form.default_wage_type,
      });
      toast.success(`Category "${data.name}" added`);
      qc.setQueryData(["employeeCategories"], (old = []) =>
        [...old, data].sort((a, b) => a.name.localeCompare(b.name)));
      qc.invalidateQueries({ queryKey: ["employeeCategories"] });
      onCreated?.(data);
      onOpenChange(false);
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || err.message);
    } finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 rounded-md max-w-sm" data-testid="category-form-modal">
        <DialogHeader>
          <DialogTitle className="font-heading text-2xl uppercase tracking-wide">Add Category</DialogTitle>
          <DialogDescription className="text-xs text-slate-500 dark:text-slate-400">
            Labour trades are shared across all projects.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <Label className="text-xs uppercase tracking-[0.15em] text-slate-500 dark:text-slate-400">Name *</Label>
            <Input data-testid="category-name-input" placeholder="e.g. Welder" value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })} className="mt-1.5 bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 rounded-md" />
          </div>
          <div>
            <Label className="text-xs uppercase tracking-[0.15em] text-slate-500 dark:text-slate-400">Default Wage Type</Label>
            <Select value={form.default_wage_type} onValueChange={(v) => setForm({ ...form, default_wage_type: v })}>
              <SelectTrigger data-testid="category-wagetype-select" className="mt-1.5 bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 rounded-md"><SelectValue /></SelectTrigger>
              <SelectContent className="bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700">
                {WAGE_TYPES.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="rounded-md border-slate-300 dark:border-slate-700" data-testid="category-form-cancel">Cancel</Button>
            <Button type="submit" disabled={saving} data-testid="category-form-submit" className="rounded-md bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-100 text-white dark:text-slate-900 font-semibold uppercase tracking-wide">Add Category</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};
