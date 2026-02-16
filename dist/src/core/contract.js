/**
 * Creates an immutable route contract definition.
 *
 * Freezing helps prevent accidental runtime mutations after registration.
 */
export function contract(definition) {
    return Object.freeze({ ...definition });
}
/**
 * Factory for HTTP method-specific contract builders.
 */
export function createContract(method) {
    return function contractFactory(path, options = {}) {
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
//# sourceMappingURL=contract.js.map