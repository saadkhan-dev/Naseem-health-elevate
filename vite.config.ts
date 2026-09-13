import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  nitro: {
    preset: "cloudflare-module",
  },
  vite: {
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes("node_modules")) return;
            if (id.includes("@supabase")) return "vendor-supabase";
            if (id.includes("react-dom") || id.includes("react/") || id.includes("scheduler"))
              return "vendor-react";
            if (
              id.includes("@tanstack/react-router") ||
              id.includes("@tanstack/react-query") ||
              id.includes("@tanstack/router-")
            )
              return "vendor-tanstack";
            if (id.includes("framer-motion") || id.includes("motion-dom") || id.includes("motion/"))
              return "vendor-motion";
            if (id.includes("recharts")) return "vendor-recharts";
            if (id.includes("date-fns")) return "vendor-date-fns";
            if (id.includes("@radix-ui")) return "vendor-radix";
            if (id.includes("lucide-react")) return "vendor-lucide";
          },
        },
      },
    },
  },
});
