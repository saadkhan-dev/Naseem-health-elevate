import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { format } from "date-fns";
import {
  Loader2,
  Save,
  Plus,
  Pencil,
  Trash2,
  CalendarPlus,
  Sparkles,
  CalendarClock,
  Repeat,
} from "lucide-react";
import {
  useAdminAvailability,
  useUpdateAvailability,
  useAdminCustomAvailability,
  useCreateCustomAvailability,
  useUpdateCustomAvailability,
  useDeleteCustomAvailability,
  useAdminRecurringAvailability,
  useCreateRecurringAvailability,
  useUpdateRecurringAvailability,
  useDeleteRecurringAvailability,
  useStaffMembers,
} from "@/hooks/queries/useAdmin";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
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
import {
  formatTimeDisplay,
  type CustomAvailabilitySlot,
  type RecurringAvailabilitySlot,
} from "@/lib/bookings";
import { toMinutes } from "@/lib/clinic";

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export const Route = createFileRoute("/admin/availability")({
  component: AdminAvailability,
});

interface CustomSlotForm {
  id: string | null;
  date: string;
  startTime: string;
  endTime: string;
  doctorId: string;
  notes: string;
  isAvailable: boolean;
}

const EMPTY_FORM: CustomSlotForm = {
  id: null,
  date: "",
  startTime: "",
  endTime: "",
  doctorId: "",
  notes: "",
  isAvailable: true,
};

interface RecurringSlotForm {
  id: string | null;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  doctorId: string;
  notes: string;
  isAvailable: boolean;
}

const EMPTY_RECURRING_FORM: RecurringSlotForm = {
  id: null,
  dayOfWeek: 1,
  startTime: "",
  endTime: "",
  doctorId: "",
  notes: "",
  isAvailable: true,
};

/** Select sentinel for "no specific provider (clinic-wide)" — Radix Select
 *  mangles an empty-string item value in some versions, so we map it. */
const NO_PROVIDER = "__clinic_wide__";

