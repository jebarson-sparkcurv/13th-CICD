import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { IndianRupee, TrendingDown, TrendingUp, Receipt, ArrowRight, Banknote, Printer, MessageCircle, Mail, Plus, Minus } from "lucide-react";
import api from "../../../api/client";
import { AddIncomeModal } from "../components/AddIncomeModal";
import { AddExpenseModal } from "../components/AddExpenseModal";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../../components/ui/tabs";
import { DashboardStatCard } from "../components/DashboardStatCard";
import { CommitmentStatusBadge } from "../components/CommitmentStatusBadge";
import { OrgBalanceSheetTab } from "../components/OrgBalanceSheetTab";
import { printInvoice, shareInvoiceWhatsApp, shareInvoiceEmail } from "../utils/invoiceShare";

const fmtCr = (n) => `${n < 0 ? "−" : ""}₹${Math.abs(n || 0).toLocaleString("en-IN")}`;

const triggerCls = "rounded-md px-4 py-2 text-[11px] uppercase tracking-[0.15em] font-semibold text-slate-500 dark:text-slate-400 data-[state=active]:text-slate-900 dark:data-[state=active]:text-slate-100 transition-colors whitespace-nowrap";

export default function FinancePage() {
  const [incomeModal, setIncomeModal] = useState(false);
  const [expenseModal, setExpenseModal] = useState(false);
  const { data: s } = useQuery({
    queryKey: ["orgFinance"],
    queryFn: () => api.get("/finance/dashboard-summary").then((r) => r.data),
  });
  const { data: runs } = useQuery({
    queryKey: ["payrollRuns"],
    queryFn: () => api.get("/payroll-runs").then((r) => r.data),
  });

  return (
    <div className="p-4 sm:p-8" data-testid="finance-page">
      <div className="flex items-end justify-between mb-8 flex-wrap gap-4">
        <div>
          <div className="text-blue-600 dark:text-blue-400 text-[11px] uppercase tracking-[0.3em] font-semibold mb-1">Organization</div>
          <h1 className="font-heading font-bold text-4xl sm:text-5xl tracking-tight leading-none">Finance</h1>
        </div>
        <div className="flex flex-wrap gap-3">
          <button data-testid="add-income-button" onClick={() => setIncomeModal(true)}
            className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2.5 text-xs uppercase tracking-[0.15em] font-bold transition-colors rounded-md">
            <Plus size={15} strokeWidth={3} /> Add Income
          </button>
          <button data-testid="add-expense-button" onClick={() => setExpenseModal(true)}
            className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white px-4 py-2.5 text-xs uppercase tracking-[0.15em] font-bold transition-colors rounded-md">
            <Minus size={15} strokeWidth={3} /> Add Expense
          </button>
          <Link to="/admin/finance/payroll" data-testid="payroll-link"
            className="flex items-center gap-2 border border-slate-300 dark:border-slate-700 px-4 py-2.5 text-xs uppercase tracking-[0.15em] font-semibold text-slate-600 dark:text-slate-400 hover:border-blue-400 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-400 transition-colors">
            <Banknote size={15} strokeWidth={2.5} /> Payroll <ArrowRight size={13} strokeWidth={2.5} />
          </Link>
        </div>
      </div>

      <Tabs defaultValue="overview">
        <TabsList className="tab-strip w-fit h-auto justify-start mb-6 bg-slate-100 dark:bg-slate-900/60">
          <TabsTrigger value="overview" data-testid="fin-tab-overview" className={triggerCls}>Overview</TabsTrigger>
          <TabsTrigger value="balancesheet" data-testid="fin-tab-balancesheet" className={triggerCls}>Balance Sheet</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" data-testid="fin-overview-content">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            <DashboardStatCard label="Income To Date" value={s ? fmtCr(s.income_to_date) : "—"} icon={TrendingUp} variant="success" testId="fin-card-income" onClick={() => {}} />
            <DashboardStatCard label="Cost To Date" value={s ? fmtCr(s.cost_to_date) : "—"} icon={TrendingDown} variant="default" testId="fin-card-cost" onClick={() => {}} />
            <DashboardStatCard label="Profit" value={s ? fmtCr(s.profit) : "—"} icon={IndianRupee} variant={s?.profit < 0 ? "warning" : "success"} testId="fin-card-profit" onClick={() => {}} />
            <DashboardStatCard label="Outstanding Invoices" value={s ? fmtCr(s.outstanding_invoices) : "—"} icon={Receipt} variant="info" testId="fin-card-outstanding" onClick={() => {}} />
          </div>
          <div className="grid lg:grid-cols-2 gap-6">
            <div>
              <div className="text-[11px] uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400 font-semibold mb-3">Overdue Invoices</div>
              <div className="space-y-2" data-testid="overdue-invoices">
                {(s?.overdue_invoices || []).length === 0 && <div className="border border-slate-200 dark:border-slate-800 p-6 text-center text-xs text-slate-500 dark:text-slate-400">No overdue invoices.</div>}
                {(s?.overdue_invoices || []).map((inv) => (
                  <div key={inv.id} className="flex items-center gap-3 border border-red-200 dark:border-red-500/30 bg-red-50 dark:bg-red-500/10/60 dark:bg-red-500/5 p-3" data-testid={`overdue-inv-${inv.id}`}>
                    <Link to={`/admin/projects/${inv.project_id}/finance`} className="flex items-center gap-3 flex-1 min-w-0 hover:opacity-80 transition-opacity">
                      <span className="font-heading font-bold text-blue-600 dark:text-blue-400">{inv.invoice_number}</span>
                      <span className="text-xs text-slate-500 dark:text-slate-400">Due {inv.due_date}</span>
                      <span className="ml-auto font-semibold text-slate-900 dark:text-slate-100 text-sm">{fmtCr(inv.balance_due)}</span>
                    </Link>
                    <CommitmentStatusBadge status="Overdue" />
                    <div className="flex gap-1">
                      <button data-testid={`overdue-print-${inv.id}`} title="Print invoice" onClick={() => printInvoice(inv)}
                        className="p-1.5 text-slate-500 dark:text-slate-400 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-400 transition-colors"><Printer size={14} strokeWidth={2.5} /></button>
                      <button data-testid={`overdue-whatsapp-${inv.id}`} title="Send via WhatsApp" onClick={() => shareInvoiceWhatsApp(inv)}
                        className="p-1.5 text-slate-500 dark:text-slate-400 hover:text-emerald-600 dark:text-emerald-400 dark:hover:text-emerald-400 transition-colors"><MessageCircle size={14} strokeWidth={2.5} /></button>
                      <button data-testid={`overdue-email-${inv.id}`} title="Send via Email" onClick={() => shareInvoiceEmail(inv)}
                        className="p-1.5 text-slate-500 dark:text-slate-400 hover:text-sky-600 dark:text-sky-400 dark:hover:text-sky-400 transition-colors"><Mail size={14} strokeWidth={2.5} /></button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400 font-semibold mb-3">Payroll Runs · allocated {s ? fmtCr(s.payroll_total_all) : "—"}</div>
              <div className="space-y-2" data-testid="payroll-runs-list">
                {(runs || []).length === 0 && <div className="border border-slate-200 dark:border-slate-800 p-6 text-center text-xs text-slate-500 dark:text-slate-400">No payroll runs yet.</div>}
                {(runs || []).map((r) => (
                  <Link key={r.id} to="/admin/finance/payroll" className="flex items-center gap-3 surface p-3 hover:border-blue-400 transition-colors">
                    <span className="text-sm text-slate-700 dark:text-slate-300">{r.period_start} → {r.period_end}</span>
                    <span className="text-xs text-slate-500 dark:text-slate-400">{r.entry_count} staff</span>
                    <span className="ml-auto font-semibold text-slate-900 dark:text-slate-100 text-sm">{fmtCr(r.total_net_pay)}</span>
                    <CommitmentStatusBadge status={r.status} />
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="balancesheet" data-testid="fin-balancesheet-content">
          <OrgBalanceSheetTab />
        </TabsContent>
      </Tabs>
      <AddIncomeModal open={incomeModal} onOpenChange={setIncomeModal} />
      <AddExpenseModal open={expenseModal} onOpenChange={setExpenseModal} />
    </div>
  );
}
