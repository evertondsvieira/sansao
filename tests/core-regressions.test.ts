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

test("multipart/form-data body is parsed with support for repeated fields", async () => {
  const app = createApp();

  const uploadRoute = contract.post("/upload", {
    body: z.object({
      name: z.string(),
      tags: z.array(z.string()),
    }),
  });

  app.register(
    defineHandler(uploadRoute, (ctx) =>
      ctx.json(200, {
        name: ctx.body.name,
        tags: ctx.body.tags,
      })
    )
  );

  const form = new FormData();
  form.append("name", "contract-file");
  form.append("tags", "backend");
  form.append("tags", "zod");

  const response = await app.fetch(
    new Request("http://localhost/upload", {
      method: "POST",
      body: form,
    })
  );
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.name, "contract-file");
  assert.deepEqual(body.tags, ["backend", "zod"]);
});

test("multipart/form-data invalid payload returns structured invalid body error", async () => {
  const app = createApp();

  const uploadRoute = contract.post("/upload-invalid", {
    body: z.object({
      name: z.string(),
      tags: z.array(z.string()),
    }),
  });

  app.register(defineHandler(uploadRoute, (ctx) => ctx.json(200, ctx.body)));

  const form = new FormData();
  form.append("tags", "single-tag");

  const response = await app.fetch(
    new Request("http://localhost/upload-invalid", {
      method: "POST",
      body: form,
    })
  );
  const body = await response.json();

  assert.equal(response.status, 400);
  assert.equal(body.error, "Invalid body");
  assert.equal(body.code, "INVALID_BODY");
});

test("multipart/form-data malformed payload returns invalid body instead of 500", async () => {
  const app = createApp();

  const uploadRoute = contract.post("/upload-malformed", {
    body: z.object({
      name: z.string(),
    }),
  });

  app.register(defineHandler(uploadRoute, (ctx) => ctx.json(200, ctx.body)));

  const response = await app.fetch(
    new Request("http://localhost/upload-malformed", {
      method: "POST",
      headers: {
        "content-type": "multipart/form-data; boundary=----broken-boundary",
      },
      body: "this is not a valid multipart payload",
    })
  );
  const body = await response.json();

  assert.equal(response.status, 400);
  assert.equal(body.error, "Invalid body");
  assert.equal(body.code, "INVALID_BODY");
  assert.equal(body.details, "Invalid multipart form data");
});

test("context stream helper preserves custom headers and cookies", async () => {
  const app = createApp();
  const route = contract.get("/stream-helper");

  app.register(
    defineHandler(route, (ctx) => {
      ctx.setCookie("session", "abc123", { path: "/", httpOnly: true });
      const encoder = new TextEncoder();
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(encoder.encode("chunk"));
          controller.close();
        },
      });
      return ctx.stream(200, stream, {
        headers: { "content-type": "text/plain; charset=utf-8" },
      });
    })
  );

  const response = await app.fetch(new Request("http://localhost/stream-helper"));
  const body = await response.text();

  assert.equal(response.status, 200);
  assert.equal(body, "chunk");
  assert.equal(response.headers.get("content-type"), "text/plain; charset=utf-8");
  assert.match(response.headers.get("set-cookie") || "", /session=abc123/);
});

test("context sse helper formats string chunks and emits retry header", async () => {
  const app = createApp();
  const route = contract.get("/sse-helper");

  app.register(
    defineHandler(route, (ctx) =>
      ctx.sse(
        200,
        (async function* (): AsyncIterable<string> {
          yield "ping";
          yield "pong";
        })(),
        { retry: 1500 }
      )
    )
  );

  const response = await app.fetch(new Request("http://localhost/sse-helper"));
  const body = await response.text();

  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") || "", /text\/event-stream/);
  assert.match(body, /retry: 1500/);
  assert.match(body, /data: ping/);
  assert.match(body, /data: pong/);
});

test("http errors include status, code and details in payload", async () => {
  const app = createApp();
  const route = contract.get("/typed-error");

  app.register(
    defineHandler(route, (ctx) =>
      ctx.fail(422, "Validation failed", {
        code: "VALIDATION_FAILED",
        details: { field: "email" },
      })
    )
  );

  const response = await app.fetch(new Request("http://localhost/typed-error"));
  const body = await response.json();

  assert.equal(response.status, 422);
  assert.equal(body.error, "Validation failed");
  assert.equal(body.code, "VALIDATION_FAILED");
  assert.deepEqual(body.details, { field: "email" });
});

