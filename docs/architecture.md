# Architecture

Sansao is split into a runtime-agnostic core and thin runtime adapters.
The core owns routing, validation, middleware composition, and handler execution.

## Module Layout

```txt
src/
├─ core/
│  ├─ app.ts
│  ├─ router.ts
│  ├─ context.ts
│  ├─ contract.ts
│  └─ handler.ts
├─ adapters/
│  ├─ node.ts
│  ├─ bun.ts
│  └─ deno.ts
└─ types/
```

## Request Lifecycle

```txt
Incoming Request
  -> Hooks.onRequest
  -> Router.find(method, path)
  -> Parse + validate contract input
     - params
     - query
     - headers
     - body
  -> Execute middleware chain
  -> Execute matched handler
  -> Response validation (configurable)
  -> Hooks.onResponse
  -> Return Response
  -> (On throw) Hooks.onError + normalized error response + Hooks.onResponse
```

## Routing Guarantees

- Matching is method-aware (`GET /users` and `POST /users` are distinct).
- Static routes are prioritized over dynamic params.
- Example: `/users/me` matches before `/users/:id`.
- Malformed encoded param segments are handled safely and do not crash routing.

## Validation and Parsing Guarantees

- Contract validation happens before handler execution.
- Query values start as raw strings.
- Typed coercion fallback is applied only for failing query keys.
- Body parsing supports `POST`, `PUT`, `PATCH`, and `DELETE`.
- Empty JSON payload can map to `undefined` when allowed by the schema.

## Middleware Execution Model

Middlewares compose in registration order:

```ts
middleware(ctx, () => nextMiddlewareOrHandler());
```

Each middleware can:

- run code before `await next()`;
- inspect or transform the returned `Response`;
- short-circuit by returning a `Response` early.

## Hooks Execution Model

`createApp({ hooks })` supports three optional lifecycle hooks:

- `onRequest`: runs after URL parsing and before route validation/handler execution.
- `onResponse`: runs before returning the final response (including framework-generated error responses).
- `onError`: runs when pipeline errors are caught and includes a `phase` indicating where failure happened.

Hook execution is isolated: exceptions thrown inside hooks are ignored by the core runtime.

## Stream Safety for Hooks

- Hook payload readers (`text/json/arrayBuffer/blob/formData/bytes`) use a lazy clone strategy.
- Metadata access (`status`, `headers`, `body`, `bodyUsed`) does not force cloning.
- This keeps regular requests fast while still allowing observability hooks to inspect payloads safely.

## Adapter Boundary

The core only depends on Web APIs (`Request`, `Response`, `Headers`).
Adapters convert runtime I/O (Node/Bun/Deno) into the core `fetch` interface.

## Why This Design

- Predictable behavior: validation and middleware flow are explicit.
- Portability: core logic is reusable across runtimes.
- Testability: handlers and middleware can be tested with standard `Request`/`Response`.
