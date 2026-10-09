import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, Plus, Minus, TrendingUp, TrendingDown, IndianRupee, Receipt, Tag, Pencil, Trash2, Printer, MessageCircle, Mail } from "lucide-react";
import { printInvoice, shareInvoiceWhatsApp, shareInvoiceEmail } from "../utils/invoiceShare";
import { AddIncomeModal } from "../components/AddIncomeModal";
import { AddExpenseModal } from "../components/AddExpenseModal";
import api, { formatApiErrorDetail } from "../../../api/client";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { CommitmentStatusBadge } from "../components/CommitmentStatusBadge";
import { useProject } from "../hooks/useProjects";
import { useAuth } from "../../../context/AuthContext";

const fmt = (n) => `₹${Number(n || 0).toLocaleString("en-IN")}`;
const fmtCr = (n) => `${n < 0 ? "−" : ""}₹${Math.abs(n || 0).toLocaleString("en-IN")}`;

export const ProjectFinanceSummaryCard = ({ label, value, sub, icon: Icon, accent, testId }) => (
  <div className="surface p-5" data-testid={testId}>
    <div className="flex items-center justify-between">
      <span className="text-[11px] uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400 font-semibold">{label}</span>
      <Icon size={16} strokeWidth={2.5} className={accent} />
    </div>
    <div className="font-heading font-bold text-3xl mt-3 leading-none">{value}</div>
    {sub && <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-2 tracking-wide" data-testid={`${testId}-period`}>{sub}</div>}
  </div>
);

export const InvoiceCard = ({ inv, canWrite, onPay, projectName, clientName }) => (
  <div className="surface p-4" data-testid={`invoice-card-${inv.id}`}>
    <div className="flex flex-wrap items-center gap-3">
      <span className="font-heading font-bold text-lg text-blue-600 dark:text-blue-400">{inv.invoice_number}</span>
      <CommitmentStatusBadge status={inv.status} />
      <span className="text-xs text-slate-500 dark:text-slate-400">Due {inv.due_date || "—"}</span>
      <span className="ml-auto font-semibold text-slate-900 dark:text-slate-100">{fmt(inv.total)}</span>
      <div className="flex gap-0.5">
        <button data-testid={`invoice-print-${inv.id}`} title="Print invoice" onClick={() => printInvoice(inv, projectName, clientName)}
          className="p-1.5 text-slate-500 dark:text-slate-400 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-400 transition-colors"><Printer size={14} strokeWidth={2.5} /></button>
        <button data-testid={`invoice-whatsapp-${inv.id}`} title="Send via WhatsApp" onClick={() => shareInvoiceWhatsApp(inv, projectName)}
          className="p-1.5 text-slate-500 dark:text-slate-400 hover:text-emerald-600 dark:text-emerald-400 dark:hover:text-emerald-400 transition-colors"><MessageCircle size={14} strokeWidth={2.5} /></button>
        <button data-testid={`invoice-email-${inv.id}`} title="Send via Email" onClick={() => shareInvoiceEmail(inv, projectName)}
          className="p-1.5 text-slate-500 dark:text-slate-400 hover:text-sky-600 dark:text-sky-400 dark:hover:text-sky-400 transition-colors"><Mail size={14} strokeWidth={2.5} /></button>
      </div>
    </div>
    <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">{inv.description}</div>
    <div className="flex items-center gap-4 mt-2 text-xs">
      <span className="text-emerald-600 dark:text-emerald-400">Paid {fmt(inv.paid_amount)}</span>
      <span className="text-amber-600 dark:text-amber-400">Balance {fmt(inv.balance_due)}</span>
      {canWrite && inv.balance_due > 0 && inv.status !== "Cancelled" && (
        <button data-testid={`record-payment-${inv.id}`} onClick={() => onPay(inv)}
          className="ml-auto text-[10px] uppercase tracking-wide font-bold text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300">+ Record Payment</button>
      )}
    </div>
  </div>
);

export default function ProjectFinancePage() {
  const { id } = useParams();
  const { user, isAdmin } = useAuth();
  const canFin = ["Admin", "Accountant"].includes(user?.role);
  const qc = useQueryClient();
  const { data: project } = useProject(Number(id));
  const { data: s } = useQuery({ queryKey: ["projFinance", id], queryFn: () => api.get(`/projects/${id}/finance/summary`).then((r) => r.data), enabled: canFin || user?.role === "SiteEngineer" });
  const { data: invoices } = useQuery({ queryKey: ["invoices", id], queryFn: () => api.get(`/projects/${id}/invoices`).then((r) => r.data) });
  const { data: expenses } = useQuery({ queryKey: ["expenses", id], queryFn: () => api.get(`/projects/${id}/expenses`).then((r) => r.data), enabled: canFin || user?.role === "SiteEngineer" });
  const canExp = canFin || user?.role === "SiteEngineer";
  const { data: expCats } = useQuery({ queryKey: ["expenseCategories"], queryFn: () => api.get("/expense-categories").then((r) => r.data), enabled: canExp });
  const { data: ledger } = useQuery({ queryKey: ["ledger", id], queryFn: () => api.get(`/projects/${id}/ledger`).then((r) => r.data), enabled: canFin || user?.role === "SiteEngineer" || user?.role === "ProcurementOfficer" });
  const [invForm, setInvForm] = useState({ amount: "", due_date: "", description: "" });
  const [expForm, setExpForm] = useState({ category: "", amount: "" });
  const [newCat, setNewCat] = useState("");
  const [incomeModal, setIncomeModal] = useState(false);
  const [expenseModal, setExpenseModal] = useState(false);

  const refresh = () => ["projFinance", "invoices", "expenses", "orgFinance", "expenseCategories", "ledger"].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
  const run = async (fn, ok) => {
    try { await fn(); toast.success(ok); refresh(); }
    catch (e) { toast.error(formatApiErrorDetail(e.response?.data?.detail) || e.message); }
  };

  const recordPayment = (inv) => {
    const amt = window.prompt(`Payment amount for ${inv.invoice_number} (balance ${fmt(inv.balance_due)})`, inv.balance_due);
    if (!amt || isNaN(Number(amt)) || Number(amt) <= 0) return;
    run(() => api.post(`/invoices/${inv.id}/payments`, { amount: Number(amt) }), "Payment recorded");
  };

  const editCategory = (c) => {
    const name = window.prompt(`Rename category "${c.name}" to:`, c.name);
    if (!name || !name.trim() || name.trim() === c.name) return;
    run(() => api.patch(`/expense-categories/${c.id}`, { name: name.trim() }), "Category renamed");
  };

  return (
    <div className="p-4 sm:p-8" data-testid="project-finance-page">
      <Link to={`/admin/projects/${id}`} className="inline-flex items-center gap-1.5 text-xs uppercase tracking-[0.15em] font-semibold text-slate-500 dark:text-slate-400 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-400 mb-4">
        <ArrowLeft size={14} strokeWidth={2.5} /> {project?.name || "Project"}
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-4 mb-8">
        <h1 className="font-heading font-bold text-4xl sm:text-5xl tracking-tight leading-none">Project Finance</h1>
        {(canFin || user?.role === "SiteEngineer") && (
          <div className="flex gap-3">
            {canFin && (
              <button data-testid="pf-add-income-button" onClick={() => setIncomeModal(true)}
                className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2.5 text-xs uppercase tracking-[0.15em] font-bold transition-colors rounded-md">
                <Plus size={15} strokeWidth={3} /> Add Income
              </button>
            )}
            <button data-testid="pf-add-expense-button" onClick={() => setExpenseModal(true)}
              className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white px-4 py-2.5 text-xs uppercase tracking-[0.15em] font-bold transition-colors rounded-md">
              <Minus size={15} strokeWidth={3} /> Add Expense
            </button>
          </div>
        )}
      </div>
      {s && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <ProjectFinanceSummaryCard label="Revenue from Client" value={fmtCr(s.revenue_last_year)}
            sub={`1 year · ${s.period_from} → ${s.period_to}`}
            icon={TrendingUp} accent="text-emerald-600 dark:text-emerald-400" testId="pf-income" />
          <ProjectFinanceSummaryCard label="Expense" value={fmtCr(s.cost_last_year)}
            sub={`1 year · ${s.period_from} → ${s.period_to}`}
            icon={TrendingDown} accent="text-blue-600 dark:text-blue-400" testId="pf-cost" />
          <ProjectFinanceSummaryCard label="Profit" value={fmtCr(s.profit)}
            sub={`1 year · ${s.period_from} → ${s.period_to}`}
            icon={IndianRupee} accent={s.profit < 0 ? "text-red-500" : "text-emerald-600 dark:text-emerald-400"} testId="pf-profit" />
          <ProjectFinanceSummaryCard label="Outstanding" value={fmtCr(s.outstanding_invoices)} icon={Receipt} accent="text-sky-600 dark:text-sky-400" testId="pf-outstanding" />
        </div>
      )}
      {s && (
        <div className="border border-amber-200 dark:border-amber-500/30 bg-amber-50/50 dark:bg-amber-500/5 p-4 mb-8" data-testid="pf-variations-panel">
          <div className="text-[11px] uppercase tracking-[0.2em] text-amber-700 dark:text-amber-400 font-semibold mb-3">Contract Value & Approved Variations (Change Orders)</div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
            {[
              ["Original Contract", fmt(s.original_budget), "pf-var-original", ""],
              ["Approved Variations", `+${fmt(s.approved_variations)} (${s.approved_co_count})`, "pf-var-approved", "text-amber-700 dark:text-amber-400"],
              ["Revised Contract Value", fmt(s.revised_contract_value), "pf-var-revised", "text-blue-700 dark:text-blue-400"],
              ["Pending Client Review", fmt(s.pending_co_value), "pf-var-pending", "text-sky-700 dark:text-sky-400"],
            ].map(([label, val, tid, cls]) => (
              <div key={tid} data-testid={tid}>
                <div className="text-[10px] uppercase tracking-[0.15em] text-slate-500 dark:text-slate-400 font-semibold">{label}</div>
                <div className={`font-heading font-bold text-lg mt-1 ${cls || "text-slate-900 dark:text-slate-100"}`}>{val}</div>
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-3">
          <div className="text-[11px] uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400 font-semibold">Invoices & Payments</div>
          {canFin && (
            <div className="surface p-4 flex flex-wrap items-end gap-3">
              <Input data-testid="invoice-amount-input" type="number" placeholder="Amount ₹" value={invForm.amount} onChange={(e) => setInvForm({ ...invForm, amount: e.target.value })} className="bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 rounded-md h-9 w-36" />
              <Input data-testid="invoice-due-input" type="date" value={invForm.due_date} onChange={(e) => setInvForm({ ...invForm, due_date: e.target.value })} className="bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 rounded-md h-9 w-40" />
              <Input data-testid="invoice-desc-input" placeholder="Description" value={invForm.description} onChange={(e) => setInvForm({ ...invForm, description: e.target.value })} className="bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 rounded-md h-9 flex-1 min-w-[160px]" />
              <Button data-testid="invoice-create" disabled={!invForm.amount}
                onClick={async () => { await run(() => api.post(`/projects/${id}/invoices`, { amount: Number(invForm.amount), due_date: invForm.due_date || null, description: invForm.description || null }), "Invoice created"); setInvForm({ amount: "", due_date: "", description: "" }); }}
                className="rounded-md bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-100 text-white dark:text-slate-900 font-bold uppercase tracking-wide h-9"><Plus size={14} strokeWidth={3} /> Invoice</Button>
            </div>
          )}
          {(invoices || []).map((inv) => <InvoiceCard key={inv.id} inv={inv} canWrite={canFin} onPay={recordPayment} projectName={project?.name} clientName={project?.client_name} />)}
          {(invoices || []).length === 0 && <div className="border border-slate-200 dark:border-slate-800 p-8 text-center text-xs text-slate-500 dark:text-slate-400" data-testid="invoices-empty">No invoices yet.</div>}
        </div>
        <div className="space-y-3">
          <div className="text-[11px] uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400 font-semibold">Expense Log</div>
          {canExp && (
            <div className="surface p-3 flex gap-2">
              <select data-testid="expense-category-select" value={expForm.category}
                onChange={(e) => setExpForm({ ...expForm, category: e.target.value })}
                className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-md h-9 text-sm text-slate-700 dark:text-slate-300 px-2 flex-1 min-w-0">
                <option value="">Category…</option>
                {(expCats || []).map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
              </select>
              <Input data-testid="expense-amount-input" type="number" placeholder="₹" value={expForm.amount} onChange={(e) => setExpForm({ ...expForm, amount: e.target.value })} className="bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 rounded-md h-9 w-28" />
              <Button data-testid="expense-create" disabled={!expForm.amount}
                onClick={async () => { await run(() => api.post(`/projects/${id}/expenses`, { category: expForm.category || "Misc", amount: Number(expForm.amount) }), "Expense added"); setExpForm({ category: "", amount: "" }); }}
                className="rounded-md bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-100 text-white dark:text-slate-900 font-bold h-9 px-3"><Plus size={14} strokeWidth={3} /></Button>
            </div>
          )}
          {(expenses || []).map((e) => (
            <div key={e.id} className="flex items-center gap-3 surface p-3 text-sm" data-testid={`expense-${e.id}`}>
              <span className="text-slate-700 dark:text-slate-300">{e.category}</span>
              <span className="text-xs text-slate-500 dark:text-slate-400">{e.expense_date}</span>
              <span className="ml-auto font-semibold text-slate-900 dark:text-slate-100">{fmt(e.amount)}</span>
            </div>
          ))}
          {canExp && (
            <div className="surface p-4 mt-6" data-testid="expense-categories-panel">
              <div className="text-[11px] uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400 font-semibold mb-3">Expense Categories</div>
              <div className="flex gap-2 mb-3">
                <Input data-testid="new-category-input" placeholder="New category name" value={newCat}
                  onChange={(e) => setNewCat(e.target.value)} className="bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 rounded-md h-9" />
                <Button data-testid="new-category-add" disabled={!newCat.trim()}
                  onClick={async () => { await run(() => api.post("/expense-categories", { name: newCat.trim() }), "Category added"); setNewCat(""); }}
                  className="rounded-md bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-100 text-white dark:text-slate-900 font-bold h-9 px-3"><Plus size={14} strokeWidth={3} /></Button>
              </div>
              <div className="space-y-1.5" data-testid="expense-categories-list">
                {(expCats || []).map((c) => (
                  <div key={c.id} className="flex items-center gap-2 border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-sm" data-testid={`category-row-${c.id}`}>
                    <Tag size={12} strokeWidth={2.5} className="text-blue-600 dark:text-blue-400" />
                    <span className="text-slate-700 dark:text-slate-300">{c.name}</span>
                    <button data-testid={`edit-category-${c.id}`} title="Edit category" onClick={() => editCategory(c)}
                      className="ml-auto p-1 text-slate-500 dark:text-slate-400 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-400 transition-colors"><Pencil size={13} strokeWidth={2.5} /></button>
                    <button data-testid={`delete-category-${c.id}`} title="Delete category"
                      onClick={() => window.confirm(`Delete category "${c.name}"? Existing expenses keep their label.`) && run(() => api.delete(`/expense-categories/${c.id}`), "Category deleted")}
                      className="p-1 text-slate-500 dark:text-slate-400 hover:text-red-600 dark:text-red-400 dark:hover:text-red-400 transition-colors"><Trash2 size={13} strokeWidth={2.5} /></button>
                  </div>
                ))}
                {(expCats || []).length === 0 && <div className="text-xs text-slate-400 dark:text-slate-500">No categories yet.</div>}
              </div>
            </div>
          )}
        </div>
      </div>

      {ledger && (
        <div className="mt-8" data-testid="ledger-section">
          <div className="flex items-center justify-between flex-wrap gap-3 mb-3">
            <div className="text-[11px] uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400 font-semibold">Project Ledger — Credits & Debits</div>
            <div className="flex gap-4 text-xs">
              <span className="text-emerald-600 dark:text-emerald-400" data-testid="ledger-total-credit">Credit: {fmt(ledger.total_credit)}</span>
              <span className="text-red-600 dark:text-red-400" data-testid="ledger-total-debit">Debit: {fmt(ledger.total_debit)}</span>
              <span className={ledger.net >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"} data-testid="ledger-net">Net: {fmt(ledger.net)}</span>
            </div>
          </div>
          <div className="border border-slate-200 dark:border-slate-800 overflow-x-auto">
            <table className="w-full text-sm" data-testid="ledger-table">
              <thead>
                <tr className="text-left text-[10px] uppercase tracking-[0.15em] text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
                  <th className="px-4 py-3">Date</th><th className="px-4 py-3">Description</th>
                  <th className="px-4 py-3 text-right">Credit (In)</th><th className="px-4 py-3 text-right">Debit (Out)</th>
                </tr>
              </thead>
              <tbody>
                {ledger.entries.map((en, i) => (
                  <tr key={i} className="border-b border-slate-100 dark:border-slate-800/60" data-testid={`ledger-row-${i}`}>
                    <td className="px-4 py-2.5 text-xs text-slate-500 dark:text-slate-400">{en.date || "—"}</td>
                    <td className="px-4 py-2.5 text-slate-700 dark:text-slate-300">{en.description}</td>
                    <td className="px-4 py-2.5 text-right font-semibold text-emerald-600 dark:text-emerald-400">{en.type === "credit" ? fmt(en.amount) : ""}</td>
                    <td className="px-4 py-2.5 text-right font-semibold text-red-600 dark:text-red-400">{en.type === "debit" ? fmt(en.amount) : ""}</td>
                  </tr>
                ))}
                {ledger.entries.length === 0 && (
                  <tr><td colSpan={4} className="px-4 py-8 text-center text-slate-500 dark:text-slate-400" data-testid="ledger-empty">No transactions yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
      <AddIncomeModal open={incomeModal} onOpenChange={setIncomeModal} defaultProjectId={Number(id)} />
      <AddExpenseModal open={expenseModal} onOpenChange={setExpenseModal} defaultProjectId={Number(id)} />
    </div>
  );
}
