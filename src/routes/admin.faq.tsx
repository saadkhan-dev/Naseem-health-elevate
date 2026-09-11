import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Plus, Loader2, Pencil, Trash2 } from "lucide-react";
import {
  useAdminFaqs,
  useCreateFaq,
  useUpdateFaq,
  useDeleteFaq,
} from "@/hooks/queries/useAdminExtra";
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
import type { Faq } from "@/lib/site-extra";
import { QueryError } from "@/components/admin/QueryError";

export const Route = createFileRoute("/admin/faq")({
  component: AdminFaqs,
});

const emptyForm = { category: "", question: "", answer: "", sort_order: 0, is_active: true };

function AdminFaqs() {
  const { data: faqs, isLoading, isError, error } = useAdminFaqs();
  const createFaq = useCreateFaq();
  const updateFaq = useUpdateFaq();
  const deleteFaq = useDeleteFaq();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Faq | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [listError, setListError] = useState<string | null>(null);

  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
    setSaveError(null);
    setDialogOpen(true);
  }

  function openEdit(f: Faq) {
    setEditing(f);
    setForm({
      category: f.category,
      question: f.question,
      answer: f.answer,
      sort_order: f.sort_order ?? 0,
      is_active: f.is_active ?? true,
    });
    setSaveError(null);
    setDialogOpen(true);
  }

  async function handleSave() {
    const result = editing
      ? await updateFaq.mutateAsync({ id: editing.id, data: form })
      : await createFaq.mutateAsync(form);
    if (result.error) {
      setSaveError(result.error);
      return;
    }
    setSaveError(null);
    setDialogOpen(false);
  }

  async function handleDelete(id: string) {
    const result = await deleteFaq.mutateAsync(id);
    if (result.error) setListError(result.error);
  }

  const grouped = (faqs ?? []).reduce<Record<string, Faq[]>>((acc, f) => {
    (acc[f.category] ??= []).push(f);
    return acc;
  }, {});

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">FAQ</h1>
          <p className="mt-1 text-sm text-muted-foreground">Manage frequently asked questions</p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4" /> Add Question
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

      <div className="mt-6 space-y-4">
        {isLoading ? (
          <div className="flex justify-center p-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (faqs ?? []).length === 0 ? (
          <p className="p-8 text-center text-sm text-muted-foreground">No FAQ entries yet</p>
        ) : (
          Object.entries(grouped).map(([category, items]) => (
            <div key={category}>
              <div className="mb-2 text-sm font-semibold capitalize text-primary">{category}</div>
              <div className="space-y-2">
                {items.map((f) => (
                  <div
                    key={f.id}
                    className={`flex items-center justify-between rounded-xl border bg-card px-5 py-4 ${
                      f.is_active ? "" : "opacity-60"
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="font-medium text-foreground">{f.question}</div>
                      <div className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                        {f.answer}
                        {!f.is_active && (
                          <span className="ml-2 rounded bg-muted px-1.5 py-0.5">hidden</span>
                        )}
                      </div>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <Button size="sm" variant="ghost" onClick={() => openEdit(f)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-red-600"
                        onClick={() => handleDelete(f.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Edit FAQ" : "Add FAQ"}</DialogTitle>
            <DialogDescription>Configure the FAQ entry</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-foreground">Category</label>
              <Input
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                placeholder="e.g. appointments, payments"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground">Question</label>
              <Input
                value={form.question}
                onChange={(e) => setForm({ ...form, question: e.target.value })}
              />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground">Answer</label>
              <Textarea
                value={form.answer}
                onChange={(e) => setForm({ ...form, answer: e.target.value })}
              />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground">Sort Order</label>
              <Input
                type="number"
                value={form.sort_order}
                onChange={(e) => setForm({ ...form, sort_order: +e.target.value || 0 })}
              />
            </div>
            <div className="flex items-center justify-between rounded-xl border border-border px-4 py-3">
              <div>
                <div className="text-sm font-medium text-foreground">Active</div>
                <div className="text-xs text-muted-foreground">Show on the public FAQ page</div>
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
            <Button onClick={handleSave} disabled={createFaq.isPending || updateFaq.isPending}>
              {editing ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
