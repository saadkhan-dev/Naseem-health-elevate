import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Plus, Loader2, Pencil, Trash2, Check, X } from "lucide-react";
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

const statusStyles: Record<string, string> = {
  pending: "bg-amber-100 text-amber-700",
  approved: "bg-green-100 text-green-700",
  rejected: "bg-red-100 text-red-700",
};

function AdminReviews() {
  const { data: reviews, isLoading, isError, error } = useAdminReviews();
  const createReview = useCreateReview();
  const updateReview = useUpdateReview();
  const deleteReview = useDeleteReview();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Review | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [listError, setListError] = useState<string | null>(null);

  const pendingCount = (reviews ?? []).filter((r) => r.status === "pending").length;

  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
    setSaveError(null);
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
    setSaveError(null);
    setDialogOpen(true);
  }

  async function handleSave() {
    const result = editing
      ? await updateReview.mutateAsync({ id: editing.id, data: form })
      : await createReview.mutateAsync(form);
    if (result.error) {
      setSaveError(result.error);
      return;
    }
    setSaveError(null);
    setDialogOpen(false);
  }

  async function setStatus(r: Review, status: "approved" | "rejected") {
    const result = await updateReview.mutateAsync({ id: r.id, data: { status } });
    if (result.error) setListError(result.error);
  }

  async function handleDelete(id: string) {
    const result = await deleteReview.mutateAsync(id);
    if (result.error) setListError(result.error);
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Patient Reviews</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Approve or manage reviews shown on the public site
            {pendingCount > 0 && (
              <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">
                {pendingCount} pending
              </span>
            )}
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
        ) : reviews?.length === 0 ? (
          <p className="p-8 text-center text-sm text-muted-foreground">No reviews yet</p>
        ) : (
          reviews?.map((r) => (
            <div
              key={r.id}
              className={`flex items-center justify-between rounded-xl border bg-card px-5 py-4 ${
                r.status === "pending" ? "border-amber-300" : ""
              }`}
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2 font-medium text-foreground">
                  <span>{r.name}</span>
                  <span className="text-xs font-normal text-muted-foreground">
                    {"★".repeat(r.rating)}
                  </span>
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${
                      statusStyles[r.status ?? "pending"] ?? statusStyles.pending
                    }`}
                  >
                    {r.status ?? "pending"}
                  </span>
                  {!r.is_active && r.status !== "rejected" && (
                    <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                      hidden
                    </span>
                  )}
                </div>
                <div className="mt-1 text-xs text-muted-foreground">{r.text}</div>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                {r.status === "pending" && (
                  <>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-green-600"
                      onClick={() => setStatus(r, "approved")}
                    >
                      <Check className="h-4 w-4" /> Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-red-600"
                      onClick={() => setStatus(r, "rejected")}
                    >
                      <X className="h-4 w-4" /> Reject
                    </Button>
                  </>
                )}
                <Button size="sm" variant="ghost" onClick={() => openEdit(r)}>
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-red-600"
                  onClick={() => handleDelete(r.id)}
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
          {saveError && <p className="text-sm font-medium text-destructive">{saveError}</p>}
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
