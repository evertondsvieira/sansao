import type { App } from "../core/app.js";
import type { ContractDefinition } from "../types/index.js";
import type { ValidationAdapter } from "../validation/types.js";
type HttpMethodLower = "get" | "post" | "put" | "patch" | "delete" | "head" | "options";
type JsonSchema = Record<string, unknown>;
type OpenApiParameter = {
    name: string;
    in: "path" | "query" | "header";
    required: boolean;
    schema: JsonSchema;
};
type OpenApiOperation = {
    operationId: string;
    summary?: string;
    description?: string;
    parameters?: OpenApiParameter[];
    requestBody?: {
        required?: boolean;
        content: Record<string, {
            schema: JsonSchema;
        }>;
    };
    responses: Record<string, {
        description: string;
        content?: Record<string, {
            schema: JsonSchema;
        }>;
    }>;
};
export type OpenApiDocument = {
    openapi: "3.1.0";
    info: {
        title: string;
        version: string;
        description?: string;
    };
    servers?: Array<{
        url: string;
        description?: string;
    }>;
    paths: Record<string, Partial<Record<HttpMethodLower, OpenApiOperation>>>;
};
export type GenerateOpenApiOptions = {
    title: string;
    version: string;
    description?: string;
    servers?: Array<{
        url: string;
        description?: string;
    }>;
    requestBodyContentTypes?: string[];
    validator?: ValidationAdapter;
};
export declare function generateOpenApi(source: App | readonly ContractDefinition[], options: GenerateOpenApiOptions): OpenApiDocument;
export {};
//# sourceMappingURL=openapi.d.ts.map