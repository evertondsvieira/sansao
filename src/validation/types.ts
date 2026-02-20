export type ValidationResult =
  | { success: true; data: unknown }
  | { success: false; error: unknown };

export type ValidationAdapter = {
  name: string;
  parse(schema: unknown, data: unknown): ValidationResult;
  getErrorPaths?: (error: unknown) => string[];
  toJSONSchema?: (schema: unknown) => Record<string, unknown> | null;
};
