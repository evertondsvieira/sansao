import { z } from "zod";
import type { ValidationAdapter } from "./types.js";

export const zodValidator: ValidationAdapter = {
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
    const out: string[] = [];
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
    const raw = z.toJSONSchema(schema) as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(raw)) {
      if (key !== "$schema") {
        out[key] = value;
      }
    }
    return out;
  },
};

function isZodSchema(schema: unknown): schema is z.ZodTypeAny {
  return typeof schema === "object" && schema !== null && typeof (schema as { safeParse?: unknown }).safeParse === "function";
}
