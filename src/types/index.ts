import { z } from "zod";

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS";

export type ContractSchema = {
  params?: z.ZodTypeAny;
  query?: z.ZodTypeAny;
  body?: z.ZodTypeAny;
  headers?: z.ZodTypeAny;
  response?: Record<number, z.ZodTypeAny>;
};

export type ContractDefinition = {
  method: HttpMethod;
  path: string;
  params?: z.ZodTypeAny;
  query?: z.ZodTypeAny;
  body?: z.ZodTypeAny;
  headers?: z.ZodTypeAny;
  response?: Record<number, z.ZodTypeAny>;
  meta?: Record<string, unknown>;
};

export type InferParams<T extends { params?: z.ZodTypeAny }> = 
  T["params"] extends z.ZodTypeAny ? z.infer<T["params"]> : never;

export type InferQuery<T extends { query?: z.ZodTypeAny }> = 
  T["query"] extends z.ZodTypeAny ? z.infer<T["query"]> : never;

export type InferBody<T extends { body?: z.ZodTypeAny }> = 
  T["body"] extends z.ZodTypeAny ? z.infer<T["body"]> : never;

export type InferHeaders<T extends { headers?: z.ZodTypeAny }> = 
  T["headers"] extends z.ZodTypeAny ? z.infer<T["headers"]> : never;

export type InferResponse<T extends { response?: Record<number, z.ZodTypeAny> }, Status extends number> = 
  T["response"] extends Record<number, z.ZodTypeAny> 
    ? Status extends keyof T["response"] 
      ? T["response"][Status] extends z.ZodTypeAny 
        ? z.infer<T["response"][Status]> 
        : never 
      : never 
    : never;

export type ParsedUrl = {
  pathname: string;
  searchParams: URLSearchParams;
  params: Record<string, string>;
};

export type RouteMatch = {
  contract: ContractDefinition;
  params: Record<string, string>;
};
