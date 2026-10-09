import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { useState } from "react";
import { Truck, ShieldAlert, ShieldCheck, Star, Scale, ArrowRight, Plus, Pencil } from "lucide-react";
import api from "../../../api/client";
import { useAuth } from "../../../context/AuthContext";
import { Button } from "../../../components/ui/button";
import { CommitmentStatusBadge } from "../components/CommitmentStatusBadge";
import { VendorFormModal } from "../components/VendorFormModal";
import { ProductFormModal } from "../components/ProductFormModal";
import { ProductListTable } from "../components/ProductListTable";

export default function VendorsPage() {
  const { user } = useAuth();
  const [vendorModal, setVendorModal] = useState(false);
  const [editVendor, setEditVendor] = useState(null);
  const [productModal, setProductModal] = useState(false);
  const [editProduct, setEditProduct] = useState(null);
  const canAdd = ["Admin", "SiteEngineer"].includes(user?.role);
  const canManageProducts = ["Admin", "SiteEngineer", "Accountant", "ProcurementOfficer"].includes(user?.role);
  const { data: vendors } = useQuery({
    queryKey: ["vendors"],
    queryFn: () => api.get("/vendors").then((r) => r.data),
  });
  const { data: packages } = useQuery({
    queryKey: ["allBidPackages"],
    queryFn: () => api.get("/bid-packages").then((r) => r.data),
  });

  return (
    <div className="p-4 sm:p-8" data-testid="vendors-page">
      <div className="flex items-end justify-between mb-8 flex-wrap gap-4">
        <div>
          <div className="text-blue-600 dark:text-blue-400 text-[11px] uppercase tracking-[0.3em] font-semibold mb-1">Procurement</div>
          <h1 className="font-heading font-bold text-4xl sm:text-5xl tracking-tight leading-none">Vendors & Quotes</h1>
        </div>
        {canAdd && (
          <Button data-testid="add-vendor-button" onClick={() => { setEditVendor(null); setVendorModal(true); }}
            className="rounded-md bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-100 text-white dark:text-slate-900 font-bold uppercase tracking-wide">
            <Plus size={15} strokeWidth={3} /> Add Vendor
          </Button>
        )}
      </div>

      <div className="text-[11px] uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400 font-semibold mb-3">Vendor Directory</div>
      <div className="border border-slate-200 dark:border-slate-800 overflow-x-auto mb-10">
        <table className="w-full text-sm" data-testid="vendors-table">
          <thead>
            <tr className="text-left text-[10px] uppercase tracking-[0.15em] text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
              <th className="px-4 py-3">Vendor</th>
              <th className="px-4 py-3">Trade</th>
              <th className="px-4 py-3">Contact</th>
              <th className="px-4 py-3">Insurance</th>
              <th className="px-4 py-3 text-center">Rating</th>
              <th className="px-4 py-3 text-center">Status</th>
              {canAdd && <th className="px-4 py-3 text-center">Edit</th>}
            </tr>
          </thead>
          <tbody>
            {(vendors || []).map((v) => (
              <tr key={v.id} className="border-b border-slate-100 dark:border-slate-800/60 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors" data-testid={`vendor-row-${v.id}`}>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className="bg-slate-200 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 p-2">
                      <Truck size={15} strokeWidth={2.5} className="text-blue-600 dark:text-blue-400" />
                    </div>
                    <div>
                      <div className="font-semibold text-slate-900 dark:text-slate-100">{v.name}</div>
                      <div className="text-xs text-slate-500 dark:text-slate-400">{v.vendor_type}{v.prequalified ? " · Prequalified" : ""}</div>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{v.trade || "—"}</td>
                <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400">
                  <div>{v.contact_name || "—"}</div>
                  <div>{v.email || "—"}</div>
                </td>
                <td className="px-4 py-3">
                  <span className={`flex items-center gap-1.5 text-xs ${v.insurance_expiring ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400"}`}>
                    {v.insurance_expiring ? <ShieldAlert size={13} strokeWidth={2.5} /> : <ShieldCheck size={13} strokeWidth={2.5} />}
                    {v.insurance_expiry || "None"}
                  </span>
                </td>
                <td className="px-4 py-3 text-center">
                  <span className="inline-flex items-center gap-1 text-slate-600 dark:text-slate-400">
                    <Star size={12} strokeWidth={2.5} className="text-amber-600 dark:text-amber-400" /> {v.rating ?? "—"}
                  </span>
                </td>
                <td className="px-4 py-3 text-center"><CommitmentStatusBadge status={v.status} /></td>
                {canAdd && (
                  <td className="px-4 py-3 text-center">
                    <Button size="sm" variant="outline" data-testid={`edit-vendor-${v.id}`}
                      onClick={() => { setEditVendor(v); setVendorModal(true); }}
                      className="rounded-md border-slate-300 dark:border-slate-700 h-8 w-8 p-0"><Pencil size={13} /></Button>
                  </td>
                )}
              </tr>
            ))}
            {(vendors || []).length === 0 && (
              <tr><td colSpan={canAdd ? 7 : 6} className="px-4 py-10 text-center text-slate-500 dark:text-slate-400">No vendors yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between mb-3 flex-wrap gap-3" data-testid="products-section-header">
        <div className="text-[11px] uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400 font-semibold">Products — Global Catalog</div>
        {canManageProducts && (
          <Button data-testid="add-product-button" onClick={() => { setEditProduct(null); setProductModal(true); }}
            className="rounded-md bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-100 text-white dark:text-slate-900 font-bold uppercase tracking-wide">
            <Plus size={15} strokeWidth={3} /> Add Product
          </Button>
        )}
      </div>
      <div className="mb-10">
        <ProductListTable canManage={canManageProducts} onEdit={(p) => { setEditProduct(p); setProductModal(true); }} />
      </div>

      <div className="text-[11px] uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400 font-semibold mb-3">Bid Packages — Quote Comparison</div>
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4" data-testid="bid-packages-grid">
        {(packages || []).map((bp) => (
          <Link key={bp.id} to={`/admin/procurement/bid-packages/${bp.id}/comparison`} data-testid={`bid-package-card-${bp.id}`}
            className="group surface p-5 hover:border-blue-400 transition-colors">
            <div className="flex items-center justify-between mb-3">
              <Scale size={18} strokeWidth={2.5} className="text-blue-600 dark:text-blue-400" />
              <CommitmentStatusBadge status={bp.status} />
            </div>
            <div className="font-heading font-semibold text-xl leading-tight">{bp.title}</div>
            <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">{bp.project_name} · {bp.cost_code || "—"}</div>
            <div className="flex items-center gap-4 mt-3 text-xs text-slate-500 dark:text-slate-400">
              <span>{bp.bid_count} bid{bp.bid_count === 1 ? "" : "s"}</span>
              <span>{bp.line_item_count} line item{bp.line_item_count === 1 ? "" : "s"}</span>
              <span className="ml-auto text-slate-500 dark:text-slate-400">Due {bp.bid_due_date || "—"}</span>
            </div>
            <div className="flex items-center gap-1.5 mt-4 text-[11px] uppercase tracking-[0.15em] font-semibold text-slate-500 dark:text-slate-400 group-hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-400 transition-colors">
              Compare Quotes <ArrowRight size={13} strokeWidth={2.5} />
            </div>
          </Link>
        ))}
        {(packages || []).length === 0 && (
          <div className="border border-slate-200 dark:border-slate-800 p-10 text-center text-slate-500 dark:text-slate-400 md:col-span-3">No bid packages yet. Create them from a project's Procurement dashboard.</div>
        )}
      </div>
      <VendorFormModal open={vendorModal} onOpenChange={(o) => { setVendorModal(o); if (!o) setEditVendor(null); }} vendor={editVendor} />
      <ProductFormModal open={productModal} onOpenChange={setProductModal} product={editProduct} />
    </div>
  );
}
