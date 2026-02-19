# API Reference

## Core Exports

```ts
import { createApp, contract, defineHandler, Context, HttpError, z } from "sansao";
```

## `contract`

### Base Signature

```ts
function contract(definition: ContractDefinition): ContractDefinition;
```

### HTTP Helpers

```ts
contract.get(path, options?);
contract.post(path, options?);
contract.put(path, options?);
contract.patch(path, options?);
contract.delete(path, options?);
```

### Contract Definition

```ts
type ContractDefinition = {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS";
  path: string;
  params?: z.ZodTypeAny;
  query?: z.ZodTypeAny;
  body?: z.ZodTypeAny;
  headers?: z.ZodTypeAny;
  response?: Record<number, z.ZodTypeAny>;
};
```

## `defineHandler`

Binds a contract to a typed handler:

```ts
defineHandler(myContract, async (ctx) => {
  return ctx.json(200, { ok: true });
});
```

`ctx` type is inferred from the contract (`params`, `query`, `body`, and headers).

## `createApp`

```ts
const app = createApp({
  // default: "development"
  responseValidation: "development", // "off" | "development" | "always"
  hooks: {
    onRequest(event) {},
    onResponse(event) {},
    onError(event) {},
  },
});

app.register(handler);
app.register([handlerA, handlerB]);
app.use(middleware);

const response = await app.fetch(request); // Promise<Response>
```

### Hook Types

```ts
type RequestPhase =
  | "routing"
  | "params"
  | "query"
  | "headers"
  | "body"
  | "middleware"
  | "response_validation";

type RequestEvent = {
  request: Request;
  method: string;
  path: string;
  startedAt: number;
  contract?: ContractDefinition;
  params?: Record<string, string>;
};

type ResponseEvent = RequestEvent & {
  response: Response;
  durationMs: number;
};

type ErrorEvent = RequestEvent & {
  error: unknown;
  durationMs: number;
  phase: RequestPhase;
};

type AppHooks = {
  onRequest?: (event: RequestEvent) => void | Promise<void>;
  onResponse?: (event: ResponseEvent) => void | Promise<void>;
  onError?: (event: ErrorEvent) => void | Promise<void>;
};
```

### Hook Behavior

- Hooks are optional and run inside the `fetch` pipeline.
- Hook errors are swallowed by design and do not fail requests.
- `onResponse` also runs for framework-generated error responses.
- Hook body access is safe: reading `event.request` or `event.response` body does not consume the original stream used by handlers/callers.

### `responseValidation` modes

- `"off"`: disables response validation.
- `"development"` (default): validates in development-like environments, skips in production.
- `"always"`: validates in every environment.

Recommended explicit app config:

```ts
const app = createApp({
  responseValidation:
    process.env.NODE_ENV === "production" ? "off" : "development",
});
```

### Methods

- `app.register(handler | handler[])`: registers one or many handlers.
- `app.use(middleware)`: adds middleware in execution order.
- `app.fetch(request)`: executes the full request pipeline.

## `Context`

### Request Data

- `ctx.request`: original `Request`.
- `ctx.params`: validated route params.
- `ctx.query`: validated query object.
- `ctx.body`: validated request body.
- `ctx.headers`: validated request headers.
- `ctx.cookies`: parsed cookies.

### Response Helpers

```ts
ctx.json(status, data);
ctx.html(status, html);
ctx.text(status, text);
ctx.redirect(url, status?);
ctx.stream(status, body, options?);
ctx.sse(status, source, options?);
ctx.setHeader(name, value);
```

### Cookie Helpers

```ts
ctx.setCookie(name, value, options?);
ctx.deleteCookie(name, options?);
```

### Typed Errors

```ts
type HttpErrorOptions<TDetails = unknown> = {
  code?: string;
  details?: TDetails;
};

class HttpError<TDetails = unknown> extends Error {
  readonly status: number;
  readonly code?: string;
  readonly details?: TDetails;
}

ctx.error(status, message, options?); // returns HttpError
ctx.fail(status, message, options?); // throws HttpError
```

Use `ctx.fail(...)` for early exits in handlers/middlewares with a stable payload:

```ts
throw ctx.fail(422, "Validation failed", {
  code: "VALIDATION_FAILED",
  details: { field: "email" },
});
```

### Streaming Helpers

```ts
ctx.stream(status, body, {
  headers?: HeadersInit;
});

ctx.sse(status, source, {
  headers?: HeadersInit;
  retry?: number;
});
```

- `ctx.stream` returns a generic streaming `Response` and preserves queued headers/cookies.
- `ctx.sse` sets SSE defaults (`content-type`, `cache-control`, `connection`) and supports:
  - `ReadableStream<Uint8Array>`
  - `AsyncIterable<string | Uint8Array>`

## Validation and Parsing Notes

- Body parsing supports:
  - `application/json`
  - `application/x-www-form-urlencoded`
  - `multipart/form-data`
- `DELETE` requests can include a validated body when defined in contract.
- Empty JSON payload can validate as `undefined` if schema allows it.
- For `multipart/form-data`, repeated fields are grouped as arrays.
- Query parsing uses selective coercion fallback for typed schemas.
- Response validation can run against `contract.response[status]` based on `createApp({ responseValidation })`.

## Node Adapter

```ts
import { serve } from "sansao/node";

serve(app, { port: 3000 });
```

## Bun Adapter

```ts
import { serve } from "sansao/bun";

serve(app, { port: 3000 });
```

## Deno Adapter

```ts
import { serve } from "sansao/deno";

serve(app, { port: 3000 });
```
