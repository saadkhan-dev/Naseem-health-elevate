import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  nitro: {
    preset: "cloudflare-module",
  },
  vite: {
    build: {
      chunkSizeWarningLimit: 900,
      target: "es2022",
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes("node_modules")) return;
            const norm = id.replace(/\\/g, "/");
            const rest = norm.split("node_modules/")[1] || norm;
            const firstSeg = rest.split("/")[0];
            const isScoped = firstSeg.startsWith("@");
            const pkg = isScoped ? `${firstSeg}/${rest.split("/")[1]}` : firstSeg.split("_")[0];
            switch (pkg) {
              case "@supabase/supabase-js":
              case "@supabase/realtime-js":
              case "@supabase/postgrest-js":
              case "@supabase/storage-js":
              case "@supabase/functions-js":
              case "@supabase/auth-js":
                return "vendor-supabase";
              case "@tanstack/react-router":
              case "@tanstack/react-query":
              case "@tanstack/router-core":
              case "@tanstack/react-store":
              case "@tanstack/store":
                return "vendor-tanstack";
              case "@radix-ui/react-accordion":
              case "@radix-ui/react-dialog":
              case "@radix-ui/react-label":
              case "@radix-ui/react-popover":
              case "@radix-ui/react-select":
              case "@radix-ui/react-slot":
              case "@radix-ui/react-switch":
              case "@radix-ui/react-tabs":
              case "@radix-ui/react-tooltip":
              case "@radix-ui/react-visually-hidden":
                return "vendor-radix";
              case "@livekit/components-react":
                return "vendor-livekit";
              case "livekit-client":
              case "livekit-server-sdk":
                return "vendor-livekit";
              case "react":
              case "react-dom":
              case "scheduler":
                return "vendor-react";
              case "framer-motion":
              case "motion":
              case "motion-dom":
              case "motion-utils":
                return "vendor-motion";
              case "recharts":
                return "vendor-recharts";
              case "date-fns":
                return "vendor-date-fns";
              case "lucide-react":
              case "react-day-picker":
                return "vendor-lucide";
            }
          },
        },
      },
    },
  },
});
