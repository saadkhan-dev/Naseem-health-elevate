import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Plus, Loader2, Pencil, Trash2, Play } from "lucide-react";
import { useAdminVideos, useCreateVideo, useUpdateVideo, useDeleteVideo } from "@/hooks/queries/useContent";
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
} from "@/components/ui/dialog";
import type { Video } from "@/lib/video-content";

export const Route = createFileRoute("/admin/videos")({
  component: AdminVideos,
});

const emptyForm = { title: "", description: "", thumbnail_url: "", video_url: "", duration: "" };

function AdminVideos() {
  const { data: videos, isLoading } = useAdminVideos();
  const createVideo = useCreateVideo();
  const updateVideo = useUpdateVideo();
  const deleteVideo = useDeleteVideo();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Video | null>(null);
  const [form, setForm] = useState(emptyForm);

  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
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
    });
    setDialogOpen(true);
  }

  async function handleSave() {
    if (editing) {
      await updateVideo.mutateAsync({ id: editing.id, data: form });
    } else {
      await createVideo.mutateAsync(form);
    }
    setDialogOpen(false);
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Videos</h1>
          <p className="mt-1 text-sm text-muted-foreground">Manage health awareness videos</p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="mr-1 h-4 w-4" /> Add Video
        </Button>
      </div>

      <div className="mt-6 space-y-3">
        {isLoading ? (
          <div className="flex justify-center p-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : videos?.length === 0 ? (
          <p className="p-8 text-center text-sm text-muted-foreground">No videos yet</p>
        ) : (
          videos?.map((v) => (
            <div key={v.id} className="flex items-center justify-between rounded-xl border bg-card px-5 py-4">
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
                <Button size="sm" variant="ghost" className="text-red-600" onClick={() => deleteVideo.mutate(v.id)}>
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
              <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground">Description</label>
              <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-foreground">Thumbnail URL</label>
                <Input value={form.thumbnail_url} onChange={(e) => setForm({ ...form, thumbnail_url: e.target.value })} />
              </div>
              <div>
                <label className="text-sm font-medium text-foreground">Video URL (YouTube)</label>
                <Input value={form.video_url} onChange={(e) => setForm({ ...form, video_url: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-foreground">Duration (e.g. 06:45)</label>
                <Input value={form.duration} onChange={(e) => setForm({ ...form, duration: e.target.value })} />
              </div>
            </div>
            <Button onClick={handleSave} className="w-full" disabled={createVideo.isPending || updateVideo.isPending}>
              {editing ? "Update" : "Create"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
