import { useState, useEffect } from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../../../components/ui/dialog";
import { Input } from "../../../components/ui/input";
import { Label } from "../../../components/ui/label";
import { Button } from "../../../components/ui/button";
import api, { formatApiErrorDetail } from "../../../api/client";
import { PAYMENT_TYPES, RadioRow, labelCls, inputCls, fmtMoney } from "./AddIncomeModal";

export const LabourPaymentModal = ({ open, onOpenChange, projectId, row }) => {
  const [amount, setAmount] = useState("");
  const [ptype, setPtype] = useState("Partial Payment");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const qc = useQueryClient();

  useEffect(() => {
    if (open && row) {
      setAmount(row.due > 0 ? String(row.due) : "");
      setPtype(row.due > 0 ? "Full Payment" : "Advance Payment");
      setNote("");
    }
  }, [open, row]);

  if (!row) return null;
  const amt = Number(amount);

  const submit = async (e) => {
    e.preventDefault();
    if (!(amt > 0)) return;
    setSaving(true);
    try {
      const { data } = await api.post(`/projects/${projectId}/labour-payments`, {
        employee_id: row.employee_id, amount: amt, payment_type: ptype, note: note.trim() || null,
      });
      toast.success(`Paid ${fmtMoney(amt)} to ${row.name} · budget remaining ${fmtMoney(data.project_budget_remaining)}`);
      ["labourCost", "projectBalanceSheet", "projFinance", "expenses", "ledger", "balanceSheet", "orgFinance"].forEach((k) =>
        qc.invalidateQueries({ queryKey: [k] }));
      onOpenChange(false);
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 rounded-md max-w-md" data-testid="labour-payment-modal">
        <DialogHeader>
          <DialogTitle className="font-heading text-2xl uppercase tracking-wide">Pay {row.name}</DialogTitle>
          <DialogDescription className="text-xs text-slate-500 dark:text-slate-400">
            Posts as a DEBIT (Employee Payment) in this project's balance sheet and the employee's payment history.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-3 gap-3 text-center border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-3">
          {[["Earned (total)", row.earned_total], ["Paid", row.paid], ["Due", row.due]].map(([l, v], i) => (
            <div key={l}>
              <div className="text-[9px] uppercase tracking-[0.15em] text-slate-500 dark:text-slate-400 font-semibold">{l}</div>
              <div className={`font-heading font-bold text-base mt-0.5 ${i === 2 ? (v > 0 ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400") : "text-slate-900 dark:text-slate-100"}`}>
                {v != null ? fmtMoney(v) : "—"}
              </div>
            </div>
          ))}
        </div>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <Label className={labelCls}>Amount (₹) *</Label>
            <Input data-testid="labour-payment-amount" type="number" min="0" step="any" value={amount}
              onChange={(e) => setAmount(e.target.value)} className={inputCls} />
          </div>
          <div>
            <Label className={labelCls}>Payment Type *</Label>
            <RadioRow name="labour-ptype" options={PAYMENT_TYPES} value={ptype} onChange={setPtype} testPrefix="labour-ptype" />
          </div>
          <div>
            <Label className={labelCls}>Note (optional)</Label>
            <Input data-testid="labour-payment-note" value={note} onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. Week 32 wages" className={inputCls} />
          </div>
          <div className="flex justify-end gap-3 pt-1">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="rounded-md border-slate-300 dark:border-slate-700">Cancel</Button>
            <Button type="submit" disabled={!(amt > 0) || saving} data-testid="labour-payment-submit"
              className="rounded-md bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-100 text-white dark:text-slate-900 font-semibold uppercase tracking-wide">Make Payment</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};