test("invalid thrown status is normalized to 500 response", async () => {
  const app = createApp();
  const route = contract.get("/invalid-error-status");

  app.register(
    defineHandler(route, () => {
      throw {
        status: 700,
        message: "Broken status from user-land",
        code: "BROKEN_STATUS",
      };
    })
  );

  const response = await app.fetch(new Request("http://localhost/invalid-error-status"));
  const body = await response.json();

  assert.equal(response.status, 500);
  assert.equal(body.error, "Broken status from user-land");
  assert.equal(body.code, "BROKEN_STATUS");
});

test("app hooks receive request, response and error lifecycle events", async () => {
  const seen: {
    requestPaths: string[];
    responseStatuses: number[];
    errorPhases: string[];
  } = {
    requestPaths: [],
    responseStatuses: [],
    errorPhases: [],
  };

  const app = createApp({
    hooks: {
      onRequest(event) {
        seen.requestPaths.push(event.path);
      },
      onResponse(event) {
        seen.responseStatuses.push(event.response.status);
        assert.ok(event.durationMs >= 0);
      },
      onError(event) {
        seen.errorPhases.push(event.phase);
      },
    },
  });

  const okRoute = contract.get("/hooks-ok");
  const failRoute = contract.get("/hooks-fail");

  app.register(defineHandler(okRoute, (ctx) => ctx.json(200, { ok: true })));
  app.register(
    defineHandler(failRoute, () => {
      throw new Error("boom");
    })
  );

  const okResponse = await app.fetch(new Request("http://localhost/hooks-ok"));
  assert.equal(okResponse.status, 200);

  const failResponse = await app.fetch(new Request("http://localhost/hooks-fail"));
  assert.equal(failResponse.status, 500);

  assert.deepEqual(seen.requestPaths, ["/hooks-ok", "/hooks-fail"]);
  assert.deepEqual(seen.responseStatuses, [200, 500]);
  assert.deepEqual(seen.errorPhases, ["middleware"]);
});

test("app hook failures never break request processing", async () => {
  const app = createApp({
    hooks: {
      onRequest() {
        throw new Error("request hook failure");
      },
      onResponse() {
        throw new Error("response hook failure");
      },
      onError() {
        throw new Error("error hook failure");
      },
    },
  });

  const route = contract.get("/hooks-safe");
  app.register(defineHandler(route, (ctx) => ctx.text(200, "ok")));

  const response = await app.fetch(new Request("http://localhost/hooks-safe"));
  const body = await response.text();

  assert.equal(response.status, 200);
  assert.equal(body, "ok");
});

test("onRequest can read hook request body without consuming handler request body", async () => {
  const seenBodies: string[] = [];
  const app = createApp({
    hooks: {
      async onRequest(event) {
        seenBodies.push(await event.request.text());
      },
    },
  });

  const route = contract.post("/hook-request-body", {
    body: z.object({
      message: z.string(),
    }),
  });

  app.register(defineHandler(route, (ctx) => ctx.json(200, { echoed: ctx.body.message })));

  const response = await app.fetch(
    new Request("http://localhost/hook-request-body", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: "hello" }),
    })
  );
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.echoed, "hello");
  assert.deepEqual(seenBodies, ['{"message":"hello"}']);
});

test("onResponse can read hook response body without consuming returned response body", async () => {
  const seenBodies: string[] = [];
  const app = createApp({
    hooks: {
      async onResponse(event) {
        seenBodies.push(await event.response.text());
      },
    },
  });

  const route = contract.get("/hook-response-body");
  app.register(defineHandler(route, (ctx) => ctx.text(200, "hello from handler")));

  const response = await app.fetch(new Request("http://localhost/hook-response-body"));
  const body = await response.text();

  assert.equal(response.status, 200);
  assert.equal(body, "hello from handler");
  assert.deepEqual(seenBodies, ["hello from handler"]);
});

test("fetch does not clone request when no hooks are configured", async () => {
  const originalClone = Request.prototype.clone;
  let cloneCalls = 0;
  Request.prototype.clone = function clone(this: Request): Request {
    cloneCalls += 1;
    return originalClone.call(this);
  };

  try {
    const app = createApp();
    const route = contract.post("/no-hook-clone", {
      body: z.object({ value: z.string() }),
    });
    app.register(defineHandler(route, (ctx) => ctx.json(200, { value: ctx.body.value })));

    const response = await app.fetch(
      new Request("http://localhost/no-hook-clone", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ value: "ok" }),
      })
    );
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.value, "ok");
    assert.equal(cloneCalls, 0);
  } finally {
    Request.prototype.clone = originalClone;
  }
});

