import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Plus, Loader2, Pencil, Trash2, Play } from "lucide-react";
import {
  useAdminVideos,
  useCreateVideo,
  useUpdateVideo,
  useDeleteVideo,
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
import type { Video } from "@/lib/video-content";
import { QueryError } from "@/components/admin/QueryError";

export const Route = createFileRoute("/admin/videos")({
  component: AdminVideos,
});

const emptyForm = {
  title: "",
  description: "",
  thumbnail_url: "",
  video_url: "",
  duration: "",
  is_published: false,
};

function AdminVideos() {
  const { data: videos, isLoading, isError, error } = useAdminVideos();
  const createVideo = useCreateVideo();
  const updateVideo = useUpdateVideo();
  const deleteVideo = useDeleteVideo();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Video | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [listError, setListError] = useState<string | null>(null);

  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
    setSaveError(null);
    setDialogOpen(true);
  }

  function openEdit(v: Video) {
    setEditing(v);
    setForm({
      title: v.title,
      description: v.description ?? "",
      thumbnail_url: v.thumbnail_url ?? "",
      video_url: v.video_url ?? "",
      duration: v.duration ?? "",
      is_published: v.is_published,
    });
    setSaveError(null);
    setDialogOpen(true);
  }

  async function handleSave() {
    const result = editing
      ? await updateVideo.mutateAsync({ id: editing.id, data: form })
      : await createVideo.mutateAsync(form);
    if (result.error) {
      setSaveError(result.error);
      return;
    }
    setSaveError(null);
    setDialogOpen(false);
  }

  async function handleDelete(id: string) {
    const result = await deleteVideo.mutateAsync(id);
    if (result.error) setListError(result.error);
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Videos</h1>
          <p className="mt-1 text-sm text-muted-foreground">Manage health awareness videos</p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4" /> Add Video
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
        ) : videos?.length === 0 ? (
          <p className="p-8 text-center text-sm text-muted-foreground">No videos yet</p>
        ) : (
          videos?.map((v) => (
            <div
              key={v.id}
              className="flex items-center justify-between rounded-xl border bg-card px-5 py-4"
            >
              <div className="flex items-center gap-4">
                {v.thumbnail_url ? (
                  <img src={v.thumbnail_url} alt="" className="h-14 w-20 rounded-lg object-cover" />
                ) : (
                  <div className="flex h-14 w-20 items-center justify-center rounded-lg bg-muted">
                    <Play className="h-5 w-5 text-muted-foreground" />
                  </div>
                )}
                <div>
                  <div className="font-medium text-foreground">{v.title}</div>
                  <div className="text-xs text-muted-foreground">
                    {v.duration && `${v.duration} — `}
                    {v.is_published ? "Published" : "Draft"}
                  </div>
                </div>
              </div>
              <div className="flex gap-1">
                <Button size="sm" variant="ghost" onClick={() => openEdit(v)}>
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-red-600"
                  onClick={() => handleDelete(v.id)}
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
            <DialogTitle>{editing ? "Edit Video" : "Add Video"}</DialogTitle>
            <DialogDescription>Configure video details</DialogDescription>
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
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-foreground">Thumbnail URL</label>
                <Input
                  value={form.thumbnail_url}
                  onChange={(e) => setForm({ ...form, thumbnail_url: e.target.value })}
                />
              </div>
              <div>
                <label className="text-sm font-medium text-foreground">Video URL (YouTube)</label>
                <Input
                  value={form.video_url}
                  onChange={(e) => setForm({ ...form, video_url: e.target.value })}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-foreground">Duration (e.g. 06:45)</label>
                <Input
                  value={form.duration}
                  onChange={(e) => setForm({ ...form, duration: e.target.value })}
                />
              </div>
            </div>
            <div className="flex items-center justify-between rounded-xl border border-border px-4 py-3">
              <div>
                <div className="text-sm font-medium text-foreground">Published</div>
                <div className="text-xs text-muted-foreground">
                  Show this video on the public site
                </div>
              </div>
              <Switch
                checked={form.is_published}
                onCheckedChange={(v) => setForm({ ...form, is_published: v })}
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
            <Button onClick={handleSave} disabled={createVideo.isPending || updateVideo.isPending}>
              {editing ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
