import { useState, useEffect } from "react";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../../../components/ui/dialog";
import { Input } from "../../../components/ui/input";
import { Label } from "../../../components/ui/label";
import { Button } from "../../../components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../../components/ui/select";
import api, { formatApiErrorDetail } from "../../../api/client";
import { useAuth } from "../../../context/AuthContext";
import { EmployeeCategoryFormModal } from "./EmployeeCategoryFormModal";

const WAGE_TYPES = [["daily", "Daily"], ["monthly", "Monthly"], ["piece_rate", "Piece Rate"]];
const empty = { name: "", category_id: "", phone: "", wage_type: "daily", daily_wage: "", joining_date: "" };

export const EmployeeFormModal = ({ open, onOpenChange, projectId, employee }) => {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);
  const [catModal, setCatModal] = useState(false);
  const canEditWage = !employee || ["Admin", "Accountant"].includes(user?.role);

  const { data: categories } = useQuery({
    queryKey: ["employeeCategories"],
    queryFn: () => api.get("/employee-categories").then((r) => r.data),
    enabled: open,
  });

  useEffect(() => {
    if (open) {
      setForm(employee ? {
        name: employee.name || "", category_id: employee.category_id ? String(employee.category_id) : "",
        phone: employee.phone || "", wage_type: employee.wage_type || "daily",
        daily_wage: employee.daily_wage ?? "", joining_date: employee.joining_date || "",
      } : empty);
    }
  }, [open, employee]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const onCategorySelect = (v) => {
    if (v === "__new") { setCatModal(true); return; }
    if (!v) return;
    const cat = categories?.find((c) => String(c.id) === v);
    setForm((f) => ({ ...f, category_id: v, wage_type: (!employee && cat?.default_wage_type) || f.wage_type }));
  };

  const submit = async (ev) => {
    ev.preventDefault();
    if (!form.name.trim()) { toast.error("Employee name is required"); return; }
    setSaving(true);
    const payload = {
      name: form.name.trim(),
      category_id: form.category_id ? Number(form.category_id) : null,
      phone: form.phone || null,
      joining_date: form.joining_date || null,
      ...(canEditWage && {
        wage_type: form.wage_type,
        daily_wage: form.daily_wage !== "" ? Number(form.daily_wage) : null,
      }),
    };
    try {
      if (employee) await api.patch(`/employees/${employee.id}`, payload);
      else if (projectId) await api.post(`/projects/${projectId}/employees`, payload);
      else await api.post("/employees", payload);
      toast.success(employee ? "Employee updated" : "Employee added");
      qc.invalidateQueries({ queryKey: ["employees", projectId] });
      qc.invalidateQueries({ queryKey: ["allEmployees"] });
      qc.invalidateQueries({ queryKey: ["labourCost", projectId] });
      onOpenChange(false);
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || err.message);
    } finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 rounded-md max-w-md" data-testid="employee-form-modal">
        <DialogHeader>
          <DialogTitle className="font-heading text-2xl uppercase tracking-wide">
            {employee ? "Edit Employee" : "Add Employee"}
          </DialogTitle>
          <DialogDescription className="text-xs text-slate-500 dark:text-slate-400">
            Field workers for this project — separate from portal users.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-xs uppercase tracking-[0.15em] text-slate-500 dark:text-slate-400">Name *</Label>
              <Input data-testid="employee-name-input" value={form.name} onChange={(e) => set("name", e.target.value)} className="mt-1.5 bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 rounded-md" />
            </div>
            <div>
              <Label className="text-xs uppercase tracking-[0.15em] text-slate-500 dark:text-slate-400">Category</Label>
              <Select value={form.category_id} onValueChange={onCategorySelect}>
                <SelectTrigger data-testid="employee-category-select" className="mt-1.5 bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 rounded-md">
                  <SelectValue placeholder="Select trade">
                    {form.category_id
                      ? (categories?.find((c) => String(c.id) === form.category_id)?.name || "Selected")
                      : null}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent className="bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700">
                  {categories?.map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
                  <SelectItem value="__new" data-testid="add-category-option">
                    <span className="flex items-center gap-1.5 text-blue-600 dark:text-blue-400 font-semibold"><Plus size={13} strokeWidth={3} /> Add Category</span>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-xs uppercase tracking-[0.15em] text-slate-500 dark:text-slate-400">Phone</Label>
              <Input data-testid="employee-phone-input" value={form.phone} onChange={(e) => set("phone", e.target.value)} className="mt-1.5 bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 rounded-md" />
            </div>
            <div>
              <Label className="text-xs uppercase tracking-[0.15em] text-slate-500 dark:text-slate-400">Joining Date</Label>
              <Input data-testid="employee-joining-input" type="date" value={form.joining_date} onChange={(e) => set("joining_date", e.target.value)} className="mt-1.5 bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 rounded-md" />
            </div>
          </div>
          {canEditWage ? (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-xs uppercase tracking-[0.15em] text-slate-500 dark:text-slate-400">Wage Type</Label>
                <Select value={form.wage_type} onValueChange={(v) => set("wage_type", v)}>
                  <SelectTrigger data-testid="employee-wagetype-select" className="mt-1.5 bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 rounded-md"><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700">
                    {WAGE_TYPES.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs uppercase tracking-[0.15em] text-slate-500 dark:text-slate-400">Daily Wage (₹)</Label>
                <Input data-testid="employee-wage-input" type="number" value={form.daily_wage} onChange={(e) => set("daily_wage", e.target.value)} className="mt-1.5 bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 rounded-md" />
              </div>
            </div>
          ) : (
            <div className="border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50 p-3 text-[11px] text-slate-500 dark:text-slate-400" data-testid="wage-locked-note">
              Wage: {form.daily_wage !== "" ? `₹${form.daily_wage}` : "—"} / {form.wage_type} — only Admin or Accountant can edit wage fields.
            </div>
          )}
          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="rounded-md border-slate-300 dark:border-slate-700" data-testid="employee-form-cancel">Cancel</Button>
            <Button type="submit" disabled={saving} data-testid="employee-form-submit" className="rounded-md bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-100 text-white dark:text-slate-900 font-semibold uppercase tracking-wide">
              {employee ? "Save Changes" : "Add Employee"}
            </Button>
          </div>
        </form>
        <EmployeeCategoryFormModal open={catModal} onOpenChange={setCatModal}
          onCreated={(cat) => setForm((f) => ({ ...f, category_id: String(cat.id), wage_type: (!employee && cat.default_wage_type) || f.wage_type }))} />
      </DialogContent>
    </Dialog>
  );
};
