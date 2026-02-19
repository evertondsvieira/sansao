import { z } from "zod";
import type { ContractDefinition } from "../types/index.js";
import { Router } from "./router.js";
import { Context, HttpError, type ErrorResponse } from "./context.js";
import type { Handler, HandlerFunction } from "./handler.js";

/**
 * Koa-style middleware signature.
 * Each middleware can short-circuit or call `next()` to continue the chain.
 */
export type Middleware = (
  ctx: Context,
  next: () => Promise<Response>
) => Promise<Response> | Response;

export type ResponseValidationMode = "off" | "development" | "always";

export type RequestPhase =
  | "routing"
  | "params"
  | "query"
  | "headers"
  | "body"
  | "middleware"
  | "response_validation";

export type RequestEvent = {
  request: Request;
  method: string;
  path: string;
  startedAt: number;
  contract?: ContractDefinition;
  params?: Record<string, string>;
};

export type ResponseEvent = RequestEvent & {
  response: Response;
  durationMs: number;
};

export type ErrorEvent = RequestEvent & {
  error: unknown;
  durationMs: number;
  phase: RequestPhase;
};

export type AppHooks = {
  onRequest?: (event: RequestEvent) => void | Promise<void>;
  onResponse?: (event: ResponseEvent) => void | Promise<void>;
  onError?: (event: ErrorEvent) => void | Promise<void>;
};

export type AppOptions = {
  responseValidation?: ResponseValidationMode;
  hooks?: AppHooks;
};

const RESPONSE_VALIDATION_MAX_BODY_BYTES = 1024 * 1024;
const RESPONSE_VALIDATION_READ_TIMEOUT_MS = 50;