test("onResponse metadata access does not clone SSE response body", async () => {
  const originalClone = Response.prototype.clone;
  let cloneCalls = 0;
  Response.prototype.clone = function clone(this: Response): Response {
    cloneCalls += 1;
    return originalClone.call(this);
  };

  try {
    const app = createApp({
      responseValidation: "off",
      hooks: {
        onResponse(event) {
          assert.equal(event.response.status, 200);
          assert.match(event.response.headers.get("content-type") || "", /text\/event-stream/);
        },
      },
    });

    const route = contract.get("/hooks-sse-metadata");
    app.register(
      defineHandler(route, (ctx) =>
        ctx.sse(
          200,
          (async function* (): AsyncIterable<string> {
            yield "tick";
          })()
        )
      )
    );

    const response = await app.fetch(new Request("http://localhost/hooks-sse-metadata"));
    assert.equal(response.status, 200);
    const reader = response.body?.getReader();
    if (reader) {
      await reader.cancel();
    }

    assert.equal(cloneCalls, 0);
  } finally {
    Response.prototype.clone = originalClone;
  }
});

test("hooked requests do not clone request body unless hook reads it", async () => {
  const originalClone = Request.prototype.clone;
  let cloneCalls = 0;
  Request.prototype.clone = function clone(this: Request): Request {
    cloneCalls += 1;
    return originalClone.call(this);
  };

  try {
    const app = createApp({
      hooks: {
        onResponse(event) {
          assert.equal(event.response.status, 200);
        },
      },
    });

    const route = contract.post("/hook-no-body-read", {
      body: z.object({ payload: z.string() }),
    });
    app.register(defineHandler(route, (ctx) => ctx.json(200, { payload: ctx.body.payload })));

    const response = await app.fetch(
      new Request("http://localhost/hook-no-body-read", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ payload: "ok" }),
      })
    );
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.payload, "ok");
    assert.equal(cloneCalls, 0);
  } finally {
    Request.prototype.clone = originalClone;
  }
});

test("request body metadata access does not clone hook request", async () => {
  const originalClone = Request.prototype.clone;
  let cloneCalls = 0;
  Request.prototype.clone = function clone(this: Request): Request {
    cloneCalls += 1;
    return originalClone.call(this);
  };

  try {
    const app = createApp({
      hooks: {
        onRequest(event) {
          assert.equal(Boolean(event.request.body), true);
          assert.equal(event.request.bodyUsed, false);
        },
      },
    });

    const route = contract.post("/hook-request-metadata", {
      body: z.object({ payload: z.string() }),
    });
    app.register(defineHandler(route, (ctx) => ctx.json(200, { payload: ctx.body.payload })));

    const response = await app.fetch(
      new Request("http://localhost/hook-request-metadata", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ payload: "ok" }),
      })
    );

    assert.equal(response.status, 200);
    assert.equal(cloneCalls, 0);
  } finally {
    Request.prototype.clone = originalClone;
  }
});

test("response body metadata access does not clone hook response", async () => {
  const originalClone = Response.prototype.clone;
  let cloneCalls = 0;
  Response.prototype.clone = function clone(this: Response): Response {
    cloneCalls += 1;
    return originalClone.call(this);
  };

  try {
    const app = createApp({
      hooks: {
        onResponse(event) {
          assert.equal(Boolean(event.response.body), true);
          assert.equal(event.response.bodyUsed, false);
        },
      },
    });

    const route = contract.get("/hook-response-metadata");
    app.register(defineHandler(route, (ctx) => ctx.text(200, "ok")));

    const response = await app.fetch(new Request("http://localhost/hook-response-metadata"));
    assert.equal(response.status, 200);
    assert.equal(cloneCalls, 0);
  } finally {
    Response.prototype.clone = originalClone;
  }
});

test("invalid request URL is normalized to 500 and still triggers error/response hooks", async () => {
  const seen = {
    errorCalls: 0,
    responseStatuses: [] as number[],
  };

  const app = createApp({
    hooks: {
      onError() {
        seen.errorCalls += 1;
      },
      onResponse(event) {
        seen.responseStatuses.push(event.response.status);
      },
    },
  });

  const invalidRequest = {
    url: "://invalid-url",
    method: "GET",
    headers: new Headers(),
  } as unknown as Request;

  const response = await app.fetch(invalidRequest);
  const body = await response.json();

  assert.equal(response.status, 500);
  assert.equal(typeof body.error, "string");
  assert.equal(seen.errorCalls, 1);
  assert.deepEqual(seen.responseStatuses, [500]);
});

test("hook request bodyUsed reflects wrapper consumption state", async () => {
  const snapshots: boolean[] = [];
  const app = createApp({
    hooks: {
      async onRequest(event) {
        snapshots.push(event.request.bodyUsed);
        await event.request.text();
        snapshots.push(event.request.bodyUsed);
      },
    },
  });

  const route = contract.post("/hook-request-body-used", {
    body: z.object({ value: z.string() }),
  });
  app.register(defineHandler(route, (ctx) => ctx.json(200, { value: ctx.body.value })));

  const response = await app.fetch(
    new Request("http://localhost/hook-request-body-used", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ value: "ok" }),
    })
  );

  assert.equal(response.status, 200);
  assert.deepEqual(snapshots, [false, true]);
});

