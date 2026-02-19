import { createApp, defineHandler, contract, z } from "../src/index.ts";
import { serve as nodeServe } from "../src/adapters/node.ts";

// Defining contracts
const getUser = contract.get("/users/:id", {
  params: z.object({ id: z.string() }),
  response: {
    200: z.object({ id: z.string(), name: z.string(), email: z.string() }),
  },
});

const createUser = contract.post("/users", {
  body: z.object({
    name: z.string().min(2),
    email: z.email(),
  }),
  response: {
    201: z.object({ id: z.string(), name: z.string(), email: z.string() }),
  },
});

const login = contract.post("/login", {
  body: z.object({
    email: z.email(),
    password: z.string(),
  }),
});

const streamChunks = contract.get("/stream-chunks");
const events = contract.get("/events");

// Creating handlers
const getUserHandler = defineHandler(getUser, async (ctx) => {
  // Simulating a database lookup
  const user = {
    id: ctx.params.id,
    name: "João Silva",
    email: "joao@exemplo.com",
  };
  return ctx.json(200, user);
});

const createUserHandler = defineHandler(createUser, async (ctx) => {
  const body = ctx.body as { name: string; email: string };
  // Simulating creation
  const user = {
    id: crypto.randomUUID(),
    name: body.name,
    email: body.email,
  };
  return ctx.json(201, user);
});

const loginHandler = defineHandler(login, async (ctx) => {
  const body = ctx.body as { email: string; password: string };
  // HTML-first example: accepts form submit OR JSON
  if (body.email === "test@test.com" && body.password === "123456") {
    ctx.setCookie("session", "abc123", { httpOnly: true });
    
    // Checks whether this is a form submit (Accept: text/html) or an API call
    const acceptHeader = ctx.request.headers.get("accept") || "";
    if (acceptHeader.includes("text/html")) {
      return ctx.redirect("/dashboard");
    }
    
    return ctx.json(200, { success: true });
  }
  
  return ctx.html(401, "<p>Credenciais inválidas</p>");
});

const streamChunksHandler = defineHandler(streamChunks, async (ctx) => {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode("chunk-1\n"));
      controller.enqueue(encoder.encode("chunk-2\n"));
      controller.close();
    },
  });

  return ctx.stream(200, stream, {
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
});

const eventsHandler = defineHandler(events, async (ctx) => {
  async function* eventSource(): AsyncIterable<string> {
    yield "first";
    yield "second";
  }

  return ctx.sse(200, eventSource(), { retry: 1500 });
});

// Creating app
const app = createApp();

// Registering logging middleware
app.use(async (ctx, next) => {
  const start = Date.now();
  const response = await next();
  const duration = Date.now() - start;
  console.log(`${ctx.request.method} ${new URL(ctx.request.url).pathname} - ${response.status} (${duration}ms)`);
  return response;
});

// Registering handlers
app.register([getUserHandler, createUserHandler, loginHandler, streamChunksHandler, eventsHandler]);

// Starting server
nodeServe(app, { port: 3000 });

console.log("📚 Exemplos disponíveis:");
console.log("  GET  http://localhost:3000/users/123");
console.log("  POST http://localhost:3000/users (JSON)");
console.log("  POST http://localhost:3000/login (JSON ou form)");
console.log("  GET  http://localhost:3000/stream-chunks");
console.log("  GET  http://localhost:3000/events");
