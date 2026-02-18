import type { App } from "../core/app.js";

type BunServeConfig = {
  port: number;
  hostname: string;
  fetch: (request: Request) => Response | Promise<Response>;
};

type BunGlobal = {
  serve: (config: BunServeConfig) => unknown;
};

export type BunServeOptions = {
  port?: number;
  hostname?: string;
};

export function serve(app: App, options: BunServeOptions = {}): unknown {
  const { port = 3000, hostname = "0.0.0.0" } = options;
  const runtime = (globalThis as typeof globalThis & { Bun?: BunGlobal }).Bun;

  if (!runtime?.serve) {
    throw new Error("Bun runtime not detected. Use this adapter inside Bun.");
  }

  const server = runtime.serve({
    port,
    hostname,
    fetch: async (request: Request) => {
      try {
        return await app.fetch(request);
      } catch (error) {
        console.error("Error handling request:", error);
        return new Response(JSON.stringify({ error: "Internal Server Error" }), {
          status: 500,
          headers: { "content-type": "application/json" },
        });
      }
    },
  });

  console.log(`🦁📋 Sansao is running at http://${hostname}:${port}`);

  return server;
}
