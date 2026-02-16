import type { ContractDefinition } from "../types/index.js";
import { Context } from "./context.js";

/**
 * Runtime handler signature bound to a specific contract.
 */
export type HandlerFunction<TContract extends ContractDefinition> = (
  ctx: Context<TContract>
) => Promise<Response> | Response;

/**
 * Pairing between a contract and its implementation.
 */
export type Handler<TContract extends ContractDefinition = ContractDefinition> = {
  contract: TContract;
  fn: HandlerFunction<TContract>;
};

/**
 * Helper to define a typed handler while preserving contract inference.
 */
export function defineHandler<TContract extends ContractDefinition>(
  contract: TContract,
  handler: HandlerFunction<TContract>
): Handler<TContract> {
  return {
    contract,
    fn: handler,
  };
}
