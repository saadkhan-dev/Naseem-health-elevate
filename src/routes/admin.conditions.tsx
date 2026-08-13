import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Plus, Loader2, Pencil, Trash2 } from "lucide-react";
import {
  useAdminConditions,
  useCreateCondition,
  useUpdateCondition,
  useDeleteCondition,
} from "@/hooks/queries/useContent";
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
import type { Condition, ConditionCategory } from "@/lib/site-content";
import { QueryError } from "@/components/admin/QueryError";

export const Route = createFileRoute("/admin/conditions")({
  component: AdminConditions,
});

const emptyForm = {
  category: "homeopathic" as ConditionCategory,
  title: "",
  description: "",
  sort_order: 0,
  is_active: true,
};

const categoryLabels: Record<ConditionCategory, string> = {
  homeopathic: "Homeopathy",
  physiotherapy: "Physiotherapy",
};

function ConditionsSection({
  title,
  category,
  conditions,
  onAdd,
  onEdit,
  onDelete,
}: {
  title: string;
  category: ConditionCategory;
  conditions: Condition[];
  onAdd: (category: ConditionCategory) => void;
  onEdit: (condition: Condition) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <section className="rounded-2xl border border-border bg-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-xl font-semibold text-foreground">{title}</h2>
        <Button size="sm" onClick={() => onAdd(category)}>
          <Plus className="h-4 w-4" /> Add Disease
        </Button>
      </div>

      <div className="mt-4 space-y-3">
        {conditions.length === 0 ? (
          <p className="p-6 text-center text-sm text-muted-foreground">
            No {categoryLabels[category].toLowerCase()} diseases yet
          </p>
        ) : (
          conditions.map((c) => (
            <div
              key={c.id}
              className="flex items-center justify-between rounded-xl border bg-background px-4 py-3"
            >
              <div className="min-w-0">
                <div className="font-medium text-foreground">{c.title}</div>
                <div className="truncate text-xs text-muted-foreground">
                  {c.description || "No description"}
                  {!c.is_active && " (hidden)"}
                </div>
              </div>
              <div className="flex shrink-0 gap-1">
                <Button size="sm" variant="ghost" onClick={() => onEdit(c)}>
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-red-600"
                  onClick={() => onDelete(c.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );
}

function AdminConditions() {
  const { data: conditions, isLoading, isError, error } = useAdminConditions();
  const createCondition = useCreateCondition();
  const updateCondition = useUpdateCondition();
  const deleteCondition = useDeleteCondition();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Condition | null>(null);
  const [sectionCategory, setSectionCategory] = useState<ConditionCategory>("homeopathic");
  const [form, setForm] = useState(emptyForm);

  const homeopathic = useMemo(
    () => (conditions ?? []).filter((c) => c.category === "homeopathic"),
    [conditions],
  );
  const physiotherapy = useMemo(
    () => (conditions ?? []).filter((c) => c.category === "physiotherapy"),
    [conditions],
  );

  function openCreate(category: ConditionCategory) {
    setEditing(null);
    setSectionCategory(category);
    setForm({ ...emptyForm, category });
    setDialogOpen(true);
  }

  function openEdit(c: Condition) {
    setEditing(c);
    setSectionCategory(c.category);
    setForm({
      category: c.category,
      title: c.title,
      description: c.description,
      sort_order: c.sort_order,
      is_active: c.is_active,
    });
    setDialogOpen(true);
  }

  async function handleSave() {
    if (editing) {
      await updateCondition.mutateAsync({ id: editing.id, data: form });
    } else {
      await createCondition.mutateAsync(form);
    }
    setDialogOpen(false);
  }

  return (
    <div>
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Diseases & Conditions</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage homeopathic and physiotherapy diseases shown on the public site
        </p>
      </div>

      {isError && (
        <div className="mt-4">
          <QueryError error={error} />
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center p-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="mt-6 space-y-6">
          <ConditionsSection
            title="Homeopathic Diseases"
            category="homeopathic"
            conditions={homeopathic}
            onAdd={openCreate}
            onEdit={openEdit}
            onDelete={(id) => deleteCondition.mutate(id)}
          />
          <ConditionsSection
            title="Physiotherapy Diseases"
            category="physiotherapy"
            conditions={physiotherapy}
            onAdd={openCreate}
            onEdit={openEdit}
            onDelete={(id) => deleteCondition.mutate(id)}
          />
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editing ? "Edit" : "Add"} {categoryLabels[sectionCategory]} Disease
            </DialogTitle>
            <DialogDescription>Configure the disease details</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-foreground">Title</label>
              <Input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
              />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground">Description</label>
              <Textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground">Display Order</label>
              <Input
                type="number"
                value={form.sort_order}
                onChange={(e) => setForm({ ...form, sort_order: +e.target.value })}
              />
            </div>
            <div className="flex items-center justify-between rounded-xl border border-border px-4 py-3">
              <div>
                <div className="text-sm font-medium text-foreground">Visible</div>
                <div className="text-xs text-muted-foreground">
                  Show this disease on the public site
                </div>
              </div>
              <Switch
                checked={form.is_active}
                onCheckedChange={(v) => setForm({ ...form, is_active: v })}
              />
            </div>
          </div>
          <DialogFooter className="shrink-0 -mx-6 -mb-6 gap-2 border-t bg-background px-6 py-4 sm:space-x-0">
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </DialogClose>
            <Button
              onClick={handleSave}
              disabled={createCondition.isPending || updateCondition.isPending}
            >
              {editing ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
