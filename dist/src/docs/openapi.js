import { zodValidator } from "../validation/zod.js";
export function generateOpenApi(source, options) {
    const contracts = isContractArray(source) ? source : source.getContracts();
    const validator = options.validator ?? (isContractArray(source) ? zodValidator : source.getValidator());
    const requestBodyContentTypes = options.requestBodyContentTypes ?? ["application/json"];
    const doc = {
        openapi: "3.1.0",
        info: {
            title: options.title,
            version: options.version,
            ...(options.description ? { description: options.description } : {}),
        },
        paths: {},
        ...(options.servers ? { servers: options.servers } : {}),
    };
    for (const contract of contracts) {
        const path = toOpenApiPath(contract.path);
        const method = contract.method.toLowerCase();
        const pathItem = (doc.paths[path] ??= {});
        const operation = {
            operationId: buildOperationId(contract.method, contract.path),
            responses: buildResponses(contract, validator),
        };
        const parameters = [
            ...buildParameters(contract.params, "path", validator),
            ...buildParameters(contract.query, "query", validator),
            ...buildParameters(contract.headers, "header", validator),
        ];
        const mergedParameters = mergePathParameters(parameters, contract.path);
        if (mergedParameters.length > 0) {
            operation.parameters = mergedParameters;
        }
        if (contract.body && supportsRequestBody(contract.method)) {
            operation.requestBody = {
                required: !isOptionalRequestBody(contract.body, validator),
                content: Object.fromEntries(requestBodyContentTypes.map((type) => [type, { schema: toJsonSchema(contract.body, validator) }])),
            };
        }
        const meta = contract.meta;
        if (meta && typeof meta === "object") {
            if (typeof meta.summary === "string") {
                operation.summary = meta.summary;
            }
            if (typeof meta.description === "string") {
                operation.description = meta.description;
            }
        }
        pathItem[method] = operation;
    }
    return doc;
}
function toOpenApiPath(path) {
    return path.replace(/:([A-Za-z0-9_]+)/g, "{$1}");
}
function buildOperationId(method, path) {
    const normalizedPath = path
        .replace(/^\//, "")
        .replace(/[:{}]/g, "")
        .replace(/[^\w/]+/g, "")
        .split("/")
        .filter(Boolean)
        .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
        .join("");
    return `${method.toLowerCase()}${normalizedPath || "Root"}`;
}
function buildParameters(schema, location, validator) {
    if (!schema) {
        return [];
    }
    const jsonSchema = toJsonSchema(schema, validator);
    const properties = isObjectRecord(jsonSchema.properties) ? jsonSchema.properties : {};
    const requiredSet = new Set(Array.isArray(jsonSchema.required) ? jsonSchema.required : []);
    return Object.entries(properties).map(([name, propertySchema]) => ({
        name,
        in: location,
        required: location === "path" ? true : requiredSet.has(name),
        schema: isObjectRecord(propertySchema) ? propertySchema : {},
    }));
}
function mergePathParameters(existing, path) {
    const merged = [...existing];
    const declaredPathParamNames = new Set(merged.filter((param) => param.in === "path").map((param) => param.name));
    for (const name of extractPathParamNames(path)) {
        if (!declaredPathParamNames.has(name)) {
            merged.unshift({
                name,
                in: "path",
                required: true,
                schema: { type: "string" },
            });
        }
    }
    for (const param of merged) {
        if (param.in === "path") {
            param.required = true;
        }
    }
    return merged;
}
function extractPathParamNames(path) {
    const matches = path.matchAll(/:([A-Za-z0-9_]+)/g);
    const names = new Set();
    for (const match of matches) {
        const name = match[1];
        if (name) {
            names.add(name);
        }
    }
    return Array.from(names);
}
function buildResponses(contract, validator) {
    if (!contract.response || Object.keys(contract.response).length === 0) {
        return {
            "200": {
                description: "Success",
            },
        };
    }
    const responses = {};
    for (const [status, schema] of Object.entries(contract.response)) {
        responses[status] = {
            description: `HTTP ${status} response`,
            content: {
                "application/json": {
                    schema: toJsonSchema(schema, validator),
                },
            },
        };
    }
    return responses;
}
function toJsonSchema(schema, validator) {
    if (!validator.toJSONSchema) {
        throw new Error(`Validator '${validator.name}' does not support OpenAPI schema conversion. ` +
            "Provide adapter.toJSONSchema for docs generation.");
    }
    const raw = validator.toJSONSchema(schema);
    if (!raw) {
        throw new Error(`Validator '${validator.name}' could not convert contract schema to JSON Schema.`);
    }
    return omitKey(raw, "$schema");
}
function omitKey(input, key) {
    const out = {};
    for (const [k, v] of Object.entries(input)) {
        if (k !== key) {
            out[k] = v;
        }
    }
    return out;
}
function isObjectRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
function isContractArray(input) {
    return Array.isArray(input);
}
function supportsRequestBody(method) {
    return method === "POST" || method === "PUT" || method === "PATCH" || method === "DELETE";
}
function isOptionalRequestBody(schema, validator) {
    const result = validator.parse(schema, undefined);
    return result.success;
}
//# sourceMappingURL=openapi.js.map