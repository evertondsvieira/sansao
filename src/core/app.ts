import { z } from "zod";
import type { ContractDefinition } from "../types/index.js";
import { Router } from "./router.js";
import { Context } from "./context.js";
import type { Handler, HandlerFunction } from "./handler.js";

/**
 * Koa-style middleware signature.
 * Each middleware can short-circuit or call `next()` to continue the chain.
 */
export type Middleware = (
  ctx: Context,
  next: () => Promise<Response>
) => Promise<Response> | Response;

/**
 * Main Sansao runtime.
 *
 * Responsibilities:
 * - register contract handlers
 * - match incoming requests
 * - validate inputs with zod schemas from contracts
 * - run middleware pipeline
 */
export class App {
  private router = new Router();
  private handlers = new Map<ContractDefinition, HandlerFunction<any>>();
  private middlewares: Middleware[] = [];

  register(handler: Handler): void;
  register(handlers: Handler[]): void;
  /** Registers one or many handlers. */
  register(input: Handler | Handler[]): void {
    if (Array.isArray(input)) {
      input.forEach((h) => this.registerSingle(h));
    } else {
      this.registerSingle(input);
    }
  }

  private registerSingle(handler: Handler): void {
    this.router.register(handler.contract);
    this.handlers.set(handler.contract, handler.fn);
  }

  /** Adds middleware to the execution chain (registration order). */
  use(middleware: Middleware): void {
    this.middlewares.push(middleware);
  }

  /** Handles a Fetch API request end-to-end and returns a response. */
  async fetch(request: Request): Promise<Response> {
    try {
      const url = new URL(request.url);
      const match = this.router.find(request.method, url.pathname);

      if (!match) {
        return new Response(JSON.stringify({ error: "Not Found" }), {
          status: 404,
          headers: { "content-type": "application/json" },
        });
      }

      const { contract, params } = match;
      const handler = this.handlers.get(contract);

      if (!handler) {
        return new Response(JSON.stringify({ error: "Handler not found" }), {
          status: 500,
          headers: { "content-type": "application/json" },
        });
      }

      const ctx = new Context(request, contract);

      // Parse and validate route params before handler execution.
      if (contract.params) {
        const paramsResult = this.parseParams(contract.params, params);
        if (paramsResult.success) {
          (ctx as any).params = paramsResult.data;
        } else {
          return new Response(
            JSON.stringify({ error: "Invalid params", details: paramsResult.error }),
            { status: 400, headers: { "content-type": "application/json" } }
          );
        }
      } else {
        (ctx as any).params = params;
      }

      // Parse and validate query string values.
      if (contract.query) {
        const queryResult = this.parseQuery(contract.query, url.searchParams);
        if (queryResult.success) {
          (ctx as any).query = queryResult.data;
        } else {
          return new Response(
            JSON.stringify({ error: "Invalid query", details: queryResult.error }),
            { status: 400, headers: { "content-type": "application/json" } }
          );
        }
      } else {
        (ctx as any).query = Object.fromEntries(url.searchParams);
      }

      // Parse and validate request headers.
      if (contract.headers) {
        const headersResult = this.parseHeaders(contract.headers, request.headers);
        if (headersResult.success) {
          (ctx as any).headers = headersResult.data;
        } else {
          return new Response(
            JSON.stringify({ error: "Invalid headers", details: headersResult.error }),
            { status: 400, headers: { "content-type": "application/json" } }
          );
        }
      }

      // Parse and validate request body for methods that can carry payloads.
      if (
        contract.body &&
        (request.method === "POST" ||
          request.method === "PUT" ||
          request.method === "PATCH" ||
          request.method === "DELETE")
      ) {
        const bodyResult = await this.parseBody(contract.body, request);
        if (bodyResult.success) {
          (ctx as any).body = bodyResult.data;
        } else {
          return new Response(
            JSON.stringify({ error: "Invalid body", details: bodyResult.error }),
            { status: 400, headers: { "content-type": "application/json" } }
          );
        }
      }

      // Execute middleware stack in registration order.
      const executeMiddleware = async (index: number): Promise<Response> => {
        if (index >= this.middlewares.length) {
          return handler(ctx);
        }
        const middleware = this.middlewares[index]!;
        return middleware(ctx, () => executeMiddleware(index + 1));
      };

      const response = await executeMiddleware(0);

      // Response schema validation could be added here for development mode.

      return response;
    } catch (error: any) {
      const status = error.status || 500;
      const message = error.message || "Internal Server Error";
      
      return new Response(JSON.stringify({ error: message }), {
        status,
        headers: { "content-type": "application/json" },
      });
    }
  }

