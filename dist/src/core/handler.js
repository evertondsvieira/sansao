import { Context } from "./context.js";
/**
 * Helper to define a typed handler while preserving contract inference.
 */
export function defineHandler(contract, handler) {
    return {
        contract,
        fn: handler,
    };
}
//# sourceMappingURL=handler.js.map