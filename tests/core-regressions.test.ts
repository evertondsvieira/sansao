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
