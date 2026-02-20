# Validators

Sansao is validator-agnostic through adapters.

## Install

```bash
npm install sansao
```

Pick one validator:

```bash
# Zod
npm install zod

# Yup
npm install yup

# Valibot
npm install valibot
```

## Zod (Default Ergonomics)

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

## Yup

```ts
import { createApp, contract, defineHandler } from "sansao";
import { createYupValidatorAdapter } from "sansao/validators";
import { serve } from "sansao/node";
import * as yup from "yup";

const createUser = contract.post("/users", {
  body: yup
    .object({
      name: yup.string().required(),
      email: yup.string().email().required(),
    })
    .required(),
});

const app = createApp({
  validator: createYupValidatorAdapter(yup),
});

app.register(
  defineHandler(createUser, async (ctx) => {
    return ctx.json(201, { id: crypto.randomUUID(), ...(ctx.body as Record<string, unknown>) });
  })
);

serve(app, { port: 3000 });
```

## Valibot

```ts
import { createApp, contract, defineHandler } from "sansao";
import { createValibotValidatorAdapter } from "sansao/validators";
import { serve } from "sansao/node";
import * as v from "valibot";

const createUser = contract.post("/users", {
  body: v.object({
    name: v.string(),
    email: v.pipe(v.string(), v.email()),
  }),
});

const app = createApp({
  validator: createValibotValidatorAdapter(v),
});

app.register(
  defineHandler(createUser, async (ctx) => {
    return ctx.json(201, { id: crypto.randomUUID(), ...(ctx.body as Record<string, unknown>) });
  })
);

serve(app, { port: 3000 });
```

## Adapter Helpers

- `zodValidator`
- `createYupValidatorAdapter(...)`
- `createValibotValidatorAdapter(...)`

OpenAPI generation (`sansao/docs`) uses the configured app validator.
