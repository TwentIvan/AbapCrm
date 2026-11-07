import type { BotcaveConfig, BotcaveFunction } from "./config";

// Decide se una funzione AI va a Botcave o resta interna.
export function routeFunction(
  config: BotcaveConfig | null,
  fn: BotcaveFunction,
  owner: { organizationId: string | null; userId?: string | null },
): "botcave" | "internal" {
  if (!config || !config.agents[fn]) return "internal";
  if (!owner.organizationId || owner.organizationId !== config.organizationId) return "internal";
  if (fn === "email" && owner.userId !== config.userId) return "internal";
  return "botcave";
}
