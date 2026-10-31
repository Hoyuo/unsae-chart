import { serve } from "@hono/node-server";
import { createApp } from "./app.js";

const PORT = Number(process.env.PORT) || 8788;

const server = serve({ fetch: createApp().fetch, port: PORT }, (info) => {
  console.log(`unsae chart → http://localhost:${info.port}`);
});

for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, () => server.close(() => process.exit(0)));
}
