import test from "node:test";
import assert from "node:assert/strict";
import { contract, createApp, defineHandler, z } from "../dist/src/index.js";

test("router prefers static route over dynamic param route", async () => {
  const app = createApp();

  const userById = contract.get("/users/:id", {
    params: z.object({ id: z.string() }),
  });
  const currentUser = contract.get("/users/me");

  app.register(
    defineHandler(userById, (ctx) => ctx.json(200, { route: "dynamic", id: ctx.params.id }))
  );
  app.register(defineHandler(currentUser, (ctx) => ctx.json(200, { route: "static" })));

  const response = await app.fetch(new Request("http://localhost/users/me"));
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.route, "static");
});

test("DELETE contract body is parsed and validated", async () => {
  const app = createApp();

  const deleteUser = contract.delete("/users", {
    body: z.object({ reason: z.string().min(1) }),
  });

  app.register(
    defineHandler(deleteUser, (ctx) => {
      const body = ctx.body as { reason: string };
      return ctx.json(200, { accepted: body.reason });
    })
  );

  const okResponse = await app.fetch(
    new Request("http://localhost/users", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ reason: "cleanup" }),
    })
  );
  const okBody = await okResponse.json();

  assert.equal(okResponse.status, 200);
  assert.equal(okBody.accepted, "cleanup");

  const invalidResponse = await app.fetch(
    new Request("http://localhost/users", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    })
  );

  assert.equal(invalidResponse.status, 400);
});

test("query values are coerced for typed schemas and keep strings when schema expects string", async () => {
  const app = createApp();

  const typedQuery = contract.get("/typed-query", {
    query: z.object({
      expand: z.boolean().optional(),
      page: z.number().optional(),
    }),
  });

  const stringQuery = contract.get("/string-query", {
    query: z.object({
      id: z.string(),
    }),
  });
  const mixedQuery = contract.get("/mixed-query", {
    query: z.object({
      id: z.string(),
      page: z.number(),
    }),
  });

  app.register(
    defineHandler(typedQuery, (ctx) =>
      ctx.json(200, {
        expand: ctx.query.expand,
        expandType: typeof ctx.query.expand,
        page: ctx.query.page,
        pageType: typeof ctx.query.page,
      })
    )
  );

  app.register(
    defineHandler(stringQuery, (ctx) =>
      ctx.json(200, {
        id: ctx.query.id,
        idType: typeof ctx.query.id,
      })
    )
  );
  app.register(
    defineHandler(mixedQuery, (ctx) =>
      ctx.json(200, {
        id: ctx.query.id,
        idType: typeof ctx.query.id,
        page: ctx.query.page,
        pageType: typeof ctx.query.page,
      })
    )
  );

  const typedResponse = await app.fetch(
    new Request("http://localhost/typed-query?expand=true&page=2")
  );
  const typedBody = await typedResponse.json();

  assert.equal(typedResponse.status, 200);
  assert.equal(typedBody.expand, true);
  assert.equal(typedBody.expandType, "boolean");
  assert.equal(typedBody.page, 2);
  assert.equal(typedBody.pageType, "number");

  const stringResponse = await app.fetch(
    new Request("http://localhost/string-query?id=123")
  );
  const stringBody = await stringResponse.json();

  assert.equal(stringResponse.status, 200);
  assert.equal(stringBody.id, "123");
  assert.equal(stringBody.idType, "string");

  const mixedResponse = await app.fetch(
    new Request("http://localhost/mixed-query?id=123&page=2")
  );
  const mixedBody = await mixedResponse.json();

  assert.equal(mixedResponse.status, 200);
  assert.equal(mixedBody.id, "123");
  assert.equal(mixedBody.idType, "string");
  assert.equal(mixedBody.page, 2);
  assert.equal(mixedBody.pageType, "number");
});

test("empty JSON body can validate against optional body schema", async () => {
  const app = createApp();

  const optionalBodyContract = contract.post("/optional-body", {
    body: z.object({ note: z.string() }).optional(),
  });

  app.register(
    defineHandler(optionalBodyContract, (ctx) =>
      ctx.json(200, {
        bodyIsUndefined: ctx.body === undefined,
      })
    )
  );

  const response = await app.fetch(
    new Request("http://localhost/optional-body", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "",
    })
  );
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.bodyIsUndefined, true);
});

