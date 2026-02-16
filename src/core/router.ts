import type { ContractDefinition, RouteMatch } from "../types/index.js";

/**
 * Simple in-memory router with path-parameter support.
 *
 * Resolution strategy:
 * - method must match first
 * - if multiple paths match, choose the one with more static segments
 */
export class Router {
  private routes: Map<string, ContractDefinition> = new Map();

  /** Registers a contract route in the lookup table. */
  register(contract: ContractDefinition): void {
    const key = this.getRouteKey(contract.method, contract.path);
    this.routes.set(key, contract);
  }

  /** Finds the best route match for an HTTP method + pathname. */
  find(method: string, pathname: string): RouteMatch | null {
    let bestMatch: RouteMatch | null = null;
    let bestStaticSegments = -1;

    for (const [key, contract] of this.routes) {
      const parts = key.split(":");
      const routeMethod = parts[0];
      const routePath = parts.slice(1).join(":");
      
      if (routeMethod !== method) continue;

      const params = this.matchPath(routePath, pathname);
      if (params !== null) {
        // Prefer the route with more static segments (more specific match).
        const staticSegments = routePath
          .split("/")
          .filter(Boolean)
          .filter((segment) => !segment.startsWith(":")).length;

        if (staticSegments > bestStaticSegments) {
          bestMatch = { contract, params };
          bestStaticSegments = staticSegments;
        }
      }
    }

    return bestMatch;
  }

  private getRouteKey(method: string, path: string): string {
    return `${method}:${path}`;
  }

  /**
   * Matches a concrete pathname against a contract path pattern.
   * Returns extracted params on success, otherwise null.
   */
  private matchPath(routePath: string, pathname: string): Record<string, string> | null {
    const routeParts = routePath.split("/").filter(Boolean);
    const pathParts = pathname.split("/").filter(Boolean);

    if (routeParts.length !== pathParts.length) {
      return null;
    }

    const params: Record<string, string> = {};

    for (let i = 0; i < routeParts.length; i++) {
      const routePart = routeParts[i]!;
      const pathPart = pathParts[i]!;

      if (routePart.startsWith(":")) {
        const paramName = routePart.slice(1);
        try {
          // Decode each dynamic segment; invalid encoding invalidates the match.
          params[paramName] = decodeURIComponent(pathPart);
        } catch {
          return null;
        }
      } else if (routePart !== pathPart) {
        return null;
      }
    }

    return params;
  }

  getAllContracts(): ContractDefinition[] {
    return Array.from(this.routes.values());
  }
}
