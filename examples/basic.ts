import { createApp, defineHandler, contract, z } from "../src/index.ts";
import { serve as nodeServe } from "../src/adapters/node.ts";

// Definindo contratos
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

// Criando handlers
const getUserHandler = defineHandler(getUser, async (ctx) => {
  // Simulando busca no banco
  const user = {
    id: ctx.params.id,
    name: "João Silva",
    email: "joao@exemplo.com",
  };
  return ctx.json(200, user);
});

const createUserHandler = defineHandler(createUser, async (ctx) => {
  const body = ctx.body as { name: string; email: string };
  // Simulando criação
  const user = {
    id: crypto.randomUUID(),
    name: body.name,
    email: body.email,
  };
  return ctx.json(201, user);
});

const loginHandler = defineHandler(login, async (ctx) => {
  const body = ctx.body as { email: string; password: string };
  // Exemplo de HTML-first: aceita form submit OU JSON
  if (body.email === "test@test.com" && body.password === "123456") {
    ctx.setCookie("session", "abc123", { httpOnly: true });
    
    // Verifica se é um form submit (Accept: text/html) ou API call
    const acceptHeader = ctx.request.headers.get("accept") || "";
    if (acceptHeader.includes("text/html")) {
      return ctx.redirect("/dashboard");
    }
    
    return ctx.json(200, { success: true });
  }
  
  return ctx.html(401, "<p>Credenciais inválidas</p>");
});

// Criando app
const app = createApp();

// Registrando middleware de logging
app.use(async (ctx, next) => {
  const start = Date.now();
  const response = await next();
  const duration = Date.now() - start;
  console.log(`${ctx.request.method} ${new URL(ctx.request.url).pathname} - ${response.status} (${duration}ms)`);
  return response;
});

// Registrando handlers
app.register([getUserHandler, createUserHandler, loginHandler]);

// Iniciando servidor
nodeServe(app, { port: 3000 });

console.log("📚 Exemplos disponíveis:");
console.log("  GET  http://localhost:3000/users/123");
console.log("  POST http://localhost:3000/users (JSON)");
console.log("  POST http://localhost:3000/login (JSON ou form)");
