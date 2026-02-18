import type { App } from "../core/app.js";

type DenoListenOptions = {
  port: number;
  hostname?: string;
  onListen?: (params: { hostname: string; port: number }) => void;
};

type DenoGlobal = {
  serve: (
    options: DenoListenOptions,
    handler: (request: Request) => Response | Promise<Response>
  ) => unknown;
};

export type DenoServeOptions = {
  port?: number;
  hostname?: string;
};

export function serve(app: App, options: DenoServeOptions = {}): unknown {
  const { port = 3000, hostname = "0.0.0.0" } = options;
  const runtime = (globalThis as typeof globalThis & { Deno?: DenoGlobal }).Deno;

  if (!runtime?.serve) {
    throw new Error("Deno runtime not detected. Use this adapter inside Deno.");
  }

  return runtime.serve(
    {
      port,
      hostname,
      onListen: ({ hostname: activeHostname, port: activePort }) => {
        console.log(`🦁📋 Sansao is running at http://${activeHostname}:${activePort}`);
      },
    },
    async (request: Request) => {
      try {
        return await app.fetch(request);
      } catch (error) {
        console.error("Error handling request:", error);
        return new Response(JSON.stringify({ error: "Internal Server Error" }), {
          status: 500,
          headers: { "content-type": "application/json" },
        });
      }
    }
  );
}
