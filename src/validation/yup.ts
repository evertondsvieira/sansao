import type { ValidationAdapter } from "./types.js";

type YupLikeSchema = {
  validateSync: (data: unknown, options?: { abortEarly?: boolean }) => unknown;
  describe?: () => YupDescription;
};

type YupLikeValidationError = {
  path?: unknown;
  inner?: Array<{ path?: unknown }>;
};

export type YupLikeModule = {
  ValidationError: new (...args: unknown[]) => YupLikeValidationError;
};

export type YupValidatorOptions = {
  toJSONSchema?: (schema: unknown) => Record<string, unknown> | null;
};

type YupDescription = {
  type?: unknown;
  nullable?: unknown;
  optional?: unknown;
  tests?: Array<{ name?: unknown; params?: Record<string, unknown> }>;
  fields?: Record<string, YupDescription>;
  innerType?: YupDescription;
  oneOf?: unknown[];
};

export function createYupValidatorAdapter(
  yup: YupLikeModule,
  options: YupValidatorOptions = {}
): ValidationAdapter {
  return {
    name: "yup",
    parse(schema, data) {
      if (!isYupSchema(schema)) {
        return { success: false, error: "Schema is not a Yup schema. Configure matching validator adapter." };
      }

      try {
        return { success: true, data: schema.validateSync(data, { abortEarly: false }) };
      } catch (error) {
        return { success: false, error };
      }
    },
    getErrorPaths(error) {
      if (!(error instanceof yup.ValidationError)) {
        return [];
      }

      const paths = new Set<string>();
      if (typeof error.path === "string" && error.path.length > 0) {
        paths.add(error.path);
      }

      if (Array.isArray(error.inner)) {
        for (const issue of error.inner) {
          if (typeof issue.path === "string" && issue.path.length > 0) {
            paths.add(issue.path);
          }
        }
      }

      return Array.from(paths);
    },
    toJSONSchema(schema) {
      if (options.toJSONSchema) {
        return options.toJSONSchema(schema);
      }
      if (!isYupSchema(schema) || typeof schema.describe !== "function") {
        return null;
      }
      return yupDescriptionToJsonSchema(schema.describe());
    },
  };
}

function isYupSchema(schema: unknown): schema is YupLikeSchema {
  return typeof schema === "object" && schema !== null && typeof (schema as { validateSync?: unknown }).validateSync === "function";
}

function yupDescriptionToJsonSchema(description: YupDescription): Record<string, unknown> {
  const schemaType = typeof description.type === "string" ? description.type : "mixed";
  const base = baseSchemaForYupType(schemaType, description);

  if (Array.isArray(description.oneOf) && description.oneOf.length > 0) {
    const enumValues = description.oneOf.filter((value) => value !== undefined);
    if (enumValues.length > 0) {
      base.enum = enumValues;
    }
  }

  if (description.nullable === true) {
    const currentType = base.type;
    if (typeof currentType === "string") {
      base.type = [currentType, "null"];
    } else if (Array.isArray(currentType) && !currentType.includes("null")) {
      base.type = [...currentType, "null"];
    } else if (!currentType) {
      base.anyOf = [base.anyOf ?? {}, { type: "null" }];
    }
  }

  return base;
}

function baseSchemaForYupType(type: string, description: YupDescription): Record<string, unknown> {
  if (type === "object") {
    const properties: Record<string, unknown> = {};
    const required: string[] = [];

    const fields = description.fields ?? {};
    for (const [key, fieldDescription] of Object.entries(fields)) {
      properties[key] = yupDescriptionToJsonSchema(fieldDescription);
      if (fieldDescription.optional !== true) {
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
    return {
      type: "array",
      items: description.innerType ? yupDescriptionToJsonSchema(description.innerType) : {},
    };
  }

  if (type === "string") {
    const out: Record<string, unknown> = { type: "string" };
    for (const test of description.tests ?? []) {
      if (test?.name === "min" && typeof test.params?.min === "number") {
        out.minLength = test.params.min;
      }
      if (test?.name === "max" && typeof test.params?.max === "number") {
        out.maxLength = test.params.max;
      }
      if (test?.name === "email") {
        out.format = "email";
      }
      if (test?.name === "url") {
        out.format = "uri";
      }
    }
    return out;
  }

  if (type === "number") {
    return { type: "number" };
  }

  if (type === "boolean") {
    return { type: "boolean" };
  }

  if (type === "date") {
    return { type: "string", format: "date-time" };
  }

  return {};
}
