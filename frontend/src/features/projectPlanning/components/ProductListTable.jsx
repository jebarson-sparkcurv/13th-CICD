import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Pencil, Trash2, Package } from "lucide-react";
import api, { formatApiErrorDetail } from "../../../api/client";
import { Button } from "../../../components/ui/button";

const fmt = (n) => (n == null ? "—" : `₹${Number(n).toLocaleString("en-IN")}`);

export const ProductListTable = ({ onEdit, canManage }) => {
  const qc = useQueryClient();
  const { data: products } = useQuery({
    queryKey: ["products"],
    queryFn: () => api.get("/products").then((r) => r.data),
  });

  const remove = async (p) => {
    if (!window.confirm(`Delete product "${p.name}"?`)) return;
    try {
      await api.delete(`/products/${p.id}`);
      toast.success("Product deleted");
      qc.invalidateQueries({ queryKey: ["products"] });
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || err.message);
    }
  };

  return (
    <div className="border border-slate-200 dark:border-slate-800 overflow-x-auto">
      <table className="w-full text-sm" data-testid="products-table">
        <thead>
          <tr className="text-left text-[10px] uppercase tracking-[0.15em] text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
            <th className="px-4 py-3">Product</th>
            <th className="px-4 py-3">Unit</th>
            <th className="px-4 py-3">Category</th>
            <th className="px-4 py-3 text-right">Default Price</th>
            {canManage && <th className="px-4 py-3 text-center">Actions</th>}
          </tr>
        </thead>
        <tbody>
          {(products || []).map((p) => (
            <tr key={p.id} className="border-b border-slate-100 dark:border-slate-800/60 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors" data-testid={`product-row-${p.id}`}>
              <td className="px-4 py-3">
                <div className="flex items-center gap-3">
                  <div className="bg-slate-200 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 p-2">
                    <Package size={14} strokeWidth={2.5} className="text-amber-600 dark:text-amber-400" />
                  </div>
                  <div>
                    <div className="font-semibold text-slate-900 dark:text-slate-100">{p.name}</div>
                    {p.description && <div className="text-xs text-slate-500 dark:text-slate-400">{p.description}</div>}
                  </div>
                </div>
              </td>
              <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{p.unit}</td>
              <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{p.category || "—"}</td>
              <td className="px-4 py-3 text-right font-semibold text-slate-900 dark:text-slate-100">{fmt(p.default_price)}</td>
              {canManage && (
                <td className="px-4 py-3 text-center">
                  <div className="flex items-center justify-center gap-1.5">
                    <Button size="sm" variant="outline" data-testid={`product-edit-${p.id}`} onClick={() => onEdit(p)}
                      className="rounded-md border-slate-300 dark:border-slate-700 h-8 w-8 p-0"><Pencil size={13} /></Button>
                    <Button size="sm" variant="outline" data-testid={`product-delete-${p.id}`} onClick={() => remove(p)}
                      className="rounded-md border-slate-300 dark:border-slate-700 h-8 w-8 p-0 text-red-600 dark:text-red-400"><Trash2 size={13} /></Button>
                  </div>
                </td>
              )}
            </tr>
          ))}
          {(products || []).length === 0 && (
            <tr><td colSpan={canManage ? 5 : 4} className="px-4 py-10 text-center text-slate-500 dark:text-slate-400" data-testid="products-empty">No products in the catalog yet. Add one to start quoting.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
};
