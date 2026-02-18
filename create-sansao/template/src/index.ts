import { createApp, contract, defineHandler, z } from "sansao";
import { serve } from "sansao/node";

const health = contract.get("/health", {
  response: {
    200: z.object({ ok: z.boolean() }),
  },
});

const app = createApp({
  responseValidation:
    process.env.NODE_ENV === "production" ? "off" : "development",
});

app.register(
  defineHandler(health, async (ctx) => {
    return ctx.json(200, { ok: true });
  })
);

serve(app, { port: 3000 });
