import { useState, useEffect } from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../../../components/ui/dialog";
import { Input } from "../../../components/ui/input";
import { Label } from "../../../components/ui/label";
import { Button } from "../../../components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../../components/ui/select";
import api, { formatApiErrorDetail } from "../../../api/client";

const TYPES = ["Supplier", "Subcontractor", "Consultant"];
const STATUSES = ["Active", "Inactive", "Blacklisted"];
const empty = { name: "", vendor_type: "Supplier", trade: "", contact_name: "", email: "", phone: "", address: "", tax_id: "", insurance_expiry: "", status: "Active" };

export const VendorFormModal = ({ open, onOpenChange, vendor }) => {
  const qc = useQueryClient();
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);
  const isEdit = !!vendor;

  useEffect(() => {
    if (open) setForm(vendor ? {
      name: vendor.name || "", vendor_type: vendor.vendor_type || "Supplier", trade: vendor.trade || "",
      contact_name: vendor.contact_name || "", email: vendor.email || "", phone: vendor.phone || "",
      address: vendor.address || "", tax_id: vendor.tax_id || "",
      insurance_expiry: vendor.insurance_expiry || "", status: vendor.status || "Active",
    } : empty);
  }, [open, vendor]);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async (ev) => {
    ev.preventDefault();
    if (!form.name.trim()) { toast.error("Vendor name is required"); return; }
    if (!isEdit && form.insurance_expiry && form.insurance_expiry < new Date().toISOString().slice(0, 10)) {
      toast.error("Insurance expiry date cannot be in the past"); return;
    }
    setSaving(true);
    const payload = {
      name: form.name.trim(), vendor_type: form.vendor_type, trade: form.trade || null,
      contact_name: form.contact_name || null, email: form.email || null, phone: form.phone || null,
      insurance_expiry: form.insurance_expiry || null,
      address: form.address || null, tax_id: form.tax_id || null, status: form.status,
    };
    try {
      if (isEdit) {
        await api.patch(`/vendors/${vendor.id}`, payload);
        toast.success("Vendor updated");
      } else {
        await api.post("/vendors", payload);
        toast.success("Vendor created");
      }
      qc.invalidateQueries({ queryKey: ["vendors"] });
      onOpenChange(false);
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || err.message);
    } finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 rounded-md max-w-md" data-testid="vendor-form-modal">
        <DialogHeader>
          <DialogTitle className="font-heading text-2xl uppercase tracking-wide">{isEdit ? "Edit Vendor" : "Add Vendor"}</DialogTitle>
          <DialogDescription className="text-xs text-slate-500 dark:text-slate-400">
            {isEdit ? `Update details for ${vendor.name}.` : "Register a supplier, subcontractor or consultant."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-xs uppercase tracking-[0.15em] text-slate-500 dark:text-slate-400">Name *</Label>
              <Input data-testid="vendor-name-input" value={form.name} onChange={(e) => set("name", e.target.value)} className="mt-1.5 bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 rounded-md" />
            </div>
            <div>
              <Label className="text-xs uppercase tracking-[0.15em] text-slate-500 dark:text-slate-400">Type</Label>
              <Select value={form.vendor_type} onValueChange={(v) => { if (!v) return; set("vendor_type", v); }}>
                <SelectTrigger data-testid="vendor-type-select" className="mt-1.5 bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 rounded-md"><SelectValue /></SelectTrigger>
                <SelectContent className="bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700">
                  {TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-xs uppercase tracking-[0.15em] text-slate-500 dark:text-slate-400">Trade</Label>
              <Input data-testid="vendor-trade-input" placeholder="Steel, Glazing…" value={form.trade} onChange={(e) => set("trade", e.target.value)} className="mt-1.5 bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 rounded-md" />
            </div>
            <div>
              <Label className="text-xs uppercase tracking-[0.15em] text-slate-500 dark:text-slate-400">Contact Name</Label>
              <Input data-testid="vendor-contact-input" value={form.contact_name} onChange={(e) => set("contact_name", e.target.value)} className="mt-1.5 bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 rounded-md" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-xs uppercase tracking-[0.15em] text-slate-500 dark:text-slate-400">Email</Label>
              <Input data-testid="vendor-email-input" type="email" value={form.email} onChange={(e) => set("email", e.target.value)} className="mt-1.5 bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 rounded-md" />
            </div>
            <div>
              <Label className="text-xs uppercase tracking-[0.15em] text-slate-500 dark:text-slate-400">Phone</Label>
              <Input data-testid="vendor-phone-input" value={form.phone} onChange={(e) => set("phone", e.target.value)} className="mt-1.5 bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 rounded-md" />
            </div>
          </div>
          <div>
            <Label className="text-xs uppercase tracking-[0.15em] text-slate-500 dark:text-slate-400">Address</Label>
            <Input data-testid="vendor-address-input" value={form.address} onChange={(e) => set("address", e.target.value)} className="mt-1.5 bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 rounded-md" />
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label className="text-xs uppercase tracking-[0.15em] text-slate-500 dark:text-slate-400">GST / Tax ID</Label>
              <Input data-testid="vendor-taxid-input" value={form.tax_id} onChange={(e) => set("tax_id", e.target.value)} className="mt-1.5 bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 rounded-md" />
            </div>
            <div>
              <Label className="text-xs uppercase tracking-[0.15em] text-slate-500 dark:text-slate-400">Insurance Expiry</Label>
              <Input data-testid="vendor-insurance-input" type="date" min={isEdit ? undefined : new Date().toISOString().slice(0, 10)} value={form.insurance_expiry} onChange={(e) => set("insurance_expiry", e.target.value)} className="mt-1.5 bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 rounded-md" />
            </div>
            <div>
              <Label className="text-xs uppercase tracking-[0.15em] text-slate-500 dark:text-slate-400">Status</Label>
              <Select value={form.status} onValueChange={(v) => { if (!v) return; set("status", v); }}>
                <SelectTrigger data-testid="vendor-status-select" className="mt-1.5 bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 rounded-md"><SelectValue /></SelectTrigger>
                <SelectContent className="bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700">
                  {STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="rounded-md border-slate-300 dark:border-slate-700" data-testid="vendor-form-cancel">Cancel</Button>
            <Button type="submit" disabled={saving} data-testid="vendor-form-submit" className="rounded-md bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-100 text-white dark:text-slate-900 font-semibold uppercase tracking-wide">
              {isEdit ? "Save Changes" : "Create Vendor"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};
