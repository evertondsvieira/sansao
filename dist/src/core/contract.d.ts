import type { ContractDefinition, HttpMethod } from "../types/index.js";
/**
 * Creates an immutable route contract definition.
 *
 * Freezing helps prevent accidental runtime mutations after registration.
 */
export declare function contract(definition: ContractDefinition): ContractDefinition;
export declare namespace contract {
    export var get: (path: string, options?: Omit<ContractDefinition, "method" | "path">) => ContractDefinition;
    export var post: (path: string, options?: Omit<ContractDefinition, "method" | "path">) => ContractDefinition;
    export var put: (path: string, options?: Omit<ContractDefinition, "method" | "path">) => ContractDefinition;
    export var patch: (path: string, options?: Omit<ContractDefinition, "method" | "path">) => ContractDefinition;
    var _a: (path: string, options?: Omit<ContractDefinition, "method" | "path">) => ContractDefinition;
    export { _a as delete };
}
/**
 * Factory for HTTP method-specific contract builders.
 */
export declare function createContract(method: HttpMethod): (path: string, options?: Omit<ContractDefinition, "method" | "path">) => ContractDefinition;
//# sourceMappingURL=contract.d.ts.map