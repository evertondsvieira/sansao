# API Reference

## Core Exports

```ts
import { createApp, contract, defineHandler, Context, z } from "sansao";
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
});

app.register(handler);
app.register([handlerA, handlerB]);
app.use(middleware);

const response = await app.fetch(request); // Promise<Response>
```

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
ctx.setHeader(name, value);
```

### Cookie Helpers

```ts
ctx.setCookie(name, value, options?);
ctx.deleteCookie(name, options?);
```

## Validation and Parsing Notes

- Body parsing supports `application/json` and `application/x-www-form-urlencoded`.
- `DELETE` requests can include a validated body when defined in contract.
- Empty JSON payload can validate as `undefined` if schema allows it.
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
