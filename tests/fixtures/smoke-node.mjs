import { createApp, contract, defineHandler, z } from "../../dist/src/index.js";
import { serve } from "../../dist/src/adapters/node.js";

const port = Number(process.env.SANSAO_TEST_PORT || 3310);
const hostname = "127.0.0.1";

const health = contract.get("/health", {
  response: {
    200: z.object({ ok: z.boolean(), runtime: z.string() }),
  },
});

const app = createApp();
app.register(
  defineHandler(health, (ctx) => ctx.json(200, { ok: true, runtime: "node" }))
);

serve(app, { port, hostname });
