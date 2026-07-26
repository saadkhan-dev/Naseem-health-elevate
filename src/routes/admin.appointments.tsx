import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { format } from "date-fns";
import { Check, X, Loader2, Video } from "lucide-react";
import { useAppointments, useUpdateAppointmentStatus } from "@/hooks/queries/useAdmin";
import { useCreateVideoSession, useVideoSession } from "@/hooks/queries/useVideo";
import { formatTimeDisplay } from "@/lib/bookings";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/admin/appointments")({
  component: AdminAppointments,
});

function AdminAppointments() {
  const { data: appointments, isLoading } = useAppointments();
  const updateStatus = useUpdateAppointmentStatus();
  const createVideo = useCreateVideoSession();
  const navigate = useNavigate();
  const [filter, setFilter] = useState<string>("all");
  const [videoDialog, setVideoDialog] = useState<{ appointmentId: string; roomName: string } | null>(null);
  const [callDuration, setCallDuration] = useState(20);

  const filtered = filter === "all"
    ? (appointments ?? [])
    : (appointments ?? []).filter((a) => a.status === filter);

  async function handleStartVideo(appointmentId: string) {
    const result = await createVideo.mutateAsync({ appointmentId, durationMinutes: callDuration });
    if (result.error) {
      alert(result.error);
    } else if (result.session) {
      setVideoDialog({ appointmentId, roomName: result.session.room_name });
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Appointments</h1>
          <p className="mt-1 text-sm text-muted-foreground">Manage all patient bookings</p>
        </div>
        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="confirmed">Confirmed</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="mt-6 rounded-xl border bg-card">
        {isLoading ? (
          <div className="flex justify-center p-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : filtered.length === 0 ? (
          <p className="p-8 text-center text-sm text-muted-foreground">No appointments found</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="px-4 py-3 font-medium">Patient</th>
                  <th className="px-4 py-3 font-medium">Service</th>
                  <th className="px-4 py-3 font-medium">Date</th>
                  <th className="px-4 py-3 font-medium">Time</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filtered.map((a) => (
                  <tr key={a.id} className="text-foreground">
                    <td className="px-4 py-3">
                      <div className="font-medium">{a.patient_name ?? "—"}</div>
                      {a.patient_phone && (
                        <div className="text-xs text-muted-foreground">{a.patient_phone}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{a.service_name ?? "—"}</td>
                    <td className="px-4 py-3">{a.date ? format(new Date(a.date + "T00:00:00"), "MMM d, yyyy") : "—"}</td>
                    <td className="px-4 py-3">{formatTimeDisplay(a.time)}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${
                        a.status === "confirmed" ? "bg-green-100 text-green-700" :
                        a.status === "pending" ? "bg-amber-100 text-amber-700" :
                        a.status === "cancelled" ? "bg-red-100 text-red-700" :
                        "bg-gray-100 text-gray-700"
                      }`}>
                        {a.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1">
                        {a.status === "pending" && (
                          <>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-8 w-8 p-0 text-green-600"
                              onClick={() => updateStatus.mutate({ id: a.id, status: "confirmed" })}
                              disabled={updateStatus.isPending}
                            >
                              <Check className="h-4 w-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-8 w-8 p-0 text-red-600"
                              onClick={() => updateStatus.mutate({ id: a.id, status: "cancelled" })}
                              disabled={updateStatus.isPending}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </>
                        )}
                        {a.status === "confirmed" && (
                          <div className="flex gap-1">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => updateStatus.mutate({ id: a.id, status: "completed" })}
                              disabled={updateStatus.isPending}
                            >
                              Complete
                            </Button>
                            <Button
                              size="sm"
                              variant="default"
                              onClick={() => handleStartVideo(a.id)}
                              disabled={createVideo.isPending}
                            >
                              {createVideo.isPending ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <Video className="mr-1 h-3 w-3" />
                              )}
                              Video Call
                            </Button>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Dialog open={!!videoDialog} onOpenChange={() => { setVideoDialog(null); setCallDuration(20); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Start Video Call</DialogTitle>
            <DialogDescription>
              Set the session duration, then join or share the link with the patient.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-lg border p-3">
              <label className="text-xs font-medium text-muted-foreground">Session Duration</label>
              <div className="mt-2 flex gap-2">
                {[15, 20, 30, 45, 60].map((min) => (
                  <button
                    key={min}
                    onClick={() => setCallDuration(min)}
                    className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                      callDuration === min
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground hover:bg-accent"
                    }`}
                  >
                    {min} min
                  </button>
                ))}
              </div>
            </div>
            <div className="rounded-lg bg-muted p-3">
              <label className="text-xs font-medium text-muted-foreground">Patient Join Link</label>
              <div className="mt-1 flex items-center gap-2">
                <input
                  readOnly
                  value={`${window.location.origin}/video/${videoDialog?.appointmentId}`}
                  className="flex-1 rounded border bg-background px-3 py-2 text-sm"
                  onClick={(e) => (e.target as HTMLInputElement).select()}
                />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    navigator.clipboard.writeText(
                      `${window.location.origin}/video/${videoDialog?.appointmentId}`
                    );
                  }}
                >
                  Copy
                </Button>
              </div>
            </div>
            <Button
              className="w-full"
              onClick={() => {
                window.open(
                  `/video/${videoDialog?.appointmentId}`,
                  "_blank"
                );
                setVideoDialog(null);
              }}
            >
              <Video className="mr-2 h-4 w-4" />
              Join as Doctor ({callDuration} min)
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