test("hook response bodyUsed reflects wrapper consumption state", async () => {
  const snapshots: boolean[] = [];
  const app = createApp({
    hooks: {
      async onResponse(event) {
        snapshots.push(event.response.bodyUsed);
        await event.response.text();
        snapshots.push(event.response.bodyUsed);
      },
    },
  });

  const route = contract.get("/hook-response-body-used");
  app.register(defineHandler(route, (ctx) => ctx.text(200, "ok")));

  const response = await app.fetch(new Request("http://localhost/hook-response-body-used"));
  assert.equal(response.status, 200);
  assert.deepEqual(snapshots, [false, true]);
});

test("onRequest bytes() reads from hook clone when available", async () => {
  if (typeof (Request.prototype as any).bytes !== "function") {
    return;
  }

  const seenLengths: number[] = [];
  const app = createApp({
    hooks: {
      async onRequest(event) {
        const bytes = await (event.request as any).bytes();
        seenLengths.push(bytes.length);
      },
    },
  });

  const route = contract.post("/hook-request-bytes", {
    body: z.object({ value: z.string() }),
  });
  app.register(defineHandler(route, (ctx) => ctx.json(200, { value: ctx.body.value })));

  const response = await app.fetch(
    new Request("http://localhost/hook-request-bytes", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ value: "ok" }),
    })
  );
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.value, "ok");
  assert.deepEqual(seenLengths, [14]);
});

test("onResponse bytes() reads from hook clone when available", async () => {
  if (typeof (Response.prototype as any).bytes !== "function") {
    return;
  }

  const seenLengths: number[] = [];
  const app = createApp({
    hooks: {
      async onResponse(event) {
        const bytes = await (event.response as any).bytes();
        seenLengths.push(bytes.length);
      },
    },
  });

  const route = contract.get("/hook-response-bytes");
  app.register(defineHandler(route, (ctx) => ctx.text(200, "hello")));

  const response = await app.fetch(new Request("http://localhost/hook-response-bytes"));
  const body = await response.text();

  assert.equal(response.status, 200);
  assert.equal(body, "hello");
  assert.deepEqual(seenLengths, [5]);
});

test("hook request preserves native bytes() availability", async () => {
  const seenTypes: string[] = [];
  const app = createApp({
    hooks: {
      onRequest(event) {
        seenTypes.push(typeof (event.request as any).bytes);
      },
    },
  });

  const route = contract.get("/hook-bytes-availability");
  app.register(defineHandler(route, (ctx) => ctx.text(200, "ok")));

  const response = await app.fetch(new Request("http://localhost/hook-bytes-availability"));
  assert.equal(response.status, 200);
  assert.deepEqual(seenTypes, [typeof (Request.prototype as any).bytes]);
});

test("onRequest body stream reads do not consume original request body", async () => {
  const seenChunks: string[] = [];
  const decoder = new TextDecoder();
  const app = createApp({
    hooks: {
      async onRequest(event) {
        const reader = event.request.body?.getReader();
        if (!reader) return;
        try {
          while (true) {
            const next = await reader.read();
            if (next.done) break;
            seenChunks.push(decoder.decode(next.value, { stream: true }));
          }
          seenChunks.push(decoder.decode());
        } finally {
          reader.releaseLock();
        }
      },
    },
  });

  const route = contract.post("/hook-request-stream-reader", {
    body: z.object({ value: z.string() }),
  });
  app.register(defineHandler(route, (ctx) => ctx.json(200, { value: ctx.body.value })));

  const response = await app.fetch(
    new Request("http://localhost/hook-request-stream-reader", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ value: "ok" }),
    })
  );
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.value, "ok");
  assert.equal(seenChunks.join(""), '{"value":"ok"}');
});

test("onResponse body stream reads do not consume returned response body", async () => {
  const seenChunks: string[] = [];
  const decoder = new TextDecoder();
  const app = createApp({
    hooks: {
      async onResponse(event) {
        const reader = event.response.body?.getReader();
        if (!reader) return;
        try {
          while (true) {
            const next = await reader.read();
            if (next.done) break;
            seenChunks.push(decoder.decode(next.value, { stream: true }));
          }
          seenChunks.push(decoder.decode());
        } finally {
          reader.releaseLock();
        }
      },
    },
  });

  const route = contract.get("/hook-response-stream-reader");
  app.register(defineHandler(route, (ctx) => ctx.text(200, "hello")));

  const response = await app.fetch(new Request("http://localhost/hook-response-stream-reader"));
  const body = await response.text();

  assert.equal(response.status, 200);
  assert.equal(body, "hello");
  assert.equal(seenChunks.join(""), "hello");
});
