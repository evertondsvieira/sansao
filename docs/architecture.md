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
│  └─ node.ts
└─ types/
```

## Request Lifecycle

```txt
Incoming Request
  -> Router.find(method, path)
  -> Parse + validate contract input
     - params
     - query
     - headers
     - body
  -> Execute middleware chain
  -> Execute matched handler
  -> Return Response
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

## Adapter Boundary

The core only depends on Web APIs (`Request`, `Response`, `Headers`).
Adapters convert runtime I/O (Node/Bun/Deno) into the core `fetch` interface.

## Why This Design

- Predictable behavior: validation and middleware flow are explicit.
- Portability: core logic is reusable across runtimes.
- Testability: handlers and middleware can be tested with standard `Request`/`Response`.