test("malformed url-encoded path param does not throw 500", async () => {
  const app = createApp();

  const userById = contract.get("/users/:id", {
    params: z.object({ id: z.string() }),
  });

  app.register(defineHandler(userById, (ctx) => ctx.json(200, { id: ctx.params.id })));

  const response = await app.fetch(
    new Request("http://localhost/users/%E0%A4%A")
  );

  assert.equal(response.status, 404);
});

test("response validation rejects invalid handler payload in always mode", async () => {
  const app = createApp({ responseValidation: "always" });

  const userRoute = contract.get("/users/:id", {
    params: z.object({ id: z.string() }),
    response: {
      200: z.object({
        id: z.string(),
        name: z.string(),
      }),
    },
  });

  app.register(
    defineHandler(userRoute, (ctx) => ctx.json(200, { id: ctx.params.id }))
  );

  const response = await app.fetch(new Request("http://localhost/users/123"));
  const body = await response.json();

  assert.equal(response.status, 500);
  assert.equal(body.error, "Invalid response");
});

test("response validation accepts valid handler payload in always mode", async () => {
  const app = createApp({ responseValidation: "always" });

  const userRoute = contract.get("/users/:id", {
    params: z.object({ id: z.string() }),
    response: {
      200: z.object({
        id: z.string(),
        name: z.string(),
      }),
    },
  });

  app.register(
    defineHandler(userRoute, (ctx) =>
      ctx.json(200, { id: ctx.params.id, name: "Ada Lovelace" })
    )
  );

  const response = await app.fetch(new Request("http://localhost/users/123"));
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.name, "Ada Lovelace");
});

test("response validation can be disabled explicitly", async () => {
  const app = createApp({ responseValidation: "off" });

  const userRoute = contract.get("/users/:id", {
    params: z.object({ id: z.string() }),
    response: {
      200: z.object({
        id: z.string(),
        name: z.string(),
      }),
    },
  });

  app.register(
    defineHandler(userRoute, (ctx) => ctx.json(200, { id: ctx.params.id }))
  );

  const response = await app.fetch(new Request("http://localhost/users/123"));
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.id, "123");
});

test("development response validation stays enabled when runtime env is unavailable", async () => {
  const app = createApp({ responseValidation: "development" });

  const route = contract.get("/safe-env", {
    response: {
      200: z.object({
        ok: z.boolean(),
      }),
    },
  });

  app.register(defineHandler(route, () => new Response(JSON.stringify({}))));

  const processDescriptor = Object.getOwnPropertyDescriptor(globalThis, "process");
  const denoDescriptor = Object.getOwnPropertyDescriptor(globalThis, "Deno");
  const bunDescriptor = Object.getOwnPropertyDescriptor(globalThis, "Bun");

  Object.defineProperty(globalThis, "process", { configurable: true, value: undefined });
  Object.defineProperty(globalThis, "Deno", { configurable: true, value: undefined });
  Object.defineProperty(globalThis, "Bun", { configurable: true, value: undefined });

  try {
    const response = await app.fetch(new Request("http://localhost/safe-env"));
    const body = await response.json();
    assert.equal(response.status, 500);
    assert.equal(body.error, "Invalid response");
  } finally {
    if (processDescriptor) {
      Object.defineProperty(globalThis, "process", processDescriptor);
    } else {
      delete (globalThis as any).process;
    }
    if (denoDescriptor) {
      Object.defineProperty(globalThis, "Deno", denoDescriptor);
    } else {
      delete (globalThis as any).Deno;
    }
    if (bunDescriptor) {
      Object.defineProperty(globalThis, "Bun", bunDescriptor);
    } else {
      delete (globalThis as any).Bun;
    }
  }
});

test("empty non-JSON response body validates as undefined", async () => {
  const app = createApp({ responseValidation: "always" });

  const route = contract.get("/empty-response", {
    response: {
      302: z.undefined(),
    },
  });

  app.register(
    defineHandler(route, () =>
      new Response(null, {
        status: 302,
        headers: { location: "/next", "content-type": "text/plain" },
      })
    )
  );

  const response = await app.fetch(new Request("http://localhost/empty-response"));
  assert.equal(response.status, 302);
});

