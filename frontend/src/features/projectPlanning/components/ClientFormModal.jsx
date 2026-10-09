import { useState, useEffect } from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../../../components/ui/dialog";
import { Input } from "../../../components/ui/input";
import { Label } from "../../../components/ui/label";
import { Button } from "../../../components/ui/button";
import api, { formatApiErrorDetail } from "../../../api/client";

const empty = { name: "", email: "", phone: "", address: "" };

export const ClientFormModal = ({ open, onOpenChange, client }) => {
  const qc = useQueryClient();
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open)
      setForm(client ? {
        name: client.name || "", email: client.email || "",
        phone: client.phone || "", address: client.address || "",
      } : empty);
  }, [open, client]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async (ev) => {
    ev.preventDefault();
    if (!form.name.trim()) { toast.error("Client name is required"); return; }
    setSaving(true);
    try {
      if (client) await api.patch(`/clients/${client.id}`, form);
      else await api.post("/clients", form);
      toast.success(client ? "Client updated" : "Client created");
      qc.invalidateQueries({ queryKey: ["clients"] });
      qc.invalidateQueries({ queryKey: ["client"] });
      onOpenChange(false);
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || err.message);
    } finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 rounded-md max-w-md" data-testid="client-form-modal">
        <DialogHeader>
          <DialogTitle className="font-heading text-2xl uppercase tracking-wide">
            {client ? "Edit Client" : "New Client"}
          </DialogTitle>
          <DialogDescription className="text-xs text-slate-500 dark:text-slate-400">
            {client ? "Update client details." : "Add a new client to the directory."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <Label className="text-xs uppercase tracking-[0.15em] text-slate-500 dark:text-slate-400">Name *</Label>
            <Input data-testid="client-name-input" value={form.name} onChange={(e) => set("name", e.target.value)} className="mt-1.5 bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 rounded-md" />
          </div>
          <div>
            <Label className="text-xs uppercase tracking-[0.15em] text-slate-500 dark:text-slate-400">Phone No</Label>
            <Input data-testid="client-phone-input" value={form.phone} onChange={(e) => set("phone", e.target.value)} className="mt-1.5 bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 rounded-md" />
          </div>
          <div>
            <Label className="text-xs uppercase tracking-[0.15em] text-slate-500 dark:text-slate-400">Email</Label>
            <Input data-testid="client-email-input" type="email" value={form.email} onChange={(e) => set("email", e.target.value)} className="mt-1.5 bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 rounded-md" />
          </div>
          <div>
            <Label className="text-xs uppercase tracking-[0.15em] text-slate-500 dark:text-slate-400">Address</Label>
            <Input data-testid="client-address-input" value={form.address} onChange={(e) => set("address", e.target.value)} className="mt-1.5 bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 rounded-md" />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="rounded-md border-slate-300 dark:border-slate-700" data-testid="client-form-cancel">Cancel</Button>
            <Button type="submit" disabled={saving} data-testid="client-form-submit" className="rounded-md bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-100 text-white dark:text-slate-900 font-semibold uppercase tracking-wide">
              {client ? "Save Changes" : "Create Client"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};
