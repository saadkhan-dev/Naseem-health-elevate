import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Loader2, Save } from "lucide-react";
import { useAdminAvailability, useUpdateAvailability } from "@/hooks/queries/useAdmin";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { QueryError } from "@/components/admin/QueryError";

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export const Route = createFileRoute("/admin/availability")({
  component: AdminAvailability,
});

function AdminAvailability() {
  const { data: slots, isLoading, isError, error } = useAdminAvailability();
  const updateAvail = useUpdateAvailability();
  const [editState, setEditState] = useState<
    Record<string, { start_time: string; end_time: string }>
  >({});
  const [message, setMessage] = useState("");

  if (isLoading) {
    return (
      <div className="flex justify-center p-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const weekSlots = DAY_NAMES.map((_, i) => slots?.find((s) => s.day_of_week === i));

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

  return (
    <div>
      <h1 className="text-2xl font-semibold text-foreground">Weekly Availability</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Set your clinic hours for each day of the week
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

      <div className="mt-6 space-y-3">
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
    </div>
  );
}
