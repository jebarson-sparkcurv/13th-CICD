import { useState, useEffect } from "react";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../../../components/ui/dialog";
import { Input } from "../../../components/ui/input";
import { Label } from "../../../components/ui/label";
import { Button } from "../../../components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../../components/ui/select";
import api, { formatApiErrorDetail } from "../../../api/client";
import { useClients } from "../hooks/useProjects";

const ROLES = ["Admin", "SiteEngineer", "Accountant", "ProcurementOfficer", "Client", "Vendor"];
const STAFF_ROLES = ["Admin", "SiteEngineer", "Accountant", "ProcurementOfficer"];
const empty = { name: "", email: "", phone: "", password: "", role: "SiteEngineer", base_salary: "", linked_client_id: "", new_client_name: "", linked_vendor_id: "", new_vendor_name: "" };

export const UserFormModal = ({ open, onOpenChange, user }) => {
  const qc = useQueryClient();
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);
  const { data: clients } = useClients(open && form.role === "Client");
  const { data: vendors } = useQuery({
    queryKey: ["vendors"],
    queryFn: () => api.get("/vendors").then((r) => r.data),
    enabled: open && form.role === "Vendor",
  });

  useEffect(() => {
    if (open)
      setForm(user ? {
        ...empty, name: user.name || "", email: user.email || "", phone: user.phone || "",
        role: user.role || "SiteEngineer", base_salary: user.base_salary ?? "",
        linked_client_id: user.client_id ? String(user.client_id) : "",
        linked_vendor_id: user.linked_vendor_id ? String(user.linked_vendor_id) : "",
      } : empty);
  }, [open, user]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async (ev) => {
    ev.preventDefault();
    if (!form.name.trim() || !form.email.trim()) { toast.error("Name and email are required"); return; }
    if (!user && form.password.length < 6) { toast.error("Password must be at least 6 characters"); return; }
    setSaving(true);
    try {
      if (user) {
        await api.patch(`/users/${user.id}`, {
          name: form.name.trim(), phone: form.phone || null, role: form.role,
          base_salary: form.base_salary !== "" ? Number(form.base_salary) : null,
          linked_client_id: form.role === "Client" && form.linked_client_id ? Number(form.linked_client_id) : null,
          linked_vendor_id: form.role === "Vendor" && form.linked_vendor_id ? Number(form.linked_vendor_id) : null,
        });
        toast.success("User updated");
      } else {
        await api.post("/users", {
          name: form.name.trim(), email: form.email.trim(), phone: form.phone || null,
          password: form.password, role: form.role,
          base_salary: STAFF_ROLES.includes(form.role) && form.base_salary !== "" ? Number(form.base_salary) : null,
          linked_client_id: form.role === "Client" && form.linked_client_id ? Number(form.linked_client_id) : null,
          new_client_name: form.role === "Client" && !form.linked_client_id && form.new_client_name ? form.new_client_name : null,
          linked_vendor_id: form.role === "Vendor" && form.linked_vendor_id ? Number(form.linked_vendor_id) : null,
          new_vendor_name: form.role === "Vendor" && !form.linked_vendor_id && form.new_vendor_name ? form.new_vendor_name : null,
        });
        toast.success("User created");
      }
      qc.invalidateQueries({ queryKey: ["allUsers"] });
      onOpenChange(false);
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || err.message);
    } finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 rounded-md max-w-md" data-testid="user-form-modal">
        <DialogHeader>
          <DialogTitle className="font-heading text-2xl uppercase tracking-wide">
            {user ? "Edit User" : "New User"}
          </DialogTitle>
          <DialogDescription className="text-xs text-slate-500 dark:text-slate-400">
            {user ? "Update user details and role." : "Create an account — extra fields appear based on the selected role."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-xs uppercase tracking-[0.15em] text-slate-500 dark:text-slate-400">Name *</Label>
              <Input data-testid="user-name-input" value={form.name} onChange={(e) => set("name", e.target.value)} className="mt-1.5 bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 rounded-md" />
            </div>
            <div>
              <Label className="text-xs uppercase tracking-[0.15em] text-slate-500 dark:text-slate-400">Phone</Label>
              <Input data-testid="user-phone-input" value={form.phone} onChange={(e) => set("phone", e.target.value)} className="mt-1.5 bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 rounded-md" />
            </div>
          </div>
          <div>
            <Label className="text-xs uppercase tracking-[0.15em] text-slate-500 dark:text-slate-400">Email *</Label>
            <Input data-testid="user-email-input" type="email" value={form.email} disabled={!!user} onChange={(e) => set("email", e.target.value)} className="mt-1.5 bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 rounded-md" />
          </div>
          {!user && (
            <div>
              <Label className="text-xs uppercase tracking-[0.15em] text-slate-500 dark:text-slate-400">Password *</Label>
              <Input data-testid="user-password-input" type="password" value={form.password} onChange={(e) => set("password", e.target.value)} className="mt-1.5 bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 rounded-md" />
            </div>
          )}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-xs uppercase tracking-[0.15em] text-slate-500 dark:text-slate-400">Role *</Label>
              <Select value={form.role} onValueChange={(v) => set("role", v)}>
                <SelectTrigger data-testid="user-role-select" className="mt-1.5 bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 rounded-md"><SelectValue /></SelectTrigger>
                <SelectContent className="bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700">
                  {ROLES.map((r) => <SelectItem key={r} value={r}>{r.replace(/([A-Z])/g, " $1").trim()}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {STAFF_ROLES.includes(form.role) && (
              <div>
                <Label className="text-xs uppercase tracking-[0.15em] text-slate-500 dark:text-slate-400">Base Salary (₹/mo)</Label>
                <Input data-testid="user-salary-input" type="number" value={form.base_salary} onChange={(e) => set("base_salary", e.target.value)} className="mt-1.5 bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 rounded-md" />
              </div>
            )}
          </div>
          {form.role === "Client" && (
            <div className="border border-slate-200 dark:border-slate-800 p-3 space-y-3" data-testid="client-link-fields">
              <div>
                <Label className="text-xs uppercase tracking-[0.15em] text-slate-500 dark:text-slate-400">Link Existing Client</Label>
                <Select value={form.linked_client_id} onValueChange={(v) => set("linked_client_id", v)}>
                  <SelectTrigger data-testid="user-client-select" className="mt-1.5 bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 rounded-md"><SelectValue placeholder="Select client" /></SelectTrigger>
                  <SelectContent className="bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700">
                    {clients?.map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              {!user && !form.linked_client_id && (
                <div>
                  <Label className="text-xs uppercase tracking-[0.15em] text-slate-500 dark:text-slate-400">…or Create New Client</Label>
                  <Input data-testid="user-new-client-input" placeholder="New client name" value={form.new_client_name} onChange={(e) => set("new_client_name", e.target.value)} className="mt-1.5 bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 rounded-md" />
                </div>
              )}
            </div>
          )}
          {form.role === "Vendor" && (
            <div className="border border-slate-200 dark:border-slate-800 p-3 space-y-3" data-testid="vendor-link-fields">
              <div>
                <Label className="text-xs uppercase tracking-[0.15em] text-slate-500 dark:text-slate-400">Link Existing Vendor</Label>
                <Select value={form.linked_vendor_id} onValueChange={(v) => set("linked_vendor_id", v)}>
                  <SelectTrigger data-testid="user-vendor-select" className="mt-1.5 bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 rounded-md"><SelectValue placeholder="Select vendor" /></SelectTrigger>
                  <SelectContent className="bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700">
                    {vendors?.map((v) => <SelectItem key={v.id} value={String(v.id)}>{v.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              {!user && !form.linked_vendor_id && (
                <div>
                  <Label className="text-xs uppercase tracking-[0.15em] text-slate-500 dark:text-slate-400">…or Create New Vendor</Label>
                  <Input data-testid="user-new-vendor-input" placeholder="New vendor name" value={form.new_vendor_name} onChange={(e) => set("new_vendor_name", e.target.value)} className="mt-1.5 bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 rounded-md" />
                </div>
              )}
            </div>
          )}
          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="rounded-md border-slate-300 dark:border-slate-700" data-testid="user-form-cancel">Cancel</Button>
            <Button type="submit" disabled={saving} data-testid="user-form-submit" className="rounded-md bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-100 text-white dark:text-slate-900 font-semibold uppercase tracking-wide">
              {user ? "Save Changes" : "Create User"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};