function AdminAvailability() {
  const { data: slots, isLoading, isError, error } = useAdminAvailability();
  const updateAvail = useUpdateAvailability();
  const { data: customSlots, isLoading: customSlotsLoading } = useAdminCustomAvailability();
  const { data: recurringSlots, isLoading: recurringSlotsLoading } =
    useAdminRecurringAvailability();
  const { data: staff, isLoading: staffLoading } = useStaffMembers();
  const createCustom = useCreateCustomAvailability();
  const updateCustom = useUpdateCustomAvailability();
  const deleteCustom = useDeleteCustomAvailability();
  const createRecurring = useCreateRecurringAvailability();
  const updateRecurring = useUpdateRecurringAvailability();
  const deleteRecurring = useDeleteRecurringAvailability();
  const [editState, setEditState] = useState<
    Record<string, { start_time: string; end_time: string }>
  >({});
  const [message, setMessage] = useState("");
  const [customMessage, setCustomMessage] = useState("");
  const [customForm, setCustomForm] = useState<CustomSlotForm>(EMPTY_FORM);
  const [recurringMessage, setRecurringMessage] = useState("");
  const [recurringForm, setRecurringForm] = useState<RecurringSlotForm>(EMPTY_RECURRING_FORM);

  if (isLoading) {
    return (
      <div className="flex justify-center p-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const weekSlots = DAY_NAMES.map((_, i) => slots?.find((s) => s.day_of_week === i));
  const staffName = (id: string) => staff?.find((s) => s.id === id)?.full_name ?? "Provider";

  // Upcoming custom slots first (same order patients see), then past ones.
  const sortedCustom = [...(customSlots ?? [])].sort((a, b) => {
    if (a.specific_date !== b.specific_date) {
      return a.specific_date < b.specific_date ? -1 : 1;
    }
    return a.start_time < b.start_time ? -1 : 1;
  });

  async function handleToggle(day: number, current: boolean) {
    const slot = slots?.find((s) => s.day_of_week === day);
    if (!slot) return;
    setMessage("");
    const result = await updateAvail.mutateAsync({
      id: slot.id,
      data: { is_available: !current },
    });
    if (result.error) setMessage(result.error);
  }

  async function handleSave(day: number, id: string) {
    const state = editState[id];
    if (!state) return;
    setMessage("");
    const result = await updateAvail.mutateAsync({
      id,
      data: { start_time: state.start_time, end_time: state.end_time },
    });
    if (result.error) {
      setMessage(result.error);
      return;
    }
    setEditState((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }

  // ---- Extra / custom availability ----

  /** Mirrors the server check: same date + same doctor scope + overlap. */
  function conflictWithExisting(form: CustomSlotForm): string | null {
    if (toMinutes(form.endTime) <= toMinutes(form.startTime)) {
      return "End time must be after the start time.";
    }
    const candidateDoctor = form.doctorId || null;
    const clash = (customSlots ?? []).some((slot) => {
      if (form.id && slot.id === form.id) return false;
      if (slot.specific_date !== form.date) return false;
      if ((slot.doctor_id ?? null) !== candidateDoctor) return false;
      return (
        toMinutes(form.startTime) < toMinutes(slot.end_time) &&
        toMinutes(slot.start_time) < toMinutes(form.endTime)
      );
    });
    if (clash) {
      return "That time overlaps another extra slot for the same date and provider. Pick a different time.";
    }
    return null;
  }

  async function handleCustomSubmit() {
    setCustomMessage("");
    if (!customForm.date) {
      setCustomMessage("Please pick a date for the extra slot.");
      return;
    }
    if (!customForm.startTime || !customForm.endTime) {
      setCustomMessage("Please choose a start and end time.");
      return;
    }
    const conflict = conflictWithExisting(customForm);
    if (conflict) {
      setCustomMessage(conflict);
      return;
    }

    const payload = {
      doctor_id: customForm.doctorId || null,
      specific_date: customForm.date,
      start_time: customForm.startTime,
      end_time: customForm.endTime,
      is_available: customForm.isAvailable,
      notes: customForm.notes.trim() || null,
    };

    let result;
    if (customForm.id) {
      result = await updateCustom.mutateAsync({ id: customForm.id, data: payload });
    } else {
      result = await createCustom.mutateAsync(payload);
    }
    if (result.error) {
      setCustomMessage(result.error);
      return;
    }
    setCustomForm(EMPTY_FORM);
  }

  function startEdit(slot: CustomAvailabilitySlot) {
    setCustomMessage("");
    setCustomForm({
      id: slot.id,
      date: slot.specific_date,
      startTime: slot.start_time.slice(0, 5),
      endTime: slot.end_time.slice(0, 5),
      doctorId: slot.doctor_id ?? "",
      notes: slot.notes ?? "",
      isAvailable: slot.is_available,
    });
  }

  async function handleCustomToggle(slot: CustomAvailabilitySlot, current: boolean) {
    setCustomMessage("");
    const result = await updateCustom.mutateAsync({
      id: slot.id,
      data: { is_available: !current },
    });
    if (result.error) setCustomMessage(result.error);
  }

  async function handleCustomDelete(slot: CustomAvailabilitySlot) {
    setCustomMessage("");
    if (!window.confirm("Delete this extra availability slot?")) return;
    const result = await deleteCustom.mutateAsync(slot.id);
    if (result.error) setCustomMessage(result.error);
  }

  const customBusy = createCustom.isPending || updateCustom.isPending || deleteCustom.isPending;

  // ---- Recurring (weekly) extra availability ----

  /** Mirrors the server check: same weekday + same doctor scope + overlap. */
  function conflictWithRecurring(form: RecurringSlotForm): string | null {
    if (toMinutes(form.endTime) <= toMinutes(form.startTime)) {
      return "End time must be after the start time.";
    }
    const candidateDoctor = form.doctorId || null;
    const clash = (recurringSlots ?? []).some((slot) => {
      if (form.id && slot.id === form.id) return false;
      if (slot.day_of_week !== form.dayOfWeek) return false;
      if ((slot.doctor_id ?? null) !== candidateDoctor) return false;
      return (
        toMinutes(form.startTime) < toMinutes(slot.end_time) &&
        toMinutes(slot.start_time) < toMinutes(form.endTime)
      );
    });
    if (clash) {
      return "That time overlaps another recurring slot for the same weekday and provider. Pick a different time.";
    }
    return null;
  }

  async function handleRecurringSubmit() {
    setRecurringMessage("");
    if (!recurringForm.startTime || !recurringForm.endTime) {
      setRecurringMessage("Please choose a start and end time.");
      return;
    }
    const conflict = conflictWithRecurring(recurringForm);
    if (conflict) {
      setRecurringMessage(conflict);
      return;
    }

    const payload = {
      doctor_id: recurringForm.doctorId || null,
      day_of_week: recurringForm.dayOfWeek,
      start_time: recurringForm.startTime,
      end_time: recurringForm.endTime,
      is_available: recurringForm.isAvailable,
      notes: recurringForm.notes.trim() || null,
    };

    const result = recurringForm.id
      ? await updateRecurring.mutateAsync({ id: recurringForm.id, data: payload })
      : await createRecurring.mutateAsync(payload);
    if (result.error) {
      setRecurringMessage(result.error);
      return;
    }
    setRecurringForm(EMPTY_RECURRING_FORM);
  }

  function startRecurringEdit(slot: RecurringAvailabilitySlot) {
    setRecurringMessage("");
    setRecurringForm({
      id: slot.id,
      dayOfWeek: slot.day_of_week,
      startTime: slot.start_time.slice(0, 5),
      endTime: slot.end_time.slice(0, 5),
      doctorId: slot.doctor_id ?? "",
      notes: slot.notes ?? "",
      isAvailable: slot.is_available,
    });
  }

  async function handleRecurringToggle(slot: RecurringAvailabilitySlot, current: boolean) {
    setRecurringMessage("");
    const result = await updateRecurring.mutateAsync({
      id: slot.id,
      data: { is_available: !current },
    });
    if (result.error) setRecurringMessage(result.error);
  }

  async function handleRecurringDelete(slot: RecurringAvailabilitySlot) {
    setRecurringMessage("");
    if (!window.confirm("Delete this recurring weekly slot? Future dates will no longer offer it."))
      return;
    const result = await deleteRecurring.mutateAsync(slot.id);
    if (result.error) setRecurringMessage(result.error);
  }

  const recurringBusy =
    createRecurring.isPending || updateRecurring.isPending || deleteRecurring.isPending;

  return (
    <div>
      <h1 className="text-2xl font-semibold text-foreground">Availability</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Manage your regular weekly hours, plus recurring weekly extra slots and one-time slots for
        specific dates.
      </p>

      {isError && (
        <div className="mt-4">
          <QueryError error={error} />
        </div>
      )}

      {message && (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {message}
        </div>
      )}

      {customMessage && (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {customMessage}
        </div>
      )}

      {recurringMessage && (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {recurringMessage}
        </div>
      )}

      {/* ============ Regular / weekly availability ============ */}
      <section className="mt-6 rounded-2xl border border-border bg-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-semibold text-foreground">Regular Weekly Availability</h2>
              <Badge variant="secondary" className="gap-1">
                <CalendarClock className="h-3 w-3" />
                Regular Weekly
              </Badge>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Clinic hours that apply every week, unchanged. Use the sections below for recurring
              and one-time extras.
            </p>
          </div>
        </div>

        <div className="mt-5 space-y-3">
          {DAY_NAMES.map((dayName, day) => {
            const slot = weekSlots[day];
            return (
              <div
                key={day}
                className="flex flex-wrap items-center gap-3 rounded-xl border bg-card px-5 py-4 sm:gap-4"
              >
                <Switch
                  checked={slot?.is_available ?? false}
                  onCheckedChange={() => handleToggle(day, slot?.is_available ?? false)}
                  disabled={updateAvail.isPending}
                />
                <div className="w-20 text-sm font-medium text-foreground sm:w-28">{dayName}</div>
                {slot?.is_available ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <Input
                      type="time"
                      value={editState[slot.id]?.start_time ?? slot.start_time}
                      className="h-9 w-32 text-sm"
                      onChange={(e) =>
                        setEditState((prev) => ({
                          ...prev,
                          [slot.id]: { ...prev[slot.id], start_time: e.target.value },
                        }))
                      }
                    />
                    <span className="text-sm text-muted-foreground">to</span>
                    <Input
                      type="time"
                      value={editState[slot.id]?.end_time ?? slot.end_time}
                      className="h-9 w-32 text-sm"
                      onChange={(e) =>
                        setEditState((prev) => ({
                          ...prev,
                          [slot.id]: { ...prev[slot.id], end_time: e.target.value },
                        }))
                      }
                    />
                    {editState[slot.id] && (
                      <Button
                        size="sm"
                        onClick={() => handleSave(day, slot.id)}
                        disabled={updateAvail.isPending}
                        className="h-9"
                      >
                        <Save className="h-3 w-3" />
                        Save
                      </Button>
                    )}
                  </div>
                ) : (
                  <span className="text-sm text-muted-foreground">Closed</span>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* ============ Recurring (weekly) extra availability ============ */}
      <section className="mt-6 rounded-2xl border border-border bg-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-semibold text-foreground">Recurring Extra Slot</h2>
              <Badge variant="secondary" className="gap-1">
                <Repeat className="h-3 w-3" />
                Repeats every week
              </Badge>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Open the same time window every week without adding it manually each time — e.g.
              Monday 5:00 PM–7:00 PM. Every future matching weekday offers it on patient booking;
              editing or deleting it only changes future availability (existing appointments are
              never touched).
            </p>
          </div>
        </div>

        {/* Add / edit form */}
        <div className="mt-5 rounded-xl border border-border bg-card p-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
            {recurringForm.id ? (
              <Pencil className="h-4 w-4 text-primary" />
            ) : (
              <Repeat className="h-4 w-4 text-primary" />
            )}
            {recurringForm.id ? "Edit Recurring Slot" : "Add a Recurring Slot"}
          </div>

          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                Weekday <span className="text-destructive">*</span>
              </label>
              <Select
                value={String(recurringForm.dayOfWeek)}
                onValueChange={(v) =>
                  setRecurringForm((prev) => ({ ...prev, dayOfWeek: Number(v) }))
                }
              >
                <SelectTrigger className="h-9 w-full text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DAY_NAMES.map((name, i) => (
                    <SelectItem key={name} value={String(i)}>
                      {name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                Provider <span className="text-muted-foreground/70">(optional — clinic-wide)</span>
              </label>
              <Select
                value={recurringForm.doctorId || NO_PROVIDER}
                onValueChange={(v) =>
                  setRecurringForm((prev) => ({
                    ...prev,
                    doctorId: v === NO_PROVIDER ? "" : v,
                  }))
                }
                disabled={staffLoading}
              >
                <SelectTrigger className="h-9 w-full text-sm">
                  <SelectValue
                    placeholder={staffLoading ? "Loading..." : "No specific provider (clinic-wide)"}
                  />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_PROVIDER}>No specific provider (clinic-wide)</SelectItem>
                  {(staff ?? []).map((member) => (
                    <SelectItem key={member.id} value={member.id}>
                      {member.full_name || "Provider"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                Start Time <span className="text-destructive">*</span>
              </label>
              <Input
                type="time"
                value={recurringForm.startTime}
                onChange={(e) =>
                  setRecurringForm((prev) => ({ ...prev, startTime: e.target.value }))
                }
                className="h-9 w-full text-sm"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                End Time <span className="text-destructive">*</span>
              </label>
              <Input
                type="time"
                value={recurringForm.endTime}
                onChange={(e) => setRecurringForm((prev) => ({ ...prev, endTime: e.target.value }))}
                className="h-9 w-full text-sm"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                Notes <span className="text-muted-foreground/70">(optional)</span>
              </label>
              <Input
                value={recurringForm.notes}
                onChange={(e) => setRecurringForm((prev) => ({ ...prev, notes: e.target.value }))}
                placeholder="e.g. Every Monday evening clinic"
                className="h-9 w-full text-sm"
              />
            </div>

            <div className="flex flex-wrap items-center gap-4 sm:col-span-2">
              <label className="flex items-center gap-2 text-sm text-foreground">
                <span className="text-xs font-medium text-muted-foreground">Active</span>
                <Switch
                  checked={recurringForm.isAvailable}
                  onCheckedChange={(v) => setRecurringForm((prev) => ({ ...prev, isAvailable: v }))}
                />
              </label>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  size="sm"
                  onClick={handleRecurringSubmit}
                  disabled={recurringBusy}
                  className="h-9"
                >
                  {recurringBusy ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : recurringForm.id ? (
                    <Save className="h-3 w-3" />
                  ) : (
                    <Plus className="h-3 w-3" />
                  )}
                  {recurringForm.id ? "Save Changes" : "Add Recurring Slot"}
                </Button>
                {recurringForm.id && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-9"
                    onClick={() => {
                      setRecurringForm(EMPTY_RECURRING_FORM);
                      setRecurringMessage("");
                    }}
                  >
                    Cancel
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* List of recurring slots */}
        <div className="mt-5">
          <div className="text-sm font-semibold text-foreground">
            Existing Recurring Slots
            {recurringSlotsLoading && (
              <Loader2 className="ml-2 inline h-3.5 w-3.5 animate-spin text-muted-foreground" />
            )}
          </div>

          {!recurringSlotsLoading && (recurringSlots?.length ?? 0) === 0 ? (
            <p className="mt-3 rounded-lg border border-dashed border-border bg-background/60 px-4 py-5 text-center text-sm text-muted-foreground">
              No recurring slots yet. Add one above to open the same weekday window every week.
            </p>
          ) : (
            <div className="mt-3 space-y-2">
              {(recurringSlots ?? []).map((slot) => (
                <div
                  key={slot.id}
                  className="flex flex-wrap items-center gap-3 rounded-xl border bg-card px-4 py-3"
                >
                  <Switch
                    checked={slot.is_available}
                    onCheckedChange={() => handleRecurringToggle(slot, slot.is_available)}
                    disabled={recurringBusy}
                  />
                  <div className="min-w-[150px]">
                    <div className="text-sm font-semibold text-foreground">
                      Every {DAY_NAMES[slot.day_of_week] ?? "—"}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {formatTimeDisplay(slot.start_time)} – {formatTimeDisplay(slot.end_time)}
                    </div>
                  </div>
                  <Badge variant="secondary" className="gap-1">
                    <Repeat className="h-3 w-3" /> Recurring Extra Slot
                  </Badge>
                  <div className="min-w-[120px] text-sm text-muted-foreground">
                    {slot.doctor_id ? staffName(slot.doctor_id) : "Clinic-wide"}
                  </div>
                  {slot.notes && (
                    <div className="min-w-[120px] max-w-[200px] text-xs text-muted-foreground">
                      {slot.notes}
                    </div>
                  )}
                  <div className="ml-auto flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8"
                      onClick={() => startRecurringEdit(slot)}
                      disabled={recurringBusy}
                    >
                      <Pencil className="h-3 w-3" />
                      Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 text-destructive hover:text-destructive"
                      onClick={() => handleRecurringDelete(slot)}
                      disabled={recurringBusy}
                    >
                      <Trash2 className="h-3 w-3" />
                      Delete
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ============ One-time extra availability (specific date) ============ */}
      <section className="mt-6 rounded-2xl border border-primary/25 bg-primary-soft/40 p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-semibold text-foreground">Extra / Custom Availability</h2>
              <Badge variant="secondary" className="gap-1">
                <Sparkles className="h-3 w-3" />
                One-Time Extra Slot
              </Badge>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Add an extra slot for one specific date without changing the regular schedule — e.g. a
              special Sunday clinic, or a second provider&apos;s extra hours. These appear live on
              patient booking.
            </p>
          </div>
        </div>

        {/* Add / edit form */}
        <div className="mt-5 rounded-xl border border-border bg-card p-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
            {customForm.id ? (
              <Pencil className="h-4 w-4 text-primary" />
            ) : (
              <CalendarPlus className="h-4 w-4 text-primary" />
            )}
            {customForm.id ? "Edit Extra Slot" : "Add an Extra Slot"}
          </div>

          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                Date <span className="text-destructive">*</span>
              </label>
              <Input
                type="date"
                value={customForm.date}
                min={new Date().toISOString().split("T")[0]}
                onChange={(e) => setCustomForm((prev) => ({ ...prev, date: e.target.value }))}
                className="h-9 w-full sm:w-56"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                Start Time <span className="text-destructive">*</span>
              </label>
              <Input
                type="time"
                value={customForm.startTime}
                onChange={(e) => setCustomForm((prev) => ({ ...prev, startTime: e.target.value }))}
                className="h-9 w-full text-sm"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                End Time <span className="text-destructive">*</span>
              </label>
              <Input
                type="time"
                value={customForm.endTime}
                onChange={(e) => setCustomForm((prev) => ({ ...prev, endTime: e.target.value }))}
                className="h-9 w-full text-sm"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                Provider{" "}
                <span className="text-muted-foreground/70">
                  (optional — leave empty for clinic-wide)
                </span>
              </label>
              <Select
                value={customForm.doctorId || NO_PROVIDER}
                onValueChange={(v) =>
                  setCustomForm((prev) => ({
                    ...prev,
                    doctorId: v === NO_PROVIDER ? "" : v,
                  }))
                }
                disabled={staffLoading}
              >
                <SelectTrigger className="h-9 w-full sm:w-72 text-sm">
                  <SelectValue
                    placeholder={staffLoading ? "Loading..." : "No specific provider (clinic-wide)"}
                  />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_PROVIDER}>No specific provider (clinic-wide)</SelectItem>
                  {(staff ?? []).map((member) => (
                    <SelectItem key={member.id} value={member.id}>
                      {member.full_name || "Provider"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="sm:col-span-2">
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                Notes <span className="text-muted-foreground/70">(optional)</span>
              </label>
              <Input
                value={customForm.notes}
                onChange={(e) => setCustomForm((prev) => ({ ...prev, notes: e.target.value }))}
                placeholder="e.g. Special Sunday clinic"
                className="h-9 w-full text-sm"
              />
            </div>

            <div className="flex flex-wrap items-center gap-4 sm:col-span-2">
              <label className="flex items-center gap-2 text-sm text-foreground">
                <span className="text-xs font-medium text-muted-foreground">Active</span>
                <Switch
                  checked={customForm.isAvailable}
                  onCheckedChange={(v) => setCustomForm((prev) => ({ ...prev, isAvailable: v }))}
                />
              </label>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  size="sm"
                  onClick={handleCustomSubmit}
                  disabled={customBusy}
                  className="h-9"
                >
                  {customBusy ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : customForm.id ? (
                    <Save className="h-3 w-3" />
                  ) : (
                    <Plus className="h-3 w-3" />
                  )}
                  {customForm.id ? "Save Changes" : "Add Extra Slot"}
                </Button>
                {customForm.id && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-9"
                    onClick={() => {
                      setCustomForm(EMPTY_FORM);
                      setCustomMessage("");
                    }}
                  >
                    Cancel
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* List of custom slots */}
        <div className="mt-5">
          <div className="text-sm font-semibold text-foreground">
            Existing Extra Slots
            {customSlotsLoading && (
              <Loader2 className="ml-2 inline h-3.5 w-3.5 animate-spin text-muted-foreground" />
            )}
          </div>

          {!customSlotsLoading && (customSlots?.length ?? 0) === 0 ? (
            <p className="mt-3 rounded-lg border border-dashed border-border bg-background/60 px-4 py-5 text-center text-sm text-muted-foreground">
              No extra slots yet. Add one above to open a specific date or time window.
            </p>
          ) : (
            <div className="mt-3 space-y-2">
              {sortedCustom.map((slot) => (
                <div
                  key={slot.id}
                  className="flex flex-wrap items-center gap-3 rounded-xl border bg-card px-4 py-3"
                >
                  <Switch
                    checked={slot.is_available}
                    onCheckedChange={() => handleCustomToggle(slot, slot.is_available)}
                    disabled={customBusy}
                  />
                  <div className="min-w-[120px]">
                    <div className="text-sm font-semibold text-foreground">
                      {format(new Date(slot.specific_date + "T00:00:00"), "EEE, MMM d, yyyy")}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {formatTimeDisplay(slot.start_time)} – {formatTimeDisplay(slot.end_time)}
                    </div>
                  </div>
                  <div className="min-w-[120px] text-sm text-muted-foreground">
                    {slot.doctor_id ? staffName(slot.doctor_id) : "Clinic-wide"}
                  </div>
                  {slot.notes && (
                    <div className="min-w-[120px] max-w-[200px] text-xs text-muted-foreground">
                      {slot.notes}
                    </div>
                  )}
                  <div className="ml-auto flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8"
                      onClick={() => startEdit(slot)}
                      disabled={customBusy}
                    >
                      <Pencil className="h-3 w-3" />
                      Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 text-destructive hover:text-destructive"
                      onClick={() => handleCustomDelete(slot)}
                      disabled={customBusy}
                    >
                      <Trash2 className="h-3 w-3" />
                      Delete
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
