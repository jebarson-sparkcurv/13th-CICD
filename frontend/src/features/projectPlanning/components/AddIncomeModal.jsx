import { useState, useEffect } from "react";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../../../components/ui/dialog";
import { Input } from "../../../components/ui/input";
import { Label } from "../../../components/ui/label";
import { Button } from "../../../components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../../components/ui/select";
import api, { formatApiErrorDetail } from "../../../api/client";

export const fmtMoney = (n) => `₹${Number(n || 0).toLocaleString("en-IN")}`;
export const PAYMENT_TYPES = ["Advance Payment", "Partial Payment", "Full Payment"];

export const useTxnContext = (open) =>
  useQuery({
    queryKey: ["txnContext"],
    queryFn: () => api.get("/finance/transaction-context").then((r) => r.data),
    enabled: open,
  });

export const invalidateFinance = (qc) =>
  ["txnContext", "projFinance", "invoices", "expenses", "ledger", "orgFinance",
    "projectBalanceSheet", "balanceSheet", "vendorQuotations", "orgEmployees"].forEach((k) =>
    qc.invalidateQueries({ queryKey: [k] }));

export const RadioRow = ({ name, options, value, onChange, testPrefix }) => (
  <div className="flex flex-wrap gap-2 mt-1.5">
    {options.map((o) => (
      <label key={o} data-testid={`${testPrefix}-${o.toLowerCase().replace(/\s+/g, "-")}`}
        className={`flex items-center gap-2 border px-3 py-2 text-xs font-semibold cursor-pointer select-none transition-colors ${
          value === o
            ? "border-blue-500 bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-400"
            : "border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-blue-300"}`}>
        <input type="radio" name={name} checked={value === o} onChange={() => onChange(o)} className="accent-blue-600" />
        {o}
      </label>
    ))}
  </div>
);

export const labelCls = "text-xs uppercase tracking-[0.15em] text-slate-500 dark:text-slate-400";
export const inputCls = "mt-1.5 bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 rounded-md";

const empty = { project_id: "", phase: "", amount: "", payment_type: "Partial Payment", balance: "" };

export const AddIncomeModal = ({ open, onOpenChange, defaultProjectId }) => {
  const [form, setForm] = useState(empty);
  const [balanceTouched, setBalanceTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const qc = useQueryClient();
  const { data: ctx } = useTxnContext(open);

  useEffect(() => {
    if (open) {
      setForm({ ...empty, project_id: defaultProjectId ? String(defaultProjectId) : "" });
      setBalanceTouched(false);
    }
  }, [open, defaultProjectId]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const project = (ctx?.projects || []).find((p) => String(p.id) === form.project_id);
  const amount = Number(form.amount);
  const autoBalance = project && form.amount !== "" ? +(project.budget - amount).toFixed(2) : null;
  const shownBalance = balanceTouched ? form.balance : autoBalance ?? "";
  const overridden = balanceTouched && autoBalance != null && Number(form.balance) !== autoBalance;
  const valid = form.project_id && amount > 0 && form.payment_type;

  const submit = async (addAnother) => {
    setSaving(true);
    try {
      const { data } = await api.post("/transactions/income", {
        project_id: Number(form.project_id),
        phase: form.phase.trim() || null,
        amount,
        payment_type: form.payment_type,
        balance: balanceTouched && form.balance !== "" ? Number(form.balance) : null,
      });
      toast.success(`Income of ${fmtMoney(amount)} recorded · budget remaining ${fmtMoney(data.project_budget_remaining)}${data.override ? " (balance override logged)" : ""}`);
      invalidateFinance(qc);
      if (addAnother) {
        setForm((f) => ({ ...f, amount: "", balance: "" }));
        setBalanceTouched(false);
      } else onOpenChange(false);
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail) || e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 rounded-md max-w-md" data-testid="add-income-modal">
        <DialogHeader>
          <DialogTitle className="font-heading text-2xl uppercase tracking-wide text-emerald-600 dark:text-emerald-400">Add Income</DialogTitle>
          <DialogDescription className="text-xs text-slate-500 dark:text-slate-400">Record a client payment — it posts as a CREDIT in the project's balance sheet.</DialogDescription>
        </DialogHeader>
        <form onSubmit={(e) => { e.preventDefault(); if (valid) submit(false); }} className="space-y-4">
          <div>
            <Label className={labelCls}>Project *</Label>
            <Select value={form.project_id} onValueChange={(v) => set("project_id", v)}>
              <SelectTrigger data-testid="income-project-select" className={inputCls}><SelectValue placeholder="Select active project" /></SelectTrigger>
              <SelectContent className="bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700">
                {(ctx?.projects || []).map((p) => <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className={labelCls}>Phase / Milestone (optional)</Label>
            <Input data-testid="income-phase-input" value={form.phase} onChange={(e) => set("phase", e.target.value)}
              placeholder="e.g. Foundation advance" className={inputCls} />
          </div>
          <div>
            <Label className={labelCls}>Amount (₹) *</Label>
            <Input data-testid="income-amount-input" type="number" min="0" step="any" value={form.amount}
              onChange={(e) => set("amount", e.target.value)} className={inputCls} />
          </div>
          <div>
            <Label className={labelCls}>Payment Type *</Label>
            <RadioRow name="income-ptype" options={PAYMENT_TYPES} value={form.payment_type}
              onChange={(v) => set("payment_type", v)} testPrefix="income-ptype" />
          </div>
          <div>
            <Label className={labelCls}>Balance (auto: budget − amount, editable)</Label>
            <Input data-testid="income-balance-input" type="number" step="any" value={shownBalance}
              onChange={(e) => { setBalanceTouched(true); set("balance", e.target.value); }} className={inputCls} />
            {project && form.amount !== "" && (
              <p className="text-[11px] mt-1.5 text-slate-500 dark:text-slate-400" data-testid="income-balance-preview">
                Budget {fmtMoney(project.budget)} − {fmtMoney(amount || 0)} = <span className="font-bold text-emerald-600 dark:text-emerald-400">{fmtMoney(autoBalance)}</span>
                {overridden && <span className="ml-2 text-amber-600 dark:text-amber-400 font-semibold">Override will be logged for audit</span>}
              </p>
            )}
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="rounded-md border-slate-300 dark:border-slate-700">Cancel</Button>
            <Button type="button" variant="outline" disabled={!valid || saving} data-testid="income-submit-another"
              onClick={() => submit(true)} className="rounded-md border-emerald-400/60 text-emerald-700 dark:text-emerald-400">Save + Add Another</Button>
            <Button type="submit" disabled={!valid || saving} data-testid="income-submit"
              className="rounded-md bg-emerald-600 hover:bg-emerald-700 text-white font-semibold uppercase tracking-wide">Save Income</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};
