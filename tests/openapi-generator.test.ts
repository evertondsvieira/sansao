import assert from "node:assert/strict";
import test from "node:test";
import { createApp, contract, defineHandler, generateOpenApi, z } from "../dist/src/index.js";

test("generateOpenApi builds basic OpenAPI 3.1 document from registered contracts", () => {
  const getUser = contract.get("/users/:id", {
    params: z.object({ id: z.string() }),
    query: z.object({ expand: z.boolean().optional() }),
    response: {
      200: z.object({
        id: z.string(),
        name: z.string(),
      }),
    },
    meta: {
      summary: "Get user by id",
    },
  });

  const createUser = contract.post("/users", {
    body: z.object({
      name: z.string().min(2),
    }),
    response: {
      201: z.object({ id: z.string(), name: z.string() }),
    },
  });

  const app = createApp();
  app.register([
    defineHandler(getUser, (ctx) => ctx.json(200, { id: ctx.params.id, name: "Ada" })),
    defineHandler(createUser, (ctx) => ctx.json(201, { id: "usr_1", name: ctx.body.name })),
  ]);

  const spec = generateOpenApi(app, {
    title: "Sansao Test API",
    version: "0.1.0",
    servers: [{ url: "http://localhost:3000" }],
    requestBodyContentTypes: ["application/json", "multipart/form-data"],
  });

  assert.equal(spec.openapi, "3.1.0");
  assert.equal(spec.info.title, "Sansao Test API");
  assert.equal(spec.info.version, "0.1.0");
  assert.equal(spec.servers?.[0]?.url, "http://localhost:3000");

  const getOp = spec.paths["/users/{id}"]?.get;
  assert.ok(getOp);
  assert.equal(getOp.summary, "Get user by id");

  const getParams = getOp.parameters ?? [];
  const pathParam = getParams.find((param) => param.in === "path" && param.name === "id");
  assert.ok(pathParam);
  assert.equal(pathParam.required, true);

  const queryParam = getParams.find((param) => param.in === "query" && param.name === "expand");
  assert.ok(queryParam);
  assert.equal(queryParam.required, false);

  const postOp = spec.paths["/users"]?.post;
  assert.ok(postOp);
  assert.ok(postOp.requestBody);
  assert.ok(postOp.requestBody?.content["application/json"]);
  assert.ok(postOp.requestBody?.content["multipart/form-data"]);
  assert.ok(postOp.responses["201"]?.content?.["application/json"]);
});

test("generateOpenApi accepts contract arrays directly", () => {
  const ping = contract.get("/ping", {
    response: { 200: z.object({ ok: z.boolean() }) },
  });

  const spec = generateOpenApi([ping], {
    title: "Array Source",
    version: "1.0.0",
  });

  assert.ok(spec.paths["/ping"]?.get);
  assert.ok(spec.paths["/ping"]?.get?.responses["200"]);
});

test("generateOpenApi emits path params from route placeholders even without params schema", () => {
  const userById = contract.get("/users/:id", {
    response: { 200: z.object({ ok: z.boolean() }) },
  });

  const spec = generateOpenApi([userById], {
    title: "Path Params",
    version: "1.0.0",
  });

  const getOp = spec.paths["/users/{id}"]?.get;
  assert.ok(getOp);
  const pathParam = getOp.parameters?.find((param) => param.in === "path" && param.name === "id");
  assert.ok(pathParam);
  assert.equal(pathParam.required, true);
});

test("generateOpenApi aligns requestBody emission and required flag with runtime behavior", () => {
  const getWithBody = contract.get("/search", {
    body: z.object({ term: z.string() }),
    response: { 200: z.object({ ok: z.boolean() }) },
  });

  const postNullableBody = contract.post("/nullable", {
    body: z.nullable(z.string()),
    response: { 200: z.object({ ok: z.boolean() }) },
  });
  const postOptionalBody = contract.post("/optional", {
    body: z.object({ note: z.string() }).optional(),
    response: { 200: z.object({ ok: z.boolean() }) },
  });

  const spec = generateOpenApi([getWithBody, postNullableBody, postOptionalBody], {
    title: "Body Behavior",
    version: "1.0.0",
  });

  const getOp = spec.paths["/search"]?.get;
  assert.ok(getOp);
  assert.equal(getOp.requestBody, undefined);

  const postOp = spec.paths["/nullable"]?.post;
  assert.ok(postOp);
  assert.ok(postOp.requestBody);
  assert.equal(postOp.requestBody?.required, true);

  const optionalPostOp = spec.paths["/optional"]?.post;
  assert.ok(optionalPostOp);
  assert.ok(optionalPostOp.requestBody);
  assert.equal(optionalPostOp.requestBody?.required, false);
});
