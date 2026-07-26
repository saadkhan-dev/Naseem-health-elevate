import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Plus, Loader2, Pencil, Trash2 } from "lucide-react";
import { useAdminServices, useCreateService, useUpdateService, useDeleteService } from "@/hooks/queries/useAdmin";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import type { Service } from "@/lib/bookings";

export const Route = createFileRoute("/admin/services")({
  component: AdminServices,
});

const emptyForm = { name: "", description: "", duration_minutes: 30, price: 0 };

function AdminServices() {
  const { data: services, isLoading } = useAdminServices();
  const createService = useCreateService();
  const updateService = useUpdateService();
  const deleteService = useDeleteService();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Service | null>(null);
  const [form, setForm] = useState(emptyForm);

  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
    setDialogOpen(true);
  }

  function openEdit(s: Service) {
    setEditing(s);
    setForm({
      name: s.name,
      description: s.description ?? "",
      duration_minutes: s.duration_minutes,
      price: s.price,
    });
    setDialogOpen(true);
  }

  async function handleSave() {
    if (editing) {
      await updateService.mutateAsync({ id: editing.id, data: form });
    } else {
      await createService.mutateAsync(form);
    }
    setDialogOpen(false);
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Services</h1>
          <p className="mt-1 text-sm text-muted-foreground">Manage consultation services</p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="mr-1 h-4 w-4" /> Add Service
        </Button>
      </div>

      <div className="mt-6 space-y-3">
        {isLoading ? (
          <div className="flex justify-center p-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : services?.length === 0 ? (
          <p className="p-8 text-center text-sm text-muted-foreground">No services yet</p>
        ) : (
          services?.map((s) => (
            <div key={s.id} className="flex items-center justify-between rounded-xl border bg-card px-5 py-4">
              <div>
                <div className="font-medium text-foreground">{s.name}</div>
                <div className="text-xs text-muted-foreground">
                  {s.duration_minutes} min — Rs. {s.price}
                  {!s.is_active && " (inactive)"}
                </div>
              </div>
              <div className="flex gap-1">
                <Button size="sm" variant="ghost" onClick={() => openEdit(s)}>
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button size="sm" variant="ghost" className="text-red-600" onClick={() => deleteService.mutate(s.id)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Service" : "Add Service"}</DialogTitle>
            <DialogDescription>Configure the service details</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-foreground">Name</label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground">Description</label>
              <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-foreground">Duration (min)</label>
                <Input type="number" value={form.duration_minutes} onChange={(e) => setForm({ ...form, duration_minutes: +e.target.value })} />
              </div>
              <div>
                <label className="text-sm font-medium text-foreground">Price (Rs.)</label>
                <Input type="number" value={form.price} onChange={(e) => setForm({ ...form, price: +e.target.value })} />
              </div>
            </div>
            <Button onClick={handleSave} className="w-full" disabled={createService.isPending || updateService.isPending}>
              {editing ? "Update" : "Create"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
