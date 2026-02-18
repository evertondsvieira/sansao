import test from "node:test";
import assert from "node:assert/strict";
import type { App } from "../dist/src/core/app.js";
import { serve as serveBun } from "../dist/src/adapters/bun.js";
import { serve as serveDeno } from "../dist/src/adapters/deno.js";

test("bun adapter delegates requests to app.fetch", async () => {
  const originalBun = (globalThis as typeof globalThis & { Bun?: unknown }).Bun;
  const fakeServer = { stop() {} };
  let capturedConfig: {
    port: number;
    hostname: string;
    fetch: (request: Request) => Promise<Response>;
  } | null = null;
  let seenUrl = "";

  (globalThis as typeof globalThis & { Bun?: unknown }).Bun = {
    serve(config: {
      port: number;
      hostname: string;
      fetch: (request: Request) => Promise<Response>;
    }) {
      capturedConfig = config;
      return fakeServer;
    },
  };

  const app = {
    fetch: async (request: Request) => {
      seenUrl = request.url;
      return new Response("ok", { status: 200 });
    },
  } as App;

  const server = serveBun(app, { port: 4321, hostname: "127.0.0.1" });
  assert.equal(server, fakeServer);
  assert.equal(capturedConfig?.port, 4321);
  assert.equal(capturedConfig?.hostname, "127.0.0.1");

  const response = await capturedConfig!.fetch(new Request("http://localhost/users"));
  assert.equal(response.status, 200);
  assert.equal(seenUrl, "http://localhost/users");

  (globalThis as typeof globalThis & { Bun?: unknown }).Bun = originalBun;
});

test("bun adapter returns 500 when app.fetch throws", async () => {
  const originalBun = (globalThis as typeof globalThis & { Bun?: unknown }).Bun;
  let capturedFetch: ((request: Request) => Promise<Response>) | null = null;

  (globalThis as typeof globalThis & { Bun?: unknown }).Bun = {
    serve(config: { fetch: (request: Request) => Promise<Response> }) {
      capturedFetch = config.fetch;
      return {};
    },
  };

  const app = {
    fetch: async () => {
      throw new Error("boom");
    },
  } as App;

  serveBun(app);
  const response = await capturedFetch!(new Request("http://localhost/fail"));
  const body = await response.json();

  assert.equal(response.status, 500);
  assert.equal(body.error, "Internal Server Error");

  (globalThis as typeof globalThis & { Bun?: unknown }).Bun = originalBun;
});

test("bun adapter fails fast when runtime is unavailable", () => {
  const originalBun = (globalThis as typeof globalThis & { Bun?: unknown }).Bun;
  (globalThis as typeof globalThis & { Bun?: unknown }).Bun = undefined;

  const app = { fetch: async (request: Request) => new Response(request.url) } as App;
  assert.throws(() => serveBun(app), /Bun runtime not detected/);

  (globalThis as typeof globalThis & { Bun?: unknown }).Bun = originalBun;
});

test("deno adapter delegates requests to app.fetch", async () => {
  const originalDeno = (globalThis as typeof globalThis & { Deno?: unknown }).Deno;
  const fakeServer = { shutdown() {} };
  let capturedOptions: { port: number; hostname?: string } | null = null;
  let capturedHandler: ((request: Request) => Promise<Response>) | null = null;
  let seenUrl = "";

  (globalThis as typeof globalThis & { Deno?: unknown }).Deno = {
    serve(
      options: { port: number; hostname?: string },
      handler: (request: Request) => Promise<Response>
    ) {
      capturedOptions = options;
      capturedHandler = handler;
      return fakeServer;
    },
  };

  const app = {
    fetch: async (request: Request) => {
      seenUrl = request.url;
      return new Response("ok", { status: 201 });
    },
  } as App;

  const server = serveDeno(app, { port: 8787, hostname: "127.0.0.1" });
  assert.equal(server, fakeServer);
  assert.equal(capturedOptions?.port, 8787);
  assert.equal(capturedOptions?.hostname, "127.0.0.1");

  const response = await capturedHandler!(new Request("http://localhost/tasks"));
  assert.equal(response.status, 201);
  assert.equal(seenUrl, "http://localhost/tasks");

  (globalThis as typeof globalThis & { Deno?: unknown }).Deno = originalDeno;
});

test("deno adapter returns 500 when app.fetch throws", async () => {
  const originalDeno = (globalThis as typeof globalThis & { Deno?: unknown }).Deno;
  let capturedHandler: ((request: Request) => Promise<Response>) | null = null;

  (globalThis as typeof globalThis & { Deno?: unknown }).Deno = {
    serve(
      _options: { port: number; hostname?: string },
      handler: (request: Request) => Promise<Response>
    ) {
      capturedHandler = handler;
      return {};
    },
  };

  const app = {
    fetch: async () => {
      throw new Error("boom");
    },
  } as App;

  serveDeno(app);
  const response = await capturedHandler!(new Request("http://localhost/fail"));
  const body = await response.json();

  assert.equal(response.status, 500);
  assert.equal(body.error, "Internal Server Error");

  (globalThis as typeof globalThis & { Deno?: unknown }).Deno = originalDeno;
});

test("deno adapter fails fast when runtime is unavailable", () => {
  const originalDeno = (globalThis as typeof globalThis & { Deno?: unknown }).Deno;
  (globalThis as typeof globalThis & { Deno?: unknown }).Deno = undefined;

  const app = { fetch: async (request: Request) => new Response(request.url) } as App;
  assert.throws(() => serveDeno(app), /Deno runtime not detected/);

  (globalThis as typeof globalThis & { Deno?: unknown }).Deno = originalDeno;
});
