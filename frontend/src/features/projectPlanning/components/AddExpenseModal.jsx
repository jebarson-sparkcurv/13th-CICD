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
import { fmtMoney, PAYMENT_TYPES, RadioRow, labelCls, inputCls, useTxnContext, invalidateFinance } from "./AddIncomeModal";

const SOURCES = ["Vendor", "Employee", "Other"];
const ADD_NEW = "__add_new__";
const empty = { project_id: "", phase_id: "", source_type: "Vendor", vendor_id: "", product_id: "", quantity: "1", employee_id: "", description: "", amount: "", payment_type: "Partial Payment" };

const MiniForm = ({ title, fields, onSave, onCancel, saving, testPrefix }) => (
  <div className="border border-blue-300 dark:border-blue-500/40 bg-blue-50/50 dark:bg-blue-500/5 p-3 space-y-2" data-testid={`${testPrefix}-miniform`}>
    <div className="text-[10px] uppercase tracking-[0.15em] font-bold text-blue-700 dark:text-blue-400">{title}</div>
    {fields}
    <div className="flex gap-2 justify-end">
      <Button type="button" size="sm" variant="outline" onClick={onCancel} className="rounded-md h-7 text-xs border-slate-300 dark:border-slate-700">Cancel</Button>
      <Button type="button" size="sm" disabled={saving} onClick={onSave} data-testid={`${testPrefix}-save`}
        className="rounded-md h-7 text-xs bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-100 text-white dark:text-slate-900 font-bold">Save</Button>
    </div>
  </div>
);

