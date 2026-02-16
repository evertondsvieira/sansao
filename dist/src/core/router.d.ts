import type { ContractDefinition, RouteMatch } from "../types/index.js";
/**
 * Simple in-memory router with path-parameter support.
 *
 * Resolution strategy:
 * - method must match first
 * - if multiple paths match, choose the one with more static segments
 */
export declare class Router {
    private routes;
    /** Registers a contract route in the lookup table. */
    register(contract: ContractDefinition): void;
    /** Finds the best route match for an HTTP method + pathname. */
    find(method: string, pathname: string): RouteMatch | null;
    private getRouteKey;
    /**
     * Matches a concrete pathname against a contract path pattern.
     * Returns extracted params on success, otherwise null.
     */
    private matchPath;
    getAllContracts(): ContractDefinition[];
}
//# sourceMappingURL=router.d.ts.map