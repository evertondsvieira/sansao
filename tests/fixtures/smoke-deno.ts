import { createApp, contract, defineHandler, z } from "../../dist/src/index.js";
import { serve } from "../../dist/src/adapters/deno.js";

const port = Number(Deno.env.get("SANSAO_TEST_PORT") || "3312");
const hostname = "127.0.0.1";

const health = contract.get("/health", {
  response: {
    200: z.object({ ok: z.boolean(), runtime: z.string() }),
  },
});

const app = createApp();
app.register(
  defineHandler(health, (ctx) => ctx.json(200, { ok: true, runtime: "deno" }))
);

serve(app, { port, hostname });