export const AddExpenseModal = ({ open, onOpenChange, defaultProjectId }) => {
  const [form, setForm] = useState(empty);
  const [mini, setMini] = useState(null);
  const [miniData, setMiniData] = useState({});
  const [saving, setSaving] = useState(false);
  const qc = useQueryClient();
  const { data: ctx } = useTxnContext(open);

  const { data: vendors } = useQuery({
    queryKey: ["txnVendors"],
    queryFn: () => api.get("/transactions/vendors").then((r) => r.data),
    enabled: open,
  });
  const { data: products } = useQuery({
    queryKey: ["txnProducts", form.vendor_id],
    queryFn: () => api.get(`/vendors/${form.vendor_id}/products`).then((r) => r.data),
    enabled: open && Boolean(form.vendor_id),
  });
  const { data: employees } = useQuery({
    queryKey: ["txnEmployees"],
    queryFn: () => api.get("/employees").then((r) => r.data),
    enabled: open,
  });

  useEffect(() => {
    if (open) {
      setForm({ ...empty, project_id: defaultProjectId ? String(defaultProjectId) : "" });
      setMini(null); setMiniData({});
    }
  }, [open, defaultProjectId]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const project = (ctx?.projects || []).find((p) => String(p.id) === form.project_id);
  const amount = Number(form.amount);
  const balanceAfter = project && form.amount !== "" ? +(project.budget_remaining - amount).toFixed(2) : null;
  const employeeList = Array.isArray(employees) ? employees : employees?.items || [];
  const activeProducts = (products || []).filter((p) => p.is_active !== false);

  const sourceValid = form.source_type === "Vendor" ? form.vendor_id && form.product_id
    : form.source_type === "Employee" ? form.employee_id
    : form.description.trim();
  const valid = form.project_id && form.phase_id && amount > 0 && form.payment_type && sourceValid;

  const saveMini = async () => {
    setSaving(true);
    try {
      if (mini === "vendor") {
        const { data } = await api.post("/transactions/inline/vendor", {
          name: miniData.name, contact_name: miniData.contact || null, trade: miniData.category || null,
        });
        qc.setQueryData(["txnVendors"], (old) => [...(old || []), { id: data.id, name: data.name }]);
        qc.invalidateQueries({ queryKey: ["vendors"] });
        set("vendor_id", String(data.id)); set("product_id", "");
        toast.success(`Vendor "${data.name}" created & selected`);
      } else if (mini === "product") {
        const { data } = await api.post(`/transactions/inline/vendor/${form.vendor_id}/product`, {
          name: miniData.name, unit_price: Number(miniData.unit_price) || 0, unit: miniData.unit || "unit",
        });
        qc.setQueryData(["txnProducts", form.vendor_id], (old) => [...(old || []), data]);
        set("product_id", String(data.id));
        toast.success(`Product "${data.name}" added & selected`);
      } else if (mini === "employee") {
        const params = new URLSearchParams();
        if (form.project_id) params.set("project_id", form.project_id);
        if (form.phase_id) params.set("phase_id", form.phase_id);
        const { data } = await api.post(`/transactions/inline/employee?${params}`, {
          name: miniData.name, role_title: miniData.role || null, phone: miniData.contact || null,
          daily_wage: miniData.rate ? Number(miniData.rate) : null,
        });
        qc.setQueryData(["txnEmployees"], (old) =>
          Array.isArray(old) ? [...old, data] : { ...(old || {}), items: [...(old?.items || []), data] });
        qc.invalidateQueries({ queryKey: ["orgEmployees"] });
        set("employee_id", String(data.id));
        toast.success(`Employee "${data.name}" created, assigned to phase & selected`);
      }
      setMini(null); setMiniData({});
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail) || e.message);
    } finally {
      setSaving(false);
    }
  };

  const submit = async (addAnother) => {
    setSaving(true);
    try {
      const { data } = await api.post("/transactions/expense", {
        project_id: Number(form.project_id), phase_id: Number(form.phase_id),
        source_type: form.source_type,
        vendor_id: form.vendor_id ? Number(form.vendor_id) : null,
        product_id: form.product_id ? Number(form.product_id) : null,
        quantity: Number(form.quantity) || 1,
        employee_id: form.employee_id ? Number(form.employee_id) : null,
        description: form.description.trim() || null,
        amount, payment_type: form.payment_type,
      });
      toast.success(`Expense of ${fmtMoney(amount)} recorded · budget remaining ${fmtMoney(data.project_budget_remaining)}${data.quotation ? ` · Quotation ${data.quotation.quote_number} generated` : ""}`);
      invalidateFinance(qc);
      if (addAnother) setForm((f) => ({ ...f, amount: "", quantity: "1", description: "" }));
      else onOpenChange(false);
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail) || e.message);
    } finally {
      setSaving(false);
    }
  };

  const miniField = (k, ph, type = "text") => (
    <Input key={k} data-testid={`mini-${mini}-${k}`} type={type} placeholder={ph} value={miniData[k] || ""}
      onChange={(e) => setMiniData((d) => ({ ...d, [k]: e.target.value }))}
      className="bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 rounded-md h-8 text-sm" />
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 rounded-md max-w-lg max-h-[90vh] overflow-y-auto" data-testid="add-expense-modal">
        <DialogHeader>
          <DialogTitle className="font-heading text-2xl uppercase tracking-wide text-red-600 dark:text-red-400">Add Expense</DialogTitle>
          <DialogDescription className="text-xs text-slate-500 dark:text-slate-400">Record an outgoing payment — it posts as a DEBIT and syncs with Vendors, Procurement or Field Ops.</DialogDescription>
        </DialogHeader>
        <form onSubmit={(e) => { e.preventDefault(); if (valid) submit(false); }} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className={labelCls}>Project *</Label>
              <Select value={form.project_id} onValueChange={(v) => { set("project_id", v); set("phase_id", ""); }}>
                <SelectTrigger data-testid="expense-project-select" className={inputCls}><SelectValue placeholder="Select project" /></SelectTrigger>
                <SelectContent className="bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700">
                  {(ctx?.projects || []).map((p) => <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className={labelCls}>Phase *</Label>
              <Select value={form.phase_id} onValueChange={(v) => set("phase_id", v)} disabled={!project}>
                <SelectTrigger data-testid="expense-phase-select" className={inputCls}><SelectValue placeholder={project ? "Select phase" : "Pick project first"} /></SelectTrigger>
                <SelectContent className="bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700">
                  {(project?.phases || []).map((ph) => <SelectItem key={ph.id} value={String(ph.id)}>{ph.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label className={labelCls}>Expense Source *</Label>
            <RadioRow name="expense-source" options={SOURCES} value={form.source_type}
              onChange={(v) => { set("source_type", v); setMini(null); }} testPrefix="expense-source" />
          </div>

          {form.source_type === "Vendor" && (
            <div className="space-y-3">
              <div>
                <Label className={labelCls}>Vendor *</Label>
                <Select value={form.vendor_id} onValueChange={(v) => { if (!v) return; if (v === ADD_NEW) { setMini("vendor"); setMiniData({}); } else { set("vendor_id", v); set("product_id", ""); } }}>
                  <SelectTrigger data-testid="expense-vendor-select" className={inputCls}><SelectValue placeholder="Select vendor" /></SelectTrigger>
                  <SelectContent className="bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700">
                    <SelectItem value={ADD_NEW} className="text-blue-600 dark:text-blue-400 font-semibold">+ Add New Vendor</SelectItem>
                    {(vendors || []).map((v) => <SelectItem key={v.id} value={String(v.id)}>{v.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              {mini === "vendor" && (
                <MiniForm title="New Vendor" testPrefix="new-vendor" saving={saving} onSave={saveMini} onCancel={() => setMini(null)}
                  fields={<>{miniField("name", "Vendor name *")}{miniField("contact", "Contact person / phone")}{miniField("category", "Category / trade (e.g. Steel)")}</>} />
              )}
              {form.vendor_id && (
                <div className="grid grid-cols-3 gap-3">
                  <div className="col-span-2">
                    <Label className={labelCls}>Product *</Label>
                    <Select value={form.product_id} onValueChange={(v) => { if (!v) return; if (v === ADD_NEW) { setMini("product"); setMiniData({}); } else set("product_id", v); }}>
                      <SelectTrigger data-testid="expense-product-select" className={inputCls}><SelectValue placeholder="Select product" /></SelectTrigger>
                      <SelectContent className="bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700">
                        <SelectItem value={ADD_NEW} className="text-blue-600 dark:text-blue-400 font-semibold">+ Add New Product</SelectItem>
                        {activeProducts.map((p) => <SelectItem key={p.id} value={String(p.id)}>{p.name} — {fmtMoney(p.unit_price)}/{p.unit}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className={labelCls}>Quantity</Label>
                    <Input data-testid="expense-quantity-input" type="number" min="0" step="any" value={form.quantity}
                      onChange={(e) => set("quantity", e.target.value)} className={inputCls} />
                  </div>
                </div>
              )}
              {mini === "product" && (
                <MiniForm title="New Product" testPrefix="new-product" saving={saving} onSave={saveMini} onCancel={() => setMini(null)}
                  fields={<>{miniField("name", "Product name *")}{miniField("unit_price", "Unit price ₹ *", "number")}{miniField("unit", "Unit (bag / ton / unit)")}</>} />
              )}
            </div>
          )}

          {form.source_type === "Employee" && (
            <div className="space-y-3">
              <div>
                <Label className={labelCls}>Employee *</Label>
                <Select value={form.employee_id} onValueChange={(v) => { if (!v) return; if (v === ADD_NEW) { setMini("employee"); setMiniData({}); } else set("employee_id", v); }}>
                  <SelectTrigger data-testid="expense-employee-select" className={inputCls}><SelectValue placeholder="Select employee" /></SelectTrigger>
                  <SelectContent className="bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700">
                    <SelectItem value={ADD_NEW} className="text-blue-600 dark:text-blue-400 font-semibold">+ Add New Employee</SelectItem>
                    {employeeList.map((e) => <SelectItem key={e.id} value={String(e.id)}>{e.name}{e.role_title ? ` — ${e.role_title}` : ""}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              {mini === "employee" && (
                <MiniForm title="New Employee (created in Field Ops & assigned to selected phase)" testPrefix="new-employee" saving={saving} onSave={saveMini} onCancel={() => setMini(null)}
                  fields={<>{miniField("name", "Name *")}{miniField("role", "Role (e.g. Mason)")}{miniField("contact", "Contact")}{miniField("rate", "Daily rate ₹", "number")}</>} />
              )}
            </div>
          )}

          {form.source_type === "Other" && (
            <div>
              <Label className={labelCls}>Description *</Label>
              <Input data-testid="expense-description-input" value={form.description}
                onChange={(e) => set("description", e.target.value)} placeholder="What was this expense for?" className={inputCls} />
            </div>
          )}

          <div>
            <Label className={labelCls}>Expense Amount (₹) *</Label>
            <Input data-testid="expense-txn-amount-input" type="number" min="0" step="any" value={form.amount}
              onChange={(e) => set("amount", e.target.value)} className={inputCls} />
          </div>
          <div>
            <Label className={labelCls}>Payment Type *</Label>
            <RadioRow name="expense-ptype" options={PAYMENT_TYPES} value={form.payment_type}
              onChange={(v) => set("payment_type", v)} testPrefix="expense-ptype" />
          </div>
          {project && (
            <div className="border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-3 text-[11px] text-slate-600 dark:text-slate-400" data-testid="expense-balance-preview">
              Budget remaining {fmtMoney(project.budget_remaining)}
              {form.amount !== "" && <> − {fmtMoney(amount || 0)} = <span className={`font-bold ${balanceAfter < 0 ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400"}`}>{fmtMoney(balanceAfter)}</span></>}
              <span className="ml-1 text-slate-400 dark:text-slate-500">(project-level, read-only)</span>
            </div>
          )}
          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="rounded-md border-slate-300 dark:border-slate-700">Cancel</Button>
            <Button type="button" variant="outline" disabled={!valid || saving} data-testid="expense-submit-another"
              onClick={() => submit(true)} className="rounded-md border-red-400/60 text-red-600 dark:text-red-400"><Plus size={13} strokeWidth={3} /> Save + Add Another</Button>
            <Button type="submit" disabled={!valid || saving} data-testid="expense-submit"
              className="rounded-md bg-red-600 hover:bg-red-700 text-white font-semibold uppercase tracking-wide">Save Expense</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};
