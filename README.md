# 🦁📋 Sansao

**Contract-first backend framework for predictable APIs.**

Built on Web Standards, designed to pair with modern frontend architectures.

## Install

```bash
npm install sansao zod
```

## Quick Example

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

## Observability Hooks

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

Available hooks: `onRequest`, `onResponse`, `onError`.
These hooks are optional and safe: hook failures do not break request handling.

## Documentation

- Getting Started: [`docs/getting-started.md`](docs/getting-started.md)
- API Reference: [`docs/api-reference.md`](docs/api-reference.md)
- Architecture: [`docs/architecture.md`](docs/architecture.md)

## License

MIT
