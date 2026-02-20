import type { ValidationAdapter } from "./types.js";
type ValibotLikeModule = {
    safeParse: (schema: unknown, data: unknown) => {
        success: true;
        output: unknown;
    } | {
        success: false;
        issues?: Array<{
            path?: unknown;
        }>;
    };
};
export type ValibotValidatorOptions = {
    toJSONSchema?: (schema: unknown) => Record<string, unknown> | null;
};
export declare function createValibotValidatorAdapter(valibot: ValibotLikeModule, options?: ValibotValidatorOptions): ValidationAdapter;
export {};
//# sourceMappingURL=valibot.d.ts.map