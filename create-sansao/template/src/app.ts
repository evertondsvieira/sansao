import { createApp, contract, defineHandler, z } from "sansao";

const health = contract.get("/health", {
  response: {
    200: z.object({ ok: z.boolean() }),
  },
  meta: {
    summary: "Health check",
    description: "Returns service health state.",
  },
});

export const app = createApp({
  responseValidation:
    process.env.NODE_ENV === "production" ? "off" : "development",
});

app.register(
  defineHandler(health, async (ctx) => {
    return ctx.json(200, { ok: true });
  })
);
