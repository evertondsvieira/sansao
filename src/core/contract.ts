import type { ContractDefinition, HttpMethod } from "../types/index.js";

/**
 * Creates an immutable route contract definition.
 *
 * Freezing helps prevent accidental runtime mutations after registration.
 */
export function contract(definition: ContractDefinition): ContractDefinition {
  return Object.freeze({ ...definition });
}

/**
 * Factory for HTTP method-specific contract builders.
 */
export function createContract(method: HttpMethod) {
  return function contractFactory(
    path: string,
    options: Omit<ContractDefinition, "method" | "path"> = {}
  ): ContractDefinition {
    return contract({
      method,
      path,
      ...options,
    });
  };
}

contract.get = createContract("GET");
contract.post = createContract("POST");
contract.put = createContract("PUT");
contract.patch = createContract("PATCH");
contract.delete = createContract("DELETE");
