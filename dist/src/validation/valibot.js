export function createValibotValidatorAdapter(valibot, options = {}) {
    return {
        name: "valibot",
        parse(schema, data) {
            const result = valibot.safeParse(schema, data);
            return result.success
                ? { success: true, data: result.output }
                : { success: false, error: result };
        },
        getErrorPaths(error) {
            if (!isObjectRecord(error) || !Array.isArray(error.issues)) {
                return [];
            }
            const paths = [];
            for (const issue of error.issues) {
                if (!isObjectRecord(issue) || !Array.isArray(issue.path)) {
                    continue;
                }
                const [first] = issue.path;
                if (isObjectRecord(first) && typeof first.key === "string") {
                    paths.push(first.key);
                }
            }
            return paths;
        },
        toJSONSchema(schema) {
            if (options.toJSONSchema) {
                return options.toJSONSchema(schema);
            }
            if (!isObjectRecord(schema)) {
                return null;
            }
            return valibotSchemaToJsonSchema(schema);
        },
    };
}
function isObjectRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
function valibotSchemaToJsonSchema(schema) {
    const type = typeof schema.type === "string" ? schema.type : "";
    if (type === "optional" || type === "exact_optional" || type === "undefinedable" || type === "non_optional") {
        const wrapped = isObjectRecord(schema.wrapped) ? schema.wrapped : null;
        return wrapped ? valibotSchemaToJsonSchema(wrapped) : {};
    }
    if (type === "nullable") {
        const wrapped = isObjectRecord(schema.wrapped) ? schema.wrapped : null;
        if (!wrapped) {
            return { type: ["null"] };
        }
        const inner = valibotSchemaToJsonSchema(wrapped);
        const currentType = inner.type;
        if (typeof currentType === "string") {
            return { ...inner, type: [currentType, "null"] };
        }
        if (Array.isArray(currentType)) {
            return currentType.includes("null") ? inner : { ...inner, type: [...currentType, "null"] };
        }
        return { anyOf: [inner, { type: "null" }] };
    }
    if (type === "object") {
        const entries = isObjectRecord(schema.entries) ? schema.entries : {};
        const properties = {};
        const required = [];
        for (const [key, child] of Object.entries(entries)) {
            if (!isObjectRecord(child)) {
                properties[key] = {};
                required.push(key);
                continue;
            }
            properties[key] = valibotSchemaToJsonSchema(child);
            if (!isOptionalValibotSchema(child)) {
                required.push(key);
            }
        }
        return {
            type: "object",
            properties,
            ...(required.length > 0 ? { required } : {}),
        };
    }
    if (type === "array") {
        const item = isObjectRecord(schema.item) ? valibotSchemaToJsonSchema(schema.item) : {};
        return { type: "array", items: item };
    }
    if (type === "union" || type === "variant") {
        const options = Array.isArray(schema.options)
            ? schema.options.filter((entry) => isObjectRecord(entry))
            : [];
        return { anyOf: options.map((entry) => valibotSchemaToJsonSchema(entry)) };
    }
    if (type === "literal") {
        if ("literal" in schema) {
            return { const: schema.literal };
        }
        if ("value" in schema) {
            return { const: schema.value };
        }
    }
    if (type === "picklist" && Array.isArray(schema.options)) {
        return { enum: schema.options };
    }
    if (type === "string") {
        return { type: "string" };
    }
    if (type === "number") {
        return { type: "number" };
    }
    if (type === "boolean") {
        return { type: "boolean" };
    }
    if (type === "null") {
        return { type: "null" };
    }
    return {};
}
function isOptionalValibotSchema(schema) {
    const type = typeof schema.type === "string" ? schema.type : "";
    return type === "optional" || type === "exact_optional" || type === "undefinedable";
}
//# sourceMappingURL=valibot.js.map