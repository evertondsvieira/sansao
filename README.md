# 🦁📋 Sansao

**Contract-first backend framework for predictable APIs.**

Built on Web Standards, designed to pair with modern frontend architectures.

## Install

```bash
npm install sansao
```

## Quick Start (Zod)

```ts
import { createApp, contract, defineHandler, z } from "sansao";
import { serve } from "sansao/node";

const createUser = contract.post("/users", {
  body: z.object({ name: z.string(), email: z.email() }),
});

const app = createApp();
app.register(
  defineHandler(createUser, async (ctx) => {
    return ctx.json(201, { id: crypto.randomUUID(), ...ctx.body });
  })
);

serve(app, { port: 3000 });
```

Runtime adapters available: `sansao/node`, `sansao/bun`, `sansao/deno`.

## What You Get

- Contract-first route definitions with pluggable schema validators.
- Validated and typed `params`, `query`, `headers`, and `body`.
- Runtime adapters for Node, Bun, and Deno.
- Optional lifecycle hooks: `onRequest`, `onResponse`, `onError`.
- Streaming helpers: `ctx.stream(...)` and `ctx.sse(...)`.

## Validator Adapters

Sansao supports Zod, Yup, Valibot, and custom adapters.
See full examples and install combinations in [`docs/validators.md`](docs/validators.md).

## Documentation

- Documentation Index: [`docs/README.md`](docs/README.md)
- Getting Started: [`docs/getting-started.md`](docs/getting-started.md)
- Validators Guide: [`docs/validators.md`](docs/validators.md)
- API Reference: [`docs/api-reference.md`](docs/api-reference.md)
- Architecture: [`docs/architecture.md`](docs/architecture.md)
- Auto-docs from Contracts: [`docs/auto-docs.md`](docs/auto-docs.md)

Docs outputs you can generate in projects scaffolded by `create-sansao`:

- `openapi.json`
- `swagger.html` (Swagger UI over your OpenAPI spec)
- or both

## Example App

Run local example:

```bash
npm run example
```

Available routes are printed on startup from `examples/basic.ts`.

## Project Scaffolding

`create-sansao` now supports interactive setup for validator and docs mode:

```bash
npm create sansao@latest my-api
```

Or via flags:

```bash
npm create sansao@latest my-api --validator valibot --docs swagger
```

## License

MIT
