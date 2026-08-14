import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Plus, Loader2, Pencil, Trash2 } from "lucide-react";
import {
  useAdminServices,
  useCreateService,
  useUpdateService,
  useDeleteService,
} from "@/hooks/queries/useAdmin";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import type { Service } from "@/lib/bookings";
import { getServiceFeeLabel } from "@/lib/bookings";
import { QueryError } from "@/components/admin/QueryError";

export const Route = createFileRoute("/admin/services")({
  component: AdminServices,
});
interface ServiceForm {
  name: string;
  description: string;
  /** null = flexible (no fixed slot) — e.g. Home Visit, confirmed by the doctor. */
  duration_minutes: number | null;
  price: number;
  is_active: boolean;
}

const emptyForm: ServiceForm = {
  name: "",
  description: "",
  duration_minutes: 30,
  price: 0,
  is_active: true,
};

function AdminServices() {
  const { data: services, isLoading, isError, error } = useAdminServices();
  const createService = useCreateService();
  const updateService = useUpdateService();
  const deleteService = useDeleteService();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Service | null>(null);
  const [form, setForm] = useState<ServiceForm>(emptyForm);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [listError, setListError] = useState<string | null>(null);

  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
    setSaveError(null);
    setDialogOpen(true);
  }

  function openEdit(s: Service) {
    setEditing(s);
    setForm({
      name: s.name,
      description: s.description ?? "",
      duration_minutes: s.duration_minutes,
      price: s.price,
      is_active: s.is_active,
    });
    setSaveError(null);
    setDialogOpen(true);
  }

  async function handleSave() {
    const result = editing
      ? await updateService.mutateAsync({ id: editing.id, data: form })
      : await createService.mutateAsync(form);
    if (result.error) {
      setSaveError(result.error);
      return;
    }
    setSaveError(null);
    setDialogOpen(false);
  }

  async function handleDelete(id: string) {
    const result = await deleteService.mutateAsync(id);
    if (result.error) setListError(result.error);
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Services</h1>
          <p className="mt-1 text-sm text-muted-foreground">Manage consultation services</p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4" /> Add Service
        </Button>
      </div>

      {isError && (
        <div className="mt-4">
          <QueryError error={error} />
        </div>
      )}

      {listError && (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {listError}
        </div>
      )}

      <div className="mt-6 space-y-3">
        {isLoading ? (
          <div className="flex justify-center p-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : services?.length === 0 ? (
          <p className="p-8 text-center text-sm text-muted-foreground">No services yet</p>
        ) : (
          services?.map((s) => (
            <div
              key={s.id}
              className="flex items-center justify-between rounded-xl border bg-card px-5 py-4"
            >
              <div>
                <div className="font-medium text-foreground">{s.name}</div>
                <div className="text-xs text-muted-foreground">
                  {s.duration_minutes ? `${s.duration_minutes} min` : "Flexible duration"} —{" "}
                  {getServiceFeeLabel(s)}
                  {!s.is_active && " (inactive)"}
                </div>
              </div>
              <div className="flex gap-1">
                <Button size="sm" variant="ghost" onClick={() => openEdit(s)}>
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-red-600"
                  onClick={() => handleDelete(s.id)}
                >
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
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground">Description</label>
              <Textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-foreground">Duration (min)</label>
                <Input
                  type="number"
                  placeholder="Flexible"
                  value={form.duration_minutes ?? ""}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      duration_minutes: e.target.value === "" ? null : +e.target.value,
                    })
                  }
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  Leave empty for flexible timing (e.g. Home Visit)
                </p>
              </div>
              <div>
                <label className="text-sm font-medium text-foreground">Price (Rs.)</label>
                <Input
                  type="number"
                  value={form.price}
                  onChange={(e) => setForm({ ...form, price: +e.target.value })}
                />
              </div>
            </div>
            <div className="flex items-center justify-between rounded-xl border border-border px-4 py-3">
              <div>
                <div className="text-sm font-medium text-foreground">Active</div>
                <div className="text-xs text-muted-foreground">
                  Show this service on the public booking page
                </div>
              </div>
              <Switch
                checked={form.is_active}
                onCheckedChange={(v) => setForm({ ...form, is_active: v })}
              />
            </div>
          </div>
          {saveError && <p className="text-sm font-medium text-destructive">{saveError}</p>}
          <DialogFooter className="shrink-0 -mx-6 -mb-6 gap-2 border-t bg-background px-6 py-4 sm:space-x-0">
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </DialogClose>
            <Button
              onClick={handleSave}
              disabled={createService.isPending || updateService.isPending}
            >
              {editing ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