  private parseParams(schema: z.ZodTypeAny, params: Record<string, string>): { success: true; data: any } | { success: false; error: any } {
    const result = schema.safeParse(params);
    return result.success 
      ? { success: true, data: result.data }
      : { success: false, error: result.error };
  }

  /**
   * Parses querystring values and retries with basic scalar coercion on failing keys.
   * Coercion targets booleans, null, and numeric strings.
   */
  private parseQuery(schema: z.ZodTypeAny, searchParams: URLSearchParams): { success: true; data: any } | { success: false; error: any } {
    const obj: Record<string, string | string[]> = {};
    
    for (const [key, value] of searchParams) {
      // Use hasOwnProperty so empty values remain explicit and valid.
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        const existing = obj[key];
        obj[key] = Array.isArray(existing) ? [...existing, value] : [existing as string, value];
      } else {
        obj[key] = value;
      }
    }

    const rawResult = schema.safeParse(obj);
    if (rawResult.success) {
      return { success: true, data: rawResult.data };
    }

    const keysToCoerce = new Set<string>();
    for (const issue of rawResult.error.issues) {
      const [firstPath] = issue.path;
      if (typeof firstPath === "string") {
        keysToCoerce.add(firstPath);
      }
    }

    if (keysToCoerce.size === 0) {
      return { success: false, error: rawResult.error };
    }

    const coercedObj = this.coerceQueryObject(obj, keysToCoerce);
    const coercedResult = schema.safeParse(coercedObj);
    return coercedResult.success
      ? { success: true, data: coercedResult.data }
      : { success: false, error: coercedResult.error };
  }

  private coerceQueryObject(
    input: Record<string, string | string[]>,
    keysToCoerce: Set<string>
  ): Record<string, unknown> {
    const out: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(input)) {
      if (!keysToCoerce.has(key)) {
        out[key] = value;
        continue;
      }

      out[key] = Array.isArray(value)
        ? value.map((item) => this.coerceQueryValue(item))
        : this.coerceQueryValue(value);
    }

    return out;
  }

  /** Coerces common scalar string literals used in query parameters. */
  private coerceQueryValue(value: string): unknown {
    if (value === "true") return true;
    if (value === "false") return false;
    if (value === "null") return null;

    if (/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value)) {
      return Number(value);
    }

    return value;
  }

  /** Converts Headers into a plain object and validates with zod. */
  private parseHeaders(schema: z.ZodTypeAny, headers: Headers): { success: true; data: any } | { success: false; error: any } {
    const obj: Record<string, string> = {};
    
    headers.forEach((value, key) => {
      obj[key] = value;
    });

    const result = schema.safeParse(obj);
    return result.success 
      ? { success: true, data: result.data }
      : { success: false, error: result.error };
  }

  /** Parses body by content-type and validates with zod. */
  private async parseBody(schema: z.ZodTypeAny, request: Request): Promise<{ success: true; data: any } | { success: false; error: any }> {
    const contentType = request.headers.get("content-type") || "";
    
    let data: any;

    if (contentType.includes("application/json")) {
      const rawBody = await request.text();
      if (rawBody.trim() === "") {
        data = undefined;
      } else {
        try {
          data = JSON.parse(rawBody);
        } catch {
          return { success: false, error: "Invalid JSON" };
        }
      }
    } else if (contentType.includes("application/x-www-form-urlencoded")) {
      const formData = await request.text();
      data = Object.fromEntries(new URLSearchParams(formData));
    } else {
      // Fall back to JSON parsing first, then plain text.
      try {
        data = await request.clone().json();
      } catch {
        data = await request.text();
      }
    }

    const result = schema.safeParse(data);
    return result.success 
      ? { success: true, data: result.data }
      : { success: false, error: result.error };
  }
}

/** Creates a new application instance. */
export function createApp(): App {
  return new App();
}
