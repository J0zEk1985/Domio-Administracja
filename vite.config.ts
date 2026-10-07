import path from "path";
import type { IncomingMessage, ServerResponse } from "node:http";
import react from "@vitejs/plugin-react-swc";
import { defineConfig, type Plugin } from "vite";
import { queryLodzBulkWasteSchedule } from "./src/lib/adapters/lodzBulkWasteScraper";

/** Dev-only proxy: the browser cannot call kartalodzianina.pl because of CORS. */
function lodzWasteScheduleProxyPlugin(): Plugin {
  return {
    name: "lodz-waste-schedule-proxy",
    configureServer(server) {
      server.middlewares.use((req: IncomingMessage, res: ServerResponse, next: () => void) => {
        const requestPath = req.url?.split("?")[0] ?? "";
        if (requestPath !== "/api/lodz-waste-schedule" || req.method !== "POST") {
          next();
          return;
        }

        const chunks: Buffer[] = [];
        req.on("data", (chunk: Buffer | string) => {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        });
        req.on("end", () => {
          void (async () => {
            try {
              const raw = Buffer.concat(chunks).toString("utf8");
              const body = raw ? (JSON.parse(raw) as { street?: unknown; buildingNumber?: unknown }) : {};
              const street = typeof body.street === "string" ? body.street : "";
              const buildingNumber = typeof body.buildingNumber === "string" ? body.buildingNumber : "";
              const result = await queryLodzBulkWasteSchedule(street, buildingNumber);
              res.statusCode = 200;
              res.setHeader("Content-Type", "application/json; charset=utf-8");
              res.end(JSON.stringify(result));
            } catch (error) {
              console.error("[lodz-waste-schedule-proxy]", error);
              res.statusCode = 500;
              res.setHeader("Content-Type", "application/json; charset=utf-8");
              res.end(
                JSON.stringify({
                  success: false,
                  schedules: [],
                  error: "Nie udało się pobrać harmonogramu UM Łódź.",
                }),
              );
            }
          })();
        });
      });
    },
  };
}

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

export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [react(), lodzWasteScheduleProxyPlugin(), ckobSyncMockPlugin()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime"],
  },
  /** Production builds only (`npm run build`); dev server keeps console/debugger for DX. */
  esbuild:
    mode === "production" ? { drop: ["console", "debugger"] as const } : undefined,
}));
