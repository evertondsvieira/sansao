import { z } from "zod";

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS";
export type ContractValidatorSchema = unknown;

export type ContractSchema = {
  params?: ContractValidatorSchema;
  query?: ContractValidatorSchema;
  body?: ContractValidatorSchema;
  headers?: ContractValidatorSchema;
  response?: Record<number, ContractValidatorSchema>;
};

export type ContractDefinition = {
  method: HttpMethod;
  path: string;
  params?: ContractValidatorSchema;
  query?: ContractValidatorSchema;
  body?: ContractValidatorSchema;
  headers?: ContractValidatorSchema;
  response?: Record<number, ContractValidatorSchema>;
  meta?: Record<string, unknown>;
};

type InferFromSchemaOrDefault<TSchema, TDefault> =
  [TSchema] extends [undefined] ? TDefault : TSchema extends z.ZodTypeAny ? z.infer<TSchema> : unknown;

export type InferParams<T extends { params?: ContractValidatorSchema }> = InferFromSchemaOrDefault<
  T["params"],
  Record<string, string>
>;

export type InferQuery<T extends { query?: ContractValidatorSchema }> = InferFromSchemaOrDefault<
  T["query"],
  Record<string, string>
>;

export type InferBody<T extends { body?: ContractValidatorSchema }> = InferFromSchemaOrDefault<
  T["body"],
  unknown
>;

export type InferHeaders<T extends { headers?: ContractValidatorSchema }> = InferFromSchemaOrDefault<
  T["headers"],
  Record<string, string>
>;

export type InferResponse<T extends { response?: Record<number, ContractValidatorSchema> }, Status extends number> = 
  T["response"] extends Record<number, ContractValidatorSchema> 
    ? Status extends keyof T["response"] 
      ? InferFromSchemaOrDefault<T["response"][Status], unknown>
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
