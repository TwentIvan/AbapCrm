import { db } from "./db";
import { organizations } from "@shared/schema";
import { eq } from "drizzle-orm";

export const DEFAULT_USD_EUR_RATE = 0.92;

export async function getUsdEurRate(organizationId?: string): Promise<number> {
  if (process.env.FX_USD_EUR_OVERRIDE) {
    const rate = parseFloat(process.env.FX_USD_EUR_OVERRIDE);
    if (!isNaN(rate) && rate > 0) return rate;
  }
  if (organizationId) {
    try {
      const [org] = await db
        .select({ settings: organizations.settings })
        .from(organizations)
        .where(eq(organizations.id, organizationId))
        .limit(1);
      const settings = org?.settings as Record<string, any> | null;
      const orgRate = settings?.fxUsdEur;
      if (orgRate !== undefined && orgRate !== null) {
        const parsed = typeof orgRate === "number" ? orgRate : parseFloat(orgRate);
        if (!isNaN(parsed) && parsed > 0) return parsed;
      }
    } catch {
    }
  }
  return DEFAULT_USD_EUR_RATE;
}

export function usdToEur(amountUsd: number, rate: number): number {
  return amountUsd * rate;
}

export async function calculateCostUsd(
  promptTokens: number,
  completionTokens: number,
  inputPricePerMToken: number,
  outputPricePerMToken: number
): Promise<number> {
  return (
    (promptTokens / 1_000_000) * inputPricePerMToken +
    (completionTokens / 1_000_000) * outputPricePerMToken
  );
}
