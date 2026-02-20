import type { ValidationAdapter } from "./types.js";
type YupLikeValidationError = {
    path?: unknown;
    inner?: Array<{
        path?: unknown;
    }>;
};
export type YupLikeModule = {
    ValidationError: new (...args: unknown[]) => YupLikeValidationError;
};
export type YupValidatorOptions = {
    toJSONSchema?: (schema: unknown) => Record<string, unknown> | null;
};
export declare function createYupValidatorAdapter(yup: YupLikeModule, options?: YupValidatorOptions): ValidationAdapter;
export {};
//# sourceMappingURL=yup.d.ts.map