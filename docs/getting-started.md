# Getting Started

Sansao is a contract-first backend framework built on Web Standards (`Request` and `Response`).
You define each endpoint contract first, then implement a handler that receives validated and typed input.

## Mental Model

```
request
  -> route match
  -> contract parsing + validation
  -> middleware chain
  -> handler
  -> response
```

## Core Building Blocks

1. `contract`: declares method, path, and I/O schemas.
2. `defineHandler`: binds business logic to one contract.
3. `createApp`: registers handlers and runs middlewares.
4. `Context`: typed request data + response helpers.

## Installation

```bash
npm install sansao
```

For validator-specific setup (Zod, Yup, Valibot, custom adapters), see [`validators.md`](validators.md).

## First Endpoint

```ts
import { createApp, contract, defineHandler, z } from "sansao";
import { serve } from "sansao/node";

const createUser = contract.post("/users", {
  body: z.object({
    name: z.string().min(2),
    email: z.email(),
  }),
  response: {
    201: z.object({
      id: z.string(),
      name: z.string(),
      email: z.string(),
    }),
  },
});

const app = createApp({
  // Be explicit in app code:
  // - development: validates responses
  // - production: disables validation overhead
  responseValidation:
    process.env.NODE_ENV === "production" ? "off" : "development",
});

app.register(
  defineHandler(createUser, async (ctx) => {
    // Input is already validated against the contract body schema.
    const user = {
      id: crypto.randomUUID(),
      name: ctx.body.name,
      email: ctx.body.email,
    };

    return ctx.json(201, user);
  }),
);

serve(app, { port: 3000 });
```

If you need strict contract enforcement in production too:

```ts
const app = createApp({
  responseValidation: "always",
});
```

### Validation Library Choice

- Sansao is validator-agnostic through adapters.
- For concrete setup and examples, use [`validators.md`](validators.md).

### Run with Bun

```ts
import { serve } from "sansao/bun";
```

```bash
bun src/index.ts
```

### Run with Deno

```ts
import { serve } from "sansao/deno";
```

```bash
deno run --allow-net src/index.ts
```

## Try It

Start your server and call:

```bash
curl -i \
  -X POST http://localhost:3000/users \
  -H "content-type: application/json" \
  -d '{"name":"Ada","email":"ada@example.com"}'
```

Expected response: `201` with a JSON user payload.

## Validation Flow

Sansao validates inputs before your handler runs:

- `params`: extracted from route segments and validated.
- `query`: validated from URL query values.
- `headers`: normalized and validated.
- `body`: parsed by content type and validated.

If validation fails, Sansao responds with `400` and validation details.

## Middleware

Middlewares run in registration order and can wrap downstream execution:

```ts
app.use(async (ctx, next) => {
  const startedAt = Date.now();
  const response = await next();
  const elapsedMs = Date.now() - startedAt;

  console.log(
    `${ctx.request.method} ${ctx.request.url} -> ${response.status} (${elapsedMs}ms)`,
  );

  return response;
});
```

## Observability Hooks

You can attach optional lifecycle hooks directly in `createApp`:

```ts
const app = createApp({
  hooks: {
    onRequest(event) {
      console.log("->", event.method, event.path);
    },
    onResponse(event) {
      console.log("<-", event.response.status, `${event.durationMs}ms`);
    },
    onError(event) {
      console.error("x", event.phase, event.error);
    },
  },
});
```

Hook guarantees:

- Hook failures never break request handling.
- `onRequest` and `onResponse` can read body payloads safely.
- Request/response cloning is lazy and only happens when body readers are used.

## Next Steps

- API signatures and available helpers: [`api-reference.md`](api-reference.md)
- Runtime internals and guarantees: [`architecture.md`](architecture.md)
- Docs generation options (OpenAPI/Swagger): see `create-sansao` docs in [`../create-sansao/README.md`](../create-sansao/README.md)
