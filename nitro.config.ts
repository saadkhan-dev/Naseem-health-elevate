import { defineConfig } from "nitro";

export default defineConfig({
  experimental: {
    tasks: true,
  },
  scheduledTasks: {
    "* * * * *": "reminders:due",
  },
  scanDirs: ["./"],
});
