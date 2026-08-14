import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { format } from "date-fns";
import { Loader2, Plus, Bell, BellOff, Send, Trash2 } from "lucide-react";
import {
  useAdminReminders,
  useCreateReminder,
  useCancelReminder,
  useSendDueReminders,
} from "@/hooks/queries/useAdminExtra";
import { useAppointments } from "@/hooks/queries/useAdmin";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { QueryError } from "@/components/admin/QueryError";

export const Route = createFileRoute("/admin/reminders")({
  component: AdminReminders,
});

const statusStyles: Record<string, string> = {
  scheduled: "bg-blue-100 text-blue-700",
  sent: "bg-green-100 text-green-700",
  failed: "bg-red-100 text-red-700",
  cancelled: "bg-gray-200 text-gray-700",
};

function AdminReminders() {
  const { data: reminders, isLoading, isError, error } = useAdminReminders();
  const { data: appointments } = useAppointments();
  const createReminder = useCreateReminder();
  const cancelReminder = useCancelReminder();
  const sendDue = useSendDueReminders();

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    appointmentId: "",
    channel: "email" as "email" | "sms" | "whatsapp",
    remindOn: "",
    remindAt: "",
  });
  const [message, setMessage] = useState("");
  const [pageError, setPageError] = useState("");

  async function handleCreate() {
    setMessage("");
    if (!form.appointmentId || !form.remindOn || !form.remindAt) {
      setMessage("Select an appointment and a reminder time.");
      return;
    }
    const result = await createReminder.mutateAsync(form);
    setMessage(result.error ?? "Reminder scheduled.");
    if (!result.error) {
      setForm({ appointmentId: "", channel: "email", remindOn: "", remindAt: "" });
      setShowForm(false);
    }
  }

  async function handleCancel(id: string) {
    setPageError("");
    const result = await cancelReminder.mutateAsync(id);
    if (result.error) setPageError(result.error);
  }

  async function handleSendDue() {
    setPageError("");
    await sendDue.mutateAsync();
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Appointment Reminders</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Schedule email / SMS reminders for appointments
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleSendDue} disabled={sendDue.isPending}>
            {sendDue.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            Send due now
          </Button>
          <Button onClick={() => setShowForm((v) => !v)}>
            <Plus className="h-4 w-4" /> Add Reminder
          </Button>
        </div>
      </div>

      {isError && (
        <div className="mt-4">
          <QueryError error={error} />
        </div>
      )}

      {pageError && (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {pageError}
        </div>
      )}

      {sendDue.isSuccess && (
        <div className="mt-3 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
          Processed {sendDue.data.processed} reminder(s), sent {sendDue.data.sent}, failed{" "}
          {sendDue.data.failed}.
        </div>
      )}

      {showForm && (
        <div className="mt-4 rounded-xl border border-border bg-card p-5">
          <div className="text-sm font-semibold text-foreground">New reminder</div>
          <div className="mt-3 grid gap-2 sm:grid-cols-4">
            <Select
              value={form.appointmentId}
              onValueChange={(v) => setForm({ ...form, appointmentId: v })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Appointment" />
              </SelectTrigger>
              <SelectContent>
                {(appointments ?? [])
                  .filter((a) => a.status === "confirmed")
                  .map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.patient_name ?? "Patient"} — {a.date}
                      {a.time ? ` ${a.time.slice(0, 5)}` : ""}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
            <Select
              value={form.channel}
              onValueChange={(v) => setForm({ ...form, channel: v as never })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {["email", "sms", "whatsapp"].map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              type="date"
              value={form.remindOn}
              onChange={(e) => setForm({ ...form, remindOn: e.target.value })}
            />
            <Input
              type="time"
              value={form.remindAt}
              onChange={(e) => setForm({ ...form, remindAt: e.target.value })}
            />
          </div>
          {message && <p className="mt-2 text-sm font-medium text-primary">{message}</p>}
          <Button
            onClick={handleCreate}
            disabled={createReminder.isPending}
            className="mt-3 h-9 text-xs"
            size="sm"
          >
            <Bell className="h-3.5 w-3.5" /> Schedule
          </Button>
        </div>
      )}

      <div className="mt-6 space-y-2">
        {isLoading ? (
          <div className="flex justify-center p-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (reminders ?? []).length === 0 ? (
          <p className="p-8 text-center text-sm text-muted-foreground">No reminders yet</p>
        ) : (
          (reminders ?? []).map((r) => (
            <div
              key={r.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card px-5 py-4"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2 font-medium text-foreground">
                  <Bell className="h-4 w-4 text-primary" />
                  {r.appointments?.appointment_no ?? r.appointment_id}
                  <Badge
                    className={`capitalize ${statusStyles[r.status] ?? statusStyles.scheduled}`}
                  >
                    {r.status}
                  </Badge>
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {r.channel} · remind at {format(new Date(r.remind_at), "MMM d, yyyy h:mm a")}
                  {r.appointments?.patient_name
                    ? ` · ${r.appointments.patient_name} · ${r.appointments.date}`
                    : ""}
                </div>
                {r.error && <div className="mt-1 text-xs text-red-600">{r.error}</div>}
              </div>
              {r.status === "scheduled" && (
                <div className="flex gap-1">
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-red-600"
                    onClick={() => handleCancel(r.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Cancel
                  </Button>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
