import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Loader2, Save } from "lucide-react";
import { useAdminAvailability, useUpdateAvailability } from "@/hooks/queries/useAdmin";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export const Route = createFileRoute("/admin/availability")({
  component: AdminAvailability,
});

function AdminAvailability() {
  const { data: slots, isLoading } = useAdminAvailability();
  const updateAvail = useUpdateAvailability();
  const [editState, setEditState] = useState<Record<string, { start_time: string; end_time: string }>>({});

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
    await updateAvail.mutateAsync({ id: slot.id, data: { is_available: !current } });
  }

  async function handleSave(day: number, id: string) {
    const state = editState[id];
    if (!state) return;
    await updateAvail.mutateAsync({
      id,
      data: { start_time: state.start_time, end_time: state.end_time },
    });
    setEditState((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold text-foreground">Weekly Availability</h1>
      <p className="mt-1 text-sm text-muted-foreground">Set your clinic hours for each day of the week</p>

      <div className="mt-6 space-y-3">
        {DAY_NAMES.map((dayName, day) => {
          const slot = weekSlots[day];
          return (
            <div key={day} className="flex items-center gap-4 rounded-xl border bg-card px-5 py-4">
              <Switch
                checked={slot?.is_available ?? false}
                onCheckedChange={() => handleToggle(day, slot?.is_available ?? false)}
                disabled={updateAvail.isPending}
              />
              <div className="w-28 text-sm font-medium text-foreground">{dayName}</div>
              {slot?.is_available ? (
                <div className="flex items-center gap-2">
                  <Input
                    type="time"
                    defaultValue={slot.start_time}
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
                    defaultValue={slot.end_time}
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
                      <Save className="mr-1 h-3 w-3" />
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
