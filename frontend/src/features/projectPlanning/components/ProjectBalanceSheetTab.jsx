import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { IndianRupee, TrendingUp, TrendingDown, Wallet, FileDown, FileSpreadsheet } from "lucide-react";
import api from "../../../api/client";
import { downloadFile } from "../utils/downloadFile";

// Indian-comma formatted rupee amount, always 2 decimals.
// Negative values are wrapped in parentheses (accounting convention).
const fmtAmt = (n) => {
  const v = Number(n || 0);
  const abs = Math.abs(v).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return v < 0 ? `(Rs. ${abs})` : `Rs. ${abs}`;
};

const Card = ({ label, value, sub, icon: Icon, accent, testId }) => (
  <div className="stat-card surface surface-hover p-5" data-testid={testId}>
    <div className="flex items-center justify-between">
      <span className="text-[10px] uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400 font-semibold">{label}</span>
      <div className={`w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800/60 flex items-center justify-center ${accent}`}>
        <Icon size={15} strokeWidth={2.25} />
      </div>
    </div>
    <div className={`stat-value mt-4 ${accent}`}>{value}</div>
    {sub && <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-2 tracking-wide">{sub}</div>}
  </div>
);

const pad3 = (n) => String(n).padStart(3, "0");

/**
 * Build a standard accounting ledger from the backend entries.
 * - Ignores the synthetic "opening" row the backend appends (we render our own).
 * - Sorts chronologically ASCENDING; credits before debits on the same date.
 * - Assigns voucher numbers per type (RCPT-, PYMT-, CO-).
 * - Computes running balance strictly: Balance = Prev + Credit − Debit.
 */
const buildLedger = (rawEntries) => {
  const txns = (rawEntries || []).filter((e) => e.type !== "opening" && (e.type === "credit" || e.type === "debit" || e.type === "variation"));
  txns.sort((a, b) => {
    const da = a.date || ""; const dbt = b.date || "";
    if (da !== dbt) return da < dbt ? -1 : 1;
    const rank = (t) => (t === "credit" || t === "variation" ? 0 : 1);
    return rank(a.type) - rank(b.type);
  });

  let rcpt = 0, pymt = 0, co = 0, running = 0;
  const rows = txns.map((e) => {
    const isCredit = e.type === "credit" || e.type === "variation";
    let voucher;
    if (e.type === "variation") { co += 1; voucher = `CO-${pad3(co)}`; }
    else if (isCredit)          { rcpt += 1; voucher = `RCPT-${pad3(rcpt)}`; }
    else                        { pymt += 1; voucher = `PYMT-${pad3(pymt)}`; }
    const amount = Number(e.amount || 0);
    const credit = isCredit ? amount : 0;
    const debit = !isCredit ? amount : 0;
    running = running + credit - debit;
    return {
      date: e.date,
      voucher,
      particulars: e.description,
      type: isCredit ? "Credit" : "Debit",
      isVariation: e.type === "variation",
      credit,
      debit,
      balance: Math.round(running * 100) / 100,
    };
  });

  const totalCredit = Math.round(rows.reduce((s, r) => s + r.credit, 0) * 100) / 100;
  const totalDebit  = Math.round(rows.reduce((s, r) => s + r.debit, 0) * 100) / 100;
  const closing     = Math.round((totalCredit - totalDebit) * 100) / 100;
  return { rows, totalCredit, totalDebit, closing };
};

export const ProjectBalanceSheetTab = ({ projectId }) => {
  const { data: bs } = useQuery({
    queryKey: ["projectBalanceSheet", projectId],
    queryFn: () => api.get(`/projects/${projectId}/balance-sheet`).then((r) => r.data),
  });

  const ledger = useMemo(() => buildLedger(bs?.entries || []), [bs]);

  if (!bs) return <div className="border border-slate-200 dark:border-slate-800 p-8 text-center text-xs text-slate-500 dark:text-slate-400">Loading balance sheet…</div>;
  const r = bs.released;
  const balanceClass = (v) => (v < 0 ? "text-red-600 dark:text-red-400" : "text-slate-900 dark:text-slate-100");

  return (
    <div data-testid="project-balance-sheet">
      <div className="flex justify-end gap-2 mb-4">
        <button data-testid="pbs-export-pdf" onClick={() => downloadFile(`/projects/${projectId}/balance-sheet/export?fmt=pdf`, "project-balance-sheet.pdf").catch(() => toast.error("Export failed"))}
          className="flex items-center gap-2 border border-slate-300 dark:border-slate-700 px-3 py-2 text-[11px] uppercase tracking-[0.15em] font-semibold text-slate-600 dark:text-slate-400 hover:border-blue-400 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-400 transition-colors">
          <FileDown size={14} strokeWidth={2.5} /> Export PDF
        </button>
        <button data-testid="pbs-export-excel" onClick={() => downloadFile(`/projects/${projectId}/balance-sheet/export?fmt=xlsx`, "project-balance-sheet.xlsx").catch(() => toast.error("Export failed"))}
          className="flex items-center gap-2 border border-slate-300 dark:border-slate-700 px-3 py-2 text-[11px] uppercase tracking-[0.15em] font-semibold text-slate-600 dark:text-slate-400 hover:border-emerald-400 hover:text-emerald-600 dark:text-emerald-400 dark:hover:text-emerald-400 transition-colors">
          <FileSpreadsheet size={14} strokeWidth={2.5} /> Export Excel
        </button>
      </div>
      <div className="kpi-scroller mb-6" style={{ ["--kpi-cols"]: 2, ["--kpi-cols-lg"]: 4 }}>
        <Card label="Total Budget" value={fmtAmt(bs.budget)} sub={bs.approved_variations > 0 ? `Revised contract: ${fmtAmt(bs.revised_contract_value)} (incl. variations +${fmtAmt(bs.approved_variations)})` : undefined} icon={IndianRupee} accent="text-sky-600 dark:text-sky-400" testId="pbs-budget" />
        <Card label="Client Payment (In)" value={fmtAmt(bs.client_paid)} sub={`Outstanding from client: ${fmtAmt(bs.client_outstanding)}`} icon={TrendingUp} accent="text-emerald-600 dark:text-emerald-400" testId="pbs-client-paid" />
        <Card label="Payment Released (Out)" value={fmtAmt(bs.total_released)} icon={TrendingDown} accent="text-red-600 dark:text-red-400" testId="pbs-released" />
        <Card label="Balance (In − Out)" value={fmtAmt(bs.balance)} sub={`Budget remaining: ${fmtAmt(bs.budget_remaining)}`} icon={Wallet} accent={bs.balance < 0 ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400"} testId="pbs-balance" />
      </div>

      <div className="surface p-4 mb-6" data-testid="pbs-released-breakdown">
        <div className="text-[11px] uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400 font-semibold mb-3">Where the money is going — Payment Released Breakdown</div>
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 text-sm">
          {[
            ["Daily-Wage Labour", r.labour_wages, "pbs-bd-labour"],
            ["Staff Payroll", r.staff_payroll, "pbs-bd-payroll"],
            ["Site Expenses", r.expenses, "pbs-bd-expenses"],
            ["Procurement Committed", r.procurement, "pbs-bd-procurement"],
            ["Vendor Payments", r.vendor_payments, "pbs-bd-vendor-payments"],
          ].map(([label, amt, tid]) => (
            <div key={tid} className="border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-3" data-testid={tid}>
              <div className="text-[10px] uppercase tracking-[0.15em] text-slate-500 dark:text-slate-400 font-semibold">{label}</div>
              <div className="font-semibold text-slate-900 dark:text-slate-100 mt-1.5">{fmtAmt(amt)}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between flex-wrap gap-3 mb-3">
        <div className="text-[11px] uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400 font-semibold">Transaction Ledger — Chronological Order</div>
        <div className="flex gap-4 text-xs">
          <span className="text-emerald-600 dark:text-emerald-400" data-testid="pbs-tx-credit">Total Credit: {fmtAmt(ledger.totalCredit)}</span>
          <span className="text-red-600 dark:text-red-400" data-testid="pbs-tx-debit">Total Debit: {fmtAmt(ledger.totalDebit)}</span>
        </div>
      </div>
      <div className="border border-slate-200 dark:border-slate-800 overflow-x-auto">
        <table className="w-full text-sm" data-testid="pbs-transactions-table">
          <thead>
            <tr className="text-left text-[10px] uppercase tracking-[0.15em] text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Voucher No.</th>
              <th className="px-4 py-3">Particulars</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3 text-right">Debit (Out)</th>
              <th className="px-4 py-3 text-right">Credit (In)</th>
              <th className="px-4 py-3 text-right">Balance</th>
            </tr>
          </thead>
          <tbody>
            {/* Opening Balance b/f — always the very first row */}
            <tr className="border-b border-slate-100 dark:border-slate-800/60 bg-slate-50 dark:bg-slate-950" data-testid="pbs-tx-row-opening">
              <td className="px-4 py-2.5 text-xs text-slate-500 dark:text-slate-400">—</td>
              <td className="px-4 py-2.5 text-xs text-slate-500 dark:text-slate-400">—</td>
              <td className="px-4 py-2.5 italic font-semibold text-slate-600 dark:text-slate-400 uppercase text-xs tracking-wide">Opening Balance b/f</td>
              <td className="px-4 py-2.5" />
              <td className="px-4 py-2.5" />
              <td className="px-4 py-2.5" />
              <td className="px-4 py-2.5 text-right font-bold text-slate-900 dark:text-slate-100" data-testid="pbs-opening-balance">{fmtAmt(0)}</td>
            </tr>

            {ledger.rows.map((row, i) => (
              <tr key={i} className="border-b border-slate-100 dark:border-slate-800/60" data-testid={`pbs-tx-row-${i}`}>
                <td className="px-4 py-2.5 text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">{row.date || "—"}</td>
                <td className="px-4 py-2.5 text-xs font-mono font-semibold text-slate-600 dark:text-slate-400 whitespace-nowrap" data-testid={`pbs-voucher-${i}`}>{row.voucher}</td>
                <td className="px-4 py-2.5 text-slate-700 dark:text-slate-300">
                  {row.isVariation && <span className="border border-amber-300 dark:border-amber-500/40 text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/10 px-1.5 py-0.5 text-[9px] uppercase tracking-wide font-bold mr-2">Variation</span>}
                  {row.particulars}
                </td>
                <td className="px-4 py-2.5">
                  {row.type === "Credit"
                    ? <span data-testid={`pbs-type-${i}`} className="inline-flex items-center border border-emerald-300 dark:border-emerald-500/40 text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10 px-2 py-0.5 text-[10px] uppercase tracking-wide font-bold">Credit</span>
                    : <span data-testid={`pbs-type-${i}`} className="inline-flex items-center border border-red-300 dark:border-red-500/40 text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-500/10 px-2 py-0.5 text-[10px] uppercase tracking-wide font-bold">Debit</span>}
                </td>
                <td className="px-4 py-2.5 text-right font-semibold text-red-600 dark:text-red-400" data-testid={`pbs-debit-${i}`}>{row.debit > 0 ? fmtAmt(row.debit) : ""}</td>
                <td className="px-4 py-2.5 text-right font-semibold text-emerald-600 dark:text-emerald-400" data-testid={`pbs-credit-${i}`}>{row.credit > 0 ? fmtAmt(row.credit) : ""}</td>
                <td className={`px-4 py-2.5 text-right font-bold ${balanceClass(row.balance)}`} data-testid={`pbs-balance-${i}`}>{fmtAmt(row.balance)}</td>
              </tr>
            ))}

            {ledger.rows.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-500 dark:text-slate-400" data-testid="pbs-tx-empty">No transactions yet.</td></tr>
            )}

            {/* Totals / Closing Balance c/f — always the very last row */}
            {ledger.rows.length > 0 && (
              <tr className="bg-slate-100 dark:bg-slate-900 border-t-2 border-slate-300 dark:border-slate-700" data-testid="pbs-tx-row-closing">
                <td className="px-4 py-3" />
                <td className="px-4 py-3" />
                <td className="px-4 py-3 uppercase font-bold text-xs tracking-wide text-slate-700 dark:text-slate-200">Totals / Closing Balance c/f</td>
                <td className="px-4 py-3" />
                <td className="px-4 py-3 text-right font-bold text-red-600 dark:text-red-400" data-testid="pbs-total-debit">{fmtAmt(ledger.totalDebit)}</td>
                <td className="px-4 py-3 text-right font-bold text-emerald-600 dark:text-emerald-400" data-testid="pbs-total-credit">{fmtAmt(ledger.totalCredit)}</td>
                <td className={`px-4 py-3 text-right font-extrabold text-base ${balanceClass(ledger.closing)}`} data-testid="pbs-closing-balance">{fmtAmt(ledger.closing)}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
