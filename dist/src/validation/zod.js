import { z } from "zod";
export const zodValidator = {
    name: "zod",
    parse(schema, data) {
        if (!isZodSchema(schema)) {
            return { success: false, error: "Schema is not a Zod schema. Configure createApp({ validator }) for your schema library." };
        }
        const result = schema.safeParse(data);
        return result.success
            ? { success: true, data: result.data }
            : { success: false, error: result.error };
    },
    getErrorPaths(error) {
        if (!(error instanceof z.ZodError)) {
            return [];
        }
        const out = [];
        for (const issue of error.issues) {
            const [firstPath] = issue.path;
            if (typeof firstPath === "string") {
                out.push(firstPath);
            }
        }
        return out;
    },
    toJSONSchema(schema) {
        if (!isZodSchema(schema)) {
            return null;
        }
        const raw = z.toJSONSchema(schema);
        const out = {};
        for (const [key, value] of Object.entries(raw)) {
            if (key !== "$schema") {
                out[key] = value;
            }
        }
        return out;
    },
};
function isZodSchema(schema) {
    return typeof schema === "object" && schema !== null && typeof schema.safeParse === "function";
}
//# sourceMappingURL=zod.js.map