type RequestTraceState = {
  request: Request;
  method: string;
  path: string;
  startedAt: number;
  contract?: ContractDefinition;
  params?: Record<string, string>;
};

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
  private options: Required<AppOptions>;

  constructor(options: AppOptions = {}) {
    this.options = {
      responseValidation: options.responseValidation ?? "development",
      hooks: options.hooks ?? {},
    };
  }

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
    const trace: RequestTraceState = {
      request,
      method: request.method,
      path: request.url,
      startedAt: Date.now(),
    };
    let phase: RequestPhase = "routing";

    try {
      const url = new URL(request.url);
      trace.path = url.pathname;
      await this.invokeRequestHook(trace);

      const match = this.router.find(request.method, url.pathname);

      if (!match) {
        const response = this.errorResponse(404, "Not Found", {
          code: "ROUTE_NOT_FOUND",
        });
        await this.invokeResponseHook(trace, response);
        return response;
      }

      const { contract, params } = match;
      trace.contract = contract;
      trace.params = params;
      const handler = this.handlers.get(contract);

      if (!handler) {
        const response = this.errorResponse(500, "Handler not found", {
          code: "HANDLER_NOT_FOUND",
        });
        await this.invokeResponseHook(trace, response);
        return response;
      }

      const ctx = new Context(request, contract);

      // Parse and validate route params before handler execution.
      phase = "params";
      if (contract.params) {
        const paramsResult = this.parseParams(contract.params, params);
        if (paramsResult.success) {
          (ctx as any).params = paramsResult.data;
        } else {
          const response = this.errorResponse(400, "Invalid params", {
            code: "INVALID_PARAMS",
            details: paramsResult.error,
          });
          await this.invokeResponseHook(trace, response);
          return response;
        }
      } else {
        (ctx as any).params = params;
      }

      // Parse and validate query string values.
      phase = "query";
      if (contract.query) {
        const queryResult = this.parseQuery(contract.query, url.searchParams);
        if (queryResult.success) {
          (ctx as any).query = queryResult.data;
        } else {
          const response = this.errorResponse(400, "Invalid query", {
            code: "INVALID_QUERY",
            details: queryResult.error,
          });
          await this.invokeResponseHook(trace, response);
          return response;
        }
      } else {
        (ctx as any).query = Object.fromEntries(url.searchParams);
      }

      // Parse and validate request headers.
      phase = "headers";
      if (contract.headers) {
        const headersResult = this.parseHeaders(contract.headers, request.headers);
        if (headersResult.success) {
          (ctx as any).headers = headersResult.data;
        } else {
          const response = this.errorResponse(400, "Invalid headers", {
            code: "INVALID_HEADERS",
            details: headersResult.error,
          });
          await this.invokeResponseHook(trace, response);
          return response;
        }
      }

      // Parse and validate request body for methods that can carry payloads.
      phase = "body";
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
          const response = this.errorResponse(400, "Invalid body", {
            code: "INVALID_BODY",
            details: bodyResult.error,
          });
          await this.invokeResponseHook(trace, response);
          return response;
        }
      }

      // Execute middleware stack in registration order.
      phase = "middleware";
      const executeMiddleware = async (index: number): Promise<Response> => {
        if (index >= this.middlewares.length) {
          return handler(ctx);
        }
        const middleware = this.middlewares[index]!;
        return middleware(ctx, () => executeMiddleware(index + 1));
      };

      const response = await executeMiddleware(0);
      phase = "response_validation";
      const responseValidationResult = await this.validateResponse(contract, response);
      if (!responseValidationResult.success) {
        const invalidResponse = this.errorResponse(500, "Invalid response", {
          code: "INVALID_RESPONSE",
          details: responseValidationResult.error,
        });
        await this.invokeResponseHook(trace, invalidResponse);
        return invalidResponse;
      }

      await this.invokeResponseHook(trace, response);
      return response;
    } catch (error: unknown) {
      await this.invokeErrorHook(trace, error, phase);

      const normalizedError = this.normalizeError(error);
      const errorOptions: { code?: string; details?: unknown } = {};
      if (normalizedError.code !== undefined) {
        errorOptions.code = normalizedError.code;
      }
      if (normalizedError.details !== undefined) {
        errorOptions.details = normalizedError.details;
      }
      const response = this.errorResponse(normalizedError.status, normalizedError.message, errorOptions);
      await this.invokeResponseHook(trace, response);
      return response;
    }
  }

  private async invokeRequestHook(trace: RequestTraceState): Promise<void> {
    const hook = this.options.hooks.onRequest;
    if (!hook) {
      return;
    }
    await this.invokeHook(hook, this.createRequestEvent(trace));
  }

  private async invokeResponseHook(trace: RequestTraceState, response: Response): Promise<void> {
    const hook = this.options.hooks.onResponse;
    if (!hook) {
      return;
    }
    await this.invokeHook(hook, this.createResponseEvent(trace, response));
  }

  private async invokeErrorHook(
    trace: RequestTraceState,
    error: unknown,
    phase: RequestPhase
  ): Promise<void> {
    const hook = this.options.hooks.onError;
    if (!hook) {
      return;
    }
    await this.invokeHook(hook, this.createErrorEvent(trace, error, phase));
  }

  private createRequestEvent(trace: RequestTraceState): RequestEvent {
    const event: RequestEvent = {
      request: this.createHookRequestView(trace.request),
      method: trace.method,
      path: trace.path,
      startedAt: trace.startedAt,
    };

    if (trace.contract !== undefined) {
      event.contract = trace.contract;
    }
    if (trace.params !== undefined) {
      event.params = trace.params;
    }

    return event;
  }

  private createResponseEvent(trace: RequestTraceState, response: Response): ResponseEvent {
    return {
      ...this.createRequestEvent(trace),
      response: this.createHookResponseView(response),
      durationMs: Date.now() - trace.startedAt,
    };
  }

  private createErrorEvent(trace: RequestTraceState, error: unknown, phase: RequestPhase): ErrorEvent {
    return {
      ...this.createRequestEvent(trace),
      error,
      phase,
      durationMs: Date.now() - trace.startedAt,
    };
  }

  private cloneRequestForHook(request: Request): Request {
    try {
      return request.clone();
    } catch {
      return new Request(request.url, {
        method: request.method,
        headers: request.headers,
      });
    }
  }

  private createHookRequestView(request: Request): Request {
    if (!request.body) {
      return request;
    }

    let bodyClone: Request | undefined;
    let bodyView: ReadableStream<Uint8Array> | undefined;
    const getBodyClone = (): Request => {
      if (!bodyClone) {
        bodyClone = this.cloneRequestForHook(request);
      }
      return bodyClone;
    };

    return new Proxy(request, {
      get: (target, prop) => {
        const isBodyReaderMethod =
          prop === "text" ||
          prop === "json" ||
          prop === "arrayBuffer" ||
          prop === "blob" ||
          prop === "formData" ||
          (prop === "bytes" && typeof Reflect.get(target, "bytes", target) === "function");
        if (isBodyReaderMethod) {
          return (...args: unknown[]) => {
            const method = prop as "text" | "json" | "arrayBuffer" | "blob" | "formData" | "bytes";
            const clone = getBodyClone() as unknown as {
              [K in typeof method]: (...input: unknown[]) => unknown;
            };
            return clone[method](...args);
          };
        }

        if (prop === "body") {
          if (!bodyView) {
            bodyView = this.createHookBodyStreamView(
              () => getBodyClone().body,
              () => bodyClone !== undefined,
              () => request.body
            );
          }
          return bodyView;
        }
        if (prop === "bodyUsed") {
          return bodyClone ? bodyClone.bodyUsed : Reflect.get(target, prop, target);
        }

        const value = Reflect.get(target, prop, target);
        if (typeof value === "function") {
          return value.bind(target);
        }
        return value;
      },
    });
  }

  private cloneResponseForHook(response: Response): Response {
    try {
      return response.clone();
    } catch {
      return new Response(null, {
        status: response.status,
        headers: response.headers,
      });
    }
  }

  private createHookResponseView(response: Response): Response {
    if (!response.body) {
      return response;
    }

    let bodyClone: Response | undefined;
    let bodyView: ReadableStream<Uint8Array> | undefined;
    const getBodyClone = (): Response => {
      if (!bodyClone) {
        bodyClone = this.cloneResponseForHook(response);
      }
      return bodyClone;
    };

    return new Proxy(response, {
      get: (target, prop) => {
        const isBodyReaderMethod =
          prop === "text" ||
          prop === "json" ||
          prop === "arrayBuffer" ||
          prop === "blob" ||
          prop === "formData" ||
          (prop === "bytes" && typeof Reflect.get(target, "bytes", target) === "function");
        if (isBodyReaderMethod) {
          return (...args: unknown[]) => {
            const method = prop as "text" | "json" | "arrayBuffer" | "blob" | "formData" | "bytes";
            const clone = getBodyClone() as unknown as {
              [K in typeof method]: (...input: unknown[]) => unknown;
            };
            return clone[method](...args);
          };
        }

        if (prop === "body") {
          if (!bodyView) {
            bodyView = this.createHookBodyStreamView(
              () => getBodyClone().body,
              () => bodyClone !== undefined,
              () => response.body
            );
          }
          return bodyView;
        }
        if (prop === "bodyUsed") {
          return bodyClone ? bodyClone.bodyUsed : Reflect.get(target, prop, target);
        }

        const value = Reflect.get(target, prop, target);
        if (typeof value === "function") {
          return value.bind(target);
        }
        return value;
      },
    });
  }

  private createHookBodyStreamView(
    getClonedBody: () => ReadableStream<Uint8Array> | null,
    hasClonedBody: () => boolean,
    getOriginalBody: () => ReadableStream<Uint8Array> | null
  ): ReadableStream<Uint8Array> {
    const originalBody = getOriginalBody();
    if (!originalBody) {
      return new ReadableStream<Uint8Array>();
    }

    return new Proxy(originalBody, {
      get(target, prop) {
        if (prop === "locked") {
          if (hasClonedBody()) {
            return getClonedBody()?.locked ?? false;
          }
          return target.locked;
        }

        if (prop === Symbol.toStringTag) {
          return "ReadableStream";
        }

        const clonedBody = getClonedBody();
        if (!clonedBody) {
          return undefined;
        }

        const value = Reflect.get(clonedBody as unknown as object, prop, clonedBody);
        if (typeof value === "function") {
          return value.bind(clonedBody);
        }
        return value;
      },
    });
  }

  private async invokeHook<TEvent>(
    hook: ((event: TEvent) => void | Promise<void>) | undefined,
    event: TEvent
  ): Promise<void> {
    if (!hook) {
      return;
    }

    try {
      await hook(event);
    } catch {
      // Hook failures must never break request processing.
    }
  }

  private errorResponse(status: number, error: string, options: { code?: string; details?: unknown } = {}): Response {
    const payload: ErrorResponse = { error };
    if (options.code !== undefined) {
      payload.code = options.code;
    }
    if (options.details !== undefined) {
      payload.details = options.details;
    }
    const safeStatus = this.normalizeStatusCode(status);
    return new Response(JSON.stringify(payload), {
      status: safeStatus,
      headers: { "content-type": "application/json" },
    });
  }

  private normalizeError(error: unknown): {
    status: number;
    message: string;
    code?: string;
    details?: unknown;
  } {
    if (error instanceof HttpError) {
      const normalized: {
        status: number;
        message: string;
        code?: string;
        details?: unknown;
      } = {
        status: this.normalizeStatusCode(error.status),
        message: error.message || "Internal Server Error",
      };
      if (error.code !== undefined) {
        normalized.code = error.code;
      }
      if (error.details !== undefined) {
        normalized.details = error.details;
      }
      return normalized;
    }

    if (typeof error === "object" && error !== null) {
      const maybeError = error as {
        status?: unknown;
        message?: unknown;
        code?: unknown;
        details?: unknown;
      };

      if (typeof maybeError.status === "number") {
        const normalized: {
          status: number;
          message: string;
          code?: string;
          details?: unknown;
        } = {
          status: this.normalizeStatusCode(maybeError.status),
          message:
            typeof maybeError.message === "string" && maybeError.message.length > 0
              ? maybeError.message
              : "Internal Server Error",
        };
        if (typeof maybeError.code === "string") {
          normalized.code = maybeError.code;
        }
        if (maybeError.details !== undefined) {
          normalized.details = maybeError.details;
        }
        return normalized;
      }
    }

    if (error instanceof Error) {
      return {
        status: 500,
        message: error.message || "Internal Server Error",
      };
    }

    return {
      status: 500,
      message: "Internal Server Error",
    };
  }

  private normalizeStatusCode(status: unknown): number {
    if (
      typeof status === "number" &&
      Number.isInteger(status) &&
      status >= 100 &&
      status <= 599
    ) {
      return status;
    }

    return 500;
  }

  private shouldValidateResponse(): boolean {
    if (this.options.responseValidation === "always") {
      return true;
    }

    if (this.options.responseValidation === "off") {
      return false;
    }

    return this.isDevelopmentRuntime();
  }

  private isDevelopmentRuntime(): boolean {
    const nodeEnv = globalThis.process?.env?.NODE_ENV;
    if (typeof nodeEnv === "string") {
      return nodeEnv !== "production";
    }

    const bunEnv = (globalThis as any).Bun?.env?.NODE_ENV;
    if (typeof bunEnv === "string") {
      return bunEnv !== "production";
    }

    const denoEnv = this.readDenoEnv();
    if (typeof denoEnv === "string") {
      return denoEnv !== "production";
    }

    // Default to development when NODE_ENV is unavailable so "development" mode
    // remains active in local/test environments where env vars are unset.
    return true;
  }

  private readDenoEnv(): string | undefined {
    const deno = (globalThis as any).Deno;
    if (!deno?.env?.get) {
      return undefined;
    }
    try {
      return deno.env.get("NODE_ENV");
    } catch {
      return undefined;
    }
  }

  private async validateResponse(
    contract: ContractDefinition,
    response: Response
  ): Promise<{ success: true } | { success: false; error: unknown }> {
    if (!this.shouldValidateResponse()) {
      return { success: true };
    }

    if (!contract.response) {
      return { success: true };
    }

    const schema = contract.response[response.status];
    if (!schema) {
      return { success: true };
    }

    const bodyResult = await this.readResponseBody(response);
    if (!bodyResult.success) {
      return { success: false, error: bodyResult.error };
    }
    if (!("data" in bodyResult)) {
      return { success: true };
    }

    const parseResult = schema.safeParse(bodyResult.data);
    return parseResult.success
      ? { success: true }
      : { success: false, error: parseResult.error };
  }

  private async readResponseBody(
    response: Response
  ): Promise<
    | { success: true; data: unknown }
    | { success: true; skipped: true }
    | { success: false; error: string }
  > {
    if (response.status === 204 || response.status === 304) {
      return { success: true, data: undefined };
    }
    if (!response.body) {
      return { success: true, data: undefined };
    }

    const contentType = response.headers.get("content-type") || "";
    const normalizedType = contentType.toLowerCase();
    if (this.shouldSkipResponseBodyValidation(response, normalizedType)) {
      return { success: true, skipped: true };
    }
    const cloned = response.clone();
    const contentLength = response.headers.get("content-length");
    const parsedLength =
      contentLength === null || contentLength.trim() === ""
        ? undefined
        : Number(contentLength);
    const hasValidContentLength =
      typeof parsedLength === "number" &&
      Number.isFinite(parsedLength) &&
      parsedLength >= 0;
    const textResult = await this.readResponseText(cloned, !hasValidContentLength);
    if (!textResult.success) {
      return textResult;
    }
    if (!("data" in textResult)) {
      return textResult;
    }

    const text = textResult.data;
    if (this.isJsonContentType(normalizedType)) {
      if (text.trim() === "") {
        return { success: true, data: undefined };
      }
      try {
        return { success: true, data: JSON.parse(text) };
      } catch {
        return { success: false, error: "Response body is not valid JSON" };
      }
    }

    return { success: true, data: text };
  }

  private shouldSkipResponseBodyValidation(response: Response, contentType: string): boolean {
    if (!response.body) {
      return false;
    }

    const normalizedType = contentType.toLowerCase();
    if (
      normalizedType.includes("text/event-stream") ||
      normalizedType.includes("application/x-ndjson")
    ) {
      return true;
    }

    const contentLength = response.headers.get("content-length");
    if (!contentLength) {
      return false;
    }

    const parsedLength = Number(contentLength);
    if (!Number.isFinite(parsedLength) || parsedLength < 0) {
      return false;
    }

    return parsedLength > RESPONSE_VALIDATION_MAX_BODY_BYTES;
  }

  private isJsonContentType(contentType: string): boolean {
    return (
      contentType.includes("application/json") ||
      contentType.includes("+json")
    );
  }

  private async readResponseText(
    response: Response,
    useTimeout: boolean
  ): Promise<
    | { success: true; data: string }
    | { success: true; skipped: true }
    | { success: false; error: string }
  > {
    if (!response.body) {
      return { success: true, data: "" };
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    const chunks: string[] = [];
    let totalBytes = 0;
    const deadline = useTimeout ? Date.now() + RESPONSE_VALIDATION_READ_TIMEOUT_MS : Infinity;

    try {
      while (true) {
        const remainingMs = deadline - Date.now();
        const next = useTimeout
          ? await this.readWithTimeout(reader, remainingMs)
          : await reader.read();

        if (next === "timeout") {
          void reader.cancel().catch(() => undefined);
          return { success: true, skipped: true };
        }

        if (next.done) {
          chunks.push(decoder.decode());
          return { success: true, data: chunks.join("") };
        }

        totalBytes += next.value.byteLength;
        if (totalBytes > RESPONSE_VALIDATION_MAX_BODY_BYTES) {
          void reader.cancel().catch(() => undefined);
          return { success: true, skipped: true };
        }

        chunks.push(decoder.decode(next.value, { stream: true }));
      }
    } catch {
      return { success: false, error: "Failed to read response body" };
    }
  }

  private async readWithTimeout(
    reader: ReadableStreamDefaultReader<Uint8Array>,
    remainingMs: number
  ): Promise<ReadableStreamReadResult<Uint8Array> | "timeout"> {
    if (remainingMs <= 0) {
      return "timeout";
    }

    return new Promise<ReadableStreamReadResult<Uint8Array> | "timeout">((resolve, reject) => {
      const timeoutId = setTimeout(() => resolve("timeout"), remainingMs);

      reader.read().then(
        (result) => {
          clearTimeout(timeoutId);
          resolve(result);
        },
        (error) => {
          clearTimeout(timeoutId);
          reject(error);
        }
      );
    });
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
    } else if (contentType.includes("multipart/form-data")) {
      try {
        const multipartData = await request.formData();
        data = this.formDataToObject(multipartData);
      } catch {
        return { success: false, error: "Invalid multipart form data" };
      }
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

  private formDataToObject(formData: FormData): Record<string, FormDataEntryValue | FormDataEntryValue[]> {
    const data: Record<string, FormDataEntryValue | FormDataEntryValue[]> = {};

    formData.forEach((value, key) => {
      const current = data[key];
      if (current === undefined) {
        data[key] = value;
        return;
      }

      if (Array.isArray(current)) {
        current.push(value);
        return;
      }

      data[key] = [current, value];
    });

    return data;
  }
}

/** Creates a new application instance. */
export function createApp(options?: AppOptions): App {
  return new App(options);
}