test("response validation does not block SSE streaming responses", async () => {
  const app = createApp({ responseValidation: "always" });

  const route = contract.get("/events", {
    response: {
      200: z.string(),
    },
  });

  app.register(
    defineHandler(route, () => {
      const encoder = new TextEncoder();
      let closeTimer: ReturnType<typeof setTimeout> | undefined;
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(encoder.encode("data: ping\n\n"));
          closeTimer = setTimeout(() => controller.close(), 1000);
        },
        cancel() {
          if (closeTimer) {
            clearTimeout(closeTimer);
          }
        },
      });
      return new Response(stream, {
        status: 200,
        headers: { "content-type": "text/event-stream" },
      });
    })
  );

  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(
      () => reject(new Error("SSE response validation timed out")),
      250
    );
  });

  const response = await Promise.race([
    app.fetch(new Request("http://localhost/events")),
    timeoutPromise,
  ]);
  if (timeoutId) {
    clearTimeout(timeoutId);
  }

  assert.equal(response.status, 200);
  const reader = response.body?.getReader();
  if (reader) {
    await reader.cancel();
  }
});

test("response validation does not block unknown-length text stream responses", async () => {
  const app = createApp({ responseValidation: "always" });

  const route = contract.get("/stream-text", {
    response: {
      200: z.string(),
    },
  });

  app.register(
    defineHandler(route, () => {
      const encoder = new TextEncoder();
      let closeTimer: ReturnType<typeof setTimeout> | undefined;
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(encoder.encode("chunk-1"));
          closeTimer = setTimeout(() => controller.close(), 1000);
        },
        cancel() {
          if (closeTimer) {
            clearTimeout(closeTimer);
          }
        },
      });
      return new Response(stream, {
        status: 200,
        headers: { "content-type": "text/plain" },
      });
    })
  );

  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(
      () => reject(new Error("Text stream response validation timed out")),
      250
    );
  });

  const response = await Promise.race([
    app.fetch(new Request("http://localhost/stream-text")),
    timeoutPromise,
  ]);
  if (timeoutId) {
    clearTimeout(timeoutId);
  }

  assert.equal(response.status, 200);
  const reader = response.body?.getReader();
  if (reader) {
    await reader.cancel();
  }
});

test("response validation keeps timeout for malformed content-length in stream responses", async () => {
  const app = createApp({ responseValidation: "always" });

  const route = contract.get("/stream-bad-length", {
    response: {
      200: z.string(),
    },
  });

  app.register(
    defineHandler(route, () => {
      let closeTimer: ReturnType<typeof setTimeout> | undefined;
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          closeTimer = setTimeout(() => controller.close(), 1000);
        },
        cancel() {
          if (closeTimer) {
            clearTimeout(closeTimer);
          }
        },
      });

      return new Response(stream, {
        status: 200,
        headers: {
          "content-type": "text/plain",
          "content-length": "not-a-number",
        },
      });
    })
  );

  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(
      () => reject(new Error("Malformed content-length stream validation timed out")),
      250
    );
  });

  const response = await Promise.race([
    app.fetch(new Request("http://localhost/stream-bad-length")),
    timeoutPromise,
  ]);
  if (timeoutId) {
    clearTimeout(timeoutId);
  }

  assert.equal(response.status, 200);

  const reader = response.body?.getReader();
  if (reader) {
    await reader.cancel();
  }
});

test("response validation enforces non-JSON schema without content-length", async () => {
  const app = createApp({ responseValidation: "always" });

  const route = contract.get("/plain", {
    response: {
      200: z.literal("ok"),
    },
  });

  app.register(
    defineHandler(route, () => new Response("nope", { headers: { "content-type": "text/plain" } }))
  );

  const response = await app.fetch(new Request("http://localhost/plain"));
  const body = await response.json();

  assert.equal(response.status, 500);
  assert.equal(body.error, "Invalid response");
});

test("response validation parses +json media types as JSON", async () => {
  const app = createApp({ responseValidation: "always" });

  const route = contract.get("/problem", {
    response: {
      200: z.object({
        type: z.string(),
        title: z.string(),
      }),
    },
  });

  app.register(
    defineHandler(route, () =>
      new Response(JSON.stringify({ type: "about:blank", title: "Example" }), {
        status: 200,
        headers: { "content-type": "application/problem+json" },
      })
    )
  );

  const response = await app.fetch(new Request("http://localhost/problem"));
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.title, "Example");
});

test("response validation preserves empty non-JSON payload as empty string", async () => {
  const app = createApp({ responseValidation: "always" });

  const route = contract.get("/empty-text", {
    response: {
      200: z.literal(""),
    },
  });

  app.register(
    defineHandler(route, () =>
      new Response("", {
        status: 200,
        headers: { "content-type": "text/plain" },
      })
    )
  );

  const response = await app.fetch(new Request("http://localhost/empty-text"));
  assert.equal(response.status, 200);
});
