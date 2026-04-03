import path from "path";
import type { IncomingMessage, ServerResponse } from "node:http";
import react from "@vitejs/plugin-react-swc";
import { defineConfig, type Plugin } from "vite";

/** Dev-only mock for c-KOB pull webhook (n8n worker trigger). */
function ckobSyncMockPlugin(): Plugin {
  return {
    name: "ckob-sync-webhook-mock",
    configureServer(server) {
      server.middlewares.use((req: IncomingMessage, res: ServerResponse, next: () => void) => {
        const path = req.url?.split("?")[0] ?? "";
        if (path !== "/api/webhooks/ckob-sync" || req.method !== "POST") {
          next();
          return;
        }
        req.on("data", () => {});
        req.on("end", () => {
          res.setHeader("Content-Type", "application/json");
          res.statusCode = 202;
          res.end(JSON.stringify({ ok: true, mock: true }));
        });
      });
    },
  };
}

export default defineConfig({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [react(), ckobSyncMockPlugin()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime"],
  },
});
