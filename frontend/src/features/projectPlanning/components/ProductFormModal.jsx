import { useState, useEffect } from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../../../components/ui/dialog";
import { Input } from "../../../components/ui/input";
import { Label } from "../../../components/ui/label";
import { Button } from "../../../components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../../components/ui/select";
import api, { formatApiErrorDetail } from "../../../api/client";

const UNITS = ["nos", "bag", "ton", "kg", "sqft", "cft", "litre", "metre", "roll", "box"];
const CATEGORIES = ["Cement", "Steel", "Electrical", "Plumbing", "Aggregate", "Timber", "Paint", "Hardware", "Other"];
const empty = { name: "", unit: "nos", category: "", description: "", default_price: "" };

export const ProductFormModal = ({ open, onOpenChange, product }) => {
  const qc = useQueryClient();
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) setForm(product ? {
      name: product.name || "", unit: product.unit || "nos", category: product.category || "",
      description: product.description || "", default_price: product.default_price ?? "",
    } : empty);
  }, [open, product]);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async (ev) => {
    ev.preventDefault();
    if (!form.name.trim()) { toast.error("Product name is required"); return; }
    setSaving(true);
    const payload = {
      name: form.name.trim(), unit: form.unit || "nos", category: form.category || null,
      description: form.description || null,
      default_price: form.default_price === "" ? null : Number(form.default_price),
    };
    try {
      if (product) {
        await api.patch(`/products/${product.id}`, payload);
        toast.success("Product updated");
      } else {
        await api.post("/products", payload);
        toast.success("Product created");
      }
      qc.invalidateQueries({ queryKey: ["products"] });
      onOpenChange(false);
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || err.message);
    } finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 rounded-md max-w-md" data-testid="product-form-modal">
        <DialogHeader>
          <DialogTitle className="font-heading text-2xl uppercase tracking-wide">{product ? "Edit Product" : "Add Product"}</DialogTitle>
          <DialogDescription className="text-xs text-slate-500 dark:text-slate-400">Global catalog item — any vendor can be quoted against it.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <Label className="text-xs uppercase tracking-[0.15em] text-slate-500 dark:text-slate-400">Product Name *</Label>
            <Input data-testid="product-name-input" value={form.name} onChange={(e) => set("name", e.target.value)}
              placeholder="e.g. OPC 53 Grade Cement" className="mt-1.5 bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 rounded-md" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-xs uppercase tracking-[0.15em] text-slate-500 dark:text-slate-400">Unit</Label>
              <Select value={form.unit} onValueChange={(v) => { if (!v) return; set("unit", v); }}>
                <SelectTrigger data-testid="product-unit-select" className="mt-1.5 bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 rounded-md"><SelectValue /></SelectTrigger>
                <SelectContent className="bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700">
                  {UNITS.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs uppercase tracking-[0.15em] text-slate-500 dark:text-slate-400">Category</Label>
              <Select value={form.category || undefined} onValueChange={(v) => { if (!v) return; set("category", v); }}>
                <SelectTrigger data-testid="product-category-select" className="mt-1.5 bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 rounded-md"><SelectValue placeholder="Optional" /></SelectTrigger>
                <SelectContent className="bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700">
                  {CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label className="text-xs uppercase tracking-[0.15em] text-slate-500 dark:text-slate-400">Default Price (₹, reference)</Label>
            <Input data-testid="product-price-input" type="number" min="0" step="0.01" value={form.default_price}
              onChange={(e) => set("default_price", e.target.value)} placeholder="Pre-fills quotations, editable there"
              className="mt-1.5 bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 rounded-md" />
          </div>
          <div>
            <Label className="text-xs uppercase tracking-[0.15em] text-slate-500 dark:text-slate-400">Description</Label>
            <Input data-testid="product-description-input" value={form.description} onChange={(e) => set("description", e.target.value)}
              className="mt-1.5 bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 rounded-md" />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="rounded-md border-slate-300 dark:border-slate-700" data-testid="product-form-cancel">Cancel</Button>
            <Button type="submit" disabled={saving} data-testid="product-form-submit" className="rounded-md bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-100 text-white dark:text-slate-900 font-semibold uppercase tracking-wide">
              {product ? "Save Changes" : "Create Product"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};
