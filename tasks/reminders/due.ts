import type { Task } from "nitro/types";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";
import { sendDueAppointmentReminders } from "@/lib/server/reminders";

/**
 * Scheduled Cloudflare Cron Trigger that sends every due appointment reminder
 * at most once.
 *
 * Runs every minute (see `scheduledTasks` in `nitro.config.ts`). The engine
 * is idempotent — each reminder is claimed atomically (`scheduled` →
 * `processing`) so concurrent/overlapping invocations cannot double-send, and
 * stale `processing` claims are recovered after 15 minutes.
 *
 * This task is executed only by the Worker `scheduled` event (there is no
 * public HTTP endpoint for it) or through Nitro's dev-only `/_nitro/tasks`
 * routes. No appointment data is ever logged.
 */
const remindersDueTask: Task = {
  meta: {
    name: "reminders:due",
    description: "Send due appointment reminders exactly once.",
  },
  run: async () => {
    try {
      const result = await sendDueAppointmentReminders(getSupabaseAdmin());
      return { result };
    } catch (error) {
      // Fail safely: never crash the cron tick, never log appointment data.

      console.error(
        "[reminders:due] run failed; reminders will be re-attempted next tick.",
        error instanceof Error ? error.message : "unknown error",
      );
      return { result: { processed: 0, sent: 0, failed: 0 } };
    }
  },
};

export default remindersDueTask;
