import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Plus, Loader2, Pencil, Trash2 } from "lucide-react";
import {
  useAdminReviews,
  useCreateReview,
  useUpdateReview,
  useDeleteReview,
} from "@/hooks/queries/useContent";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import type { Review } from "@/lib/site-content";
import { QueryError } from "@/components/admin/QueryError";

export const Route = createFileRoute("/admin/reviews")({
  component: AdminReviews,
});

const emptyForm = { name: "", rating: 5, text: "", is_active: true };

function AdminReviews() {
  const { data: reviews, isLoading, isError, error } = useAdminReviews();
  const createReview = useCreateReview();
  const updateReview = useUpdateReview();
  const deleteReview = useDeleteReview();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Review | null>(null);
  const [form, setForm] = useState(emptyForm);

  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
    setDialogOpen(true);
  }

  function openEdit(r: Review) {
    setEditing(r);
    setForm({
      name: r.name,
      rating: r.rating,
      text: r.text,
      is_active: r.is_active,
    });
    setDialogOpen(true);
  }

  async function handleSave() {
    if (editing) {
      await updateReview.mutateAsync({ id: editing.id, data: form });
    } else {
      await createReview.mutateAsync(form);
    }
    setDialogOpen(false);
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Patient Reviews</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage reviews shown on the public site
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4" /> Add Review
        </Button>
      </div>

      {isError && (
        <div className="mt-4">
          <QueryError error={error} />
        </div>
      )}

      <div className="mt-6 space-y-3">
        {isLoading ? (
          <div className="flex justify-center p-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : reviews?.length === 0 ? (
          <p className="p-8 text-center text-sm text-muted-foreground">No reviews yet</p>
        ) : (
          reviews?.map((r) => (
            <div
              key={r.id}
              className="flex items-center justify-between rounded-xl border bg-card px-5 py-4"
            >
              <div>
                <div className="font-medium text-foreground">
                  {r.name}{" "}
                  <span className="text-xs font-normal text-muted-foreground">
                    {"★".repeat(r.rating)}
                  </span>
                </div>
                <div className="text-xs text-muted-foreground">
                  {r.text}
                  {!r.is_active && " (hidden)"}
                </div>
              </div>
              <div className="flex gap-1">
                <Button size="sm" variant="ghost" onClick={() => openEdit(r)}>
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-red-600"
                  onClick={() => deleteReview.mutate(r.id)}
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
            <DialogTitle>{editing ? "Edit Review" : "Add Review"}</DialogTitle>
            <DialogDescription>Configure the review details</DialogDescription>
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
              <label className="text-sm font-medium text-foreground">Rating</label>
              <Select
                value={String(form.rating)}
                onValueChange={(v) => setForm({ ...form, rating: +v })}
              >
                <SelectTrigger className="mt-1 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[5, 4, 3, 2, 1].map((n) => (
                    <SelectItem key={n} value={String(n)}>
                      {"★".repeat(n)} ({n})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium text-foreground">Review Text</label>
              <Textarea
                value={form.text}
                onChange={(e) => setForm({ ...form, text: e.target.value })}
              />
            </div>
            <div className="flex items-center justify-between rounded-xl border border-border px-4 py-3">
              <div>
                <div className="text-sm font-medium text-foreground">Visible</div>
                <div className="text-xs text-muted-foreground">
                  Show this review on the public site
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
              disabled={createReview.isPending || updateReview.isPending}
            >
              {editing ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
