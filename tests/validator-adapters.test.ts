import assert from "node:assert/strict";
import test from "node:test";
import {
  createValibotValidatorAdapter,
  createYupValidatorAdapter,
  contract,
  createApp,
  defineHandler,
  generateOpenApi,
  type ValidationAdapter,
} from "../dist/src/index.js";

type MockSchema =
  | { kind: "string" }
  | { kind: "object"; required?: string[]; properties: Record<string, MockSchema> };

const mockValidator: ValidationAdapter = {
  name: "mock",
  parse(schema, data) {
    if (!isMockSchema(schema)) {
      return { success: false, error: "Unsupported schema" };
    }
    return validateMock(schema, data);
  },
  getErrorPaths(error) {
    if (!isObject(error) || !Array.isArray(error.issues)) {
      return [];
    }
    return error.issues
      .map((issue) => (isObject(issue) && typeof issue.path === "string" ? issue.path : ""))
      .filter((path) => path.length > 0);
  },
  toJSONSchema(schema) {
    if (!isMockSchema(schema)) {
      return null;
    }
    return mockToJsonSchema(schema);
  },
};

test("app validates requests with custom validator adapter", async () => {
  const createItem = contract.post("/items", {
    body: {
      kind: "object",
      required: ["name"],
      properties: { name: { kind: "string" } },
    } as MockSchema,
  });

  const app = createApp({ validator: mockValidator });
  app.register(
    defineHandler(createItem, (ctx) => {
      const body = ctx.body as { name: string };
      return ctx.json(200, { name: body.name });
    })
  );

  const ok = await app.fetch(
    new Request("http://localhost/items", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Ada" }),
    })
  );
  assert.equal(ok.status, 200);

  const invalid = await app.fetch(
    new Request("http://localhost/items", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    })
  );
  assert.equal(invalid.status, 400);
});

test("generateOpenApi uses custom validator adapter for schema conversion", () => {
  const listItems = contract.get("/items", {
    query: {
      kind: "object",
      properties: {
        page: { kind: "string" },
      },
    } as MockSchema,
    response: {
      200: {
        kind: "object",
        properties: {
          ok: { kind: "string" },
        },
      } as MockSchema,
    },
  });

  const spec = generateOpenApi([listItems], {
    title: "Mock API",
    version: "1.0.0",
    validator: mockValidator,
  });

  const getOp = spec.paths["/items"]?.get;
  assert.ok(getOp);
  assert.equal(getOp.parameters?.[0]?.name, "page");
  assert.ok(getOp.responses["200"]?.content?.["application/json"]?.schema);
});

test("yup adapter has built-in JSON Schema conversion for common shapes", () => {
  class FakeYupValidationError extends Error {
    path?: string;
    inner?: Array<{ path?: string }>;
  }

  const yupAdapter = createYupValidatorAdapter({
    ValidationError: FakeYupValidationError,
  });

  const querySchema = {
    validateSync(value: unknown) {
      return value;
    },
    describe() {
      return {
        type: "object",
        fields: {
          page: { type: "number", optional: true },
          email: { type: "string", tests: [{ name: "email" }] },
        },
      };
    },
  };

  const route = contract.get("/yup-users", {
    query: querySchema,
    response: {
      200: {
        validateSync(value: unknown) {
          return value;
        },
        describe() {
          return { type: "object", fields: { ok: { type: "boolean" } } };
        },
      },
    },
  });

  const spec = generateOpenApi([route], {
    title: "Yup API",
    version: "1.0.0",
    validator: yupAdapter,
  });

  const getOp = spec.paths["/yup-users"]?.get;
  assert.ok(getOp);
  assert.equal(getOp.parameters?.[0]?.name, "page");
  assert.equal(getOp.parameters?.[0]?.required, false);
  assert.equal(getOp.parameters?.[1]?.name, "email");
});

test("valibot adapter has built-in JSON Schema conversion for common shapes", () => {
  const valibotAdapter = createValibotValidatorAdapter({
    safeParse(_schema: unknown, data: unknown) {
      return { success: true, output: data };
    },
  });

  const route = contract.post("/valibot-users", {
    body: {
      type: "object",
      entries: {
        name: { type: "string" },
        nickname: { type: "optional", wrapped: { type: "string" } },
      },
    },
    response: {
      201: {
        type: "object",
        entries: {
          id: { type: "string" },
        },
      },
    },
  });

  const spec = generateOpenApi([route], {
    title: "Valibot API",
    version: "1.0.0",
    validator: valibotAdapter,
  });

  const postOp = spec.paths["/valibot-users"]?.post;
  assert.ok(postOp);
  assert.ok(postOp.requestBody);
  const requestSchema = postOp.requestBody?.content["application/json"]?.schema as {
    required?: string[];
  };
  assert.ok(requestSchema.required?.includes("name"));
  assert.equal(requestSchema.required?.includes("nickname"), false);
});

function validateMock(schema: MockSchema, data: unknown) {
  if (schema.kind === "string") {
    return typeof data === "string"
      ? { success: true as const, data }
      : { success: false as const, error: { issues: [{ path: "", message: "Expected string" }] } };
  }

  if (!isObject(data)) {
    return { success: false as const, error: { issues: [{ path: "", message: "Expected object" }] } };
  }

  for (const key of schema.required ?? []) {
    if (!(key in data)) {
      return { success: false as const, error: { issues: [{ path: key, message: "Required" }] } };
    }
  }

  return { success: true as const, data };
}

function mockToJsonSchema(schema: MockSchema): Record<string, unknown> {
  if (schema.kind === "string") {
    return { type: "string" };
  }

  const properties: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(schema.properties)) {
    properties[key] = mockToJsonSchema(child);
  }

  return {
    type: "object",
    properties,
    ...(schema.required ? { required: schema.required } : {}),
  };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isMockSchema(value: unknown): value is MockSchema {
  if (!isObject(value) || typeof value.kind !== "string") {
    return false;
  }
  return value.kind === "string" || value.kind === "object";
}
