// Types
export type {
  HttpMethod,
  ContractDefinition,
  ContractSchema,
  InferParams,
  InferQuery,
  InferBody,
  InferHeaders,
  InferResponse,
  ParsedUrl,
  RouteMatch,
} from "./types/index.js";

// Core
export { contract } from "./core/contract.js";
export {
  createApp,
  App,
  type Middleware,
  type AppOptions,
  type ResponseValidationMode,
} from "./core/app.js";
export { defineHandler, type Handler, type HandlerFunction } from "./core/handler.js";
export {
  Context,
  HttpError,
  type CookieOptions,
  type ErrorResponse,
  type HttpErrorOptions,
} from "./core/context.js";

// Zod re-export para conveniência
export { z } from "zod";
