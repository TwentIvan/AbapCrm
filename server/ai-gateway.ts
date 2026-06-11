// AI Gateway - Multi-provider AI client with model registry and cost tracking
// All AI calls in this application should go through this gateway.
// No other file should instantiate OpenAI directly.

import OpenAI from "openai";
import { db } from "./db";
import { eq } from "drizzle-orm";
import { aiModels, organizations } from "@shared/schema";

// ── Types ──────────────────────────────────────────────────────────────────────

export interface GatewayMessage {
  role: "system" | "user" | "assistant";
  content: string | Array<{ type: string; text?: string; image_url?: { url: string; detail?: string } }>;
}

export interface GatewayCompleteOptions {
  modelKey?: string;
  messages: GatewayMessage[];
  responseFormat?: { type: "json_object" | "text" };
  tools?: any[];
  maxTokens?: number;
  temperature?: number;
  organizationId?: string;
  /** Identifies the calling service in logs (e.g. "ai-service", "ai-project-agent", "ai-task-executor", "ai-chat") */
  caller?: string;
}

export interface GatewayCompleteResult {
  content: string;
  modelKey: string;
  promptTokens: number;
  completionTokens: number;
  totalCostUsd: number;
  durationMs: number;
}

// ── Default model resolution ───────────────────────────────────────────────────

/**
 * Returns the effective model key to use.
 * Priority: org.settings.aiDefaultModelKey → AI_DEFAULT_MODEL_KEY env var → serviceDefault → "openai/gpt-5"
 *
 * @param organizationId  - optional org context (reads org-level override)
 * @param serviceDefault  - optional per-service fallback (preserves prior hard-coded model behavior)
 */
export async function getDefaultModelKey(
  organizationId?: string,
  serviceDefault?: string
): Promise<string> {
  if (organizationId) {
    try {
      const [org] = await db
        .select({ settings: organizations.settings })
        .from(organizations)
        .where(eq(organizations.id, organizationId))
        .limit(1);

      const orgModelKey = (org?.settings as any)?.aiDefaultModelKey;
      if (orgModelKey && typeof orgModelKey === "string") {
        return orgModelKey;
      }
    } catch (err) {
      console.warn("[AI-GATEWAY] Could not read org settings for model key:", err);
    }
  }

  return process.env.AI_DEFAULT_MODEL_KEY || serviceDefault || "openai/gpt-5";
}

// ── Cost calculation ────────────────────────────────────────────────────────────

async function computeCost(
  modelKey: string,
  promptTokens: number,
  completionTokens: number
): Promise<number> {
  try {
    const [model] = await db
      .select({
        inputPricePerMToken: aiModels.inputPricePerMToken,
        outputPricePerMToken: aiModels.outputPricePerMToken,
      })
      .from(aiModels)
      .where(eq(aiModels.modelKey, modelKey))
      .limit(1);

    if (!model) return 0;

    const inputPrice = parseFloat(model.inputPricePerMToken || "0");
    const outputPrice = parseFloat(model.outputPricePerMToken || "0");
    return (promptTokens / 1_000_000) * inputPrice + (completionTokens / 1_000_000) * outputPrice;
  } catch {
    return 0;
  }
}

// ── Gateway client ─────────────────────────────────────────────────────────────

class AiGateway {
  private getOpenAIClient(baseURL?: string, apiKey?: string): OpenAI {
    return new OpenAI({
      apiKey: apiKey || process.env.OPENAI_API_KEY,
      ...(baseURL ? { baseURL } : {}),
    });
  }

  async complete(opts: GatewayCompleteOptions): Promise<GatewayCompleteResult> {
    const modelKey = opts.modelKey || (await getDefaultModelKey(opts.organizationId));
    const caller = opts.caller || "unknown";
    const startMs = Date.now();

    let client: OpenAI;
    let rawModelId: string;

    // Route: explicit AI_GATEWAY_BASE_URL overrides everything
    if (process.env.AI_GATEWAY_BASE_URL) {
      client = this.getOpenAIClient(
        process.env.AI_GATEWAY_BASE_URL,
        process.env.AI_GATEWAY_API_KEY || process.env.OPENAI_API_KEY
      );
      // When using a gateway, pass the full modelKey as-is (the gateway handles routing)
      rawModelId = modelKey;
    } else if (modelKey.startsWith("openai/")) {
      // Direct OpenAI call — strip the prefix
      client = this.getOpenAIClient();
      rawModelId = modelKey.slice("openai/".length);
    } else {
      throw new Error(
        `[AI-GATEWAY] Cannot route model "${modelKey}": provider requires AI_GATEWAY_BASE_URL to be set.`
      );
    }

    // Build request params
    const params: any = {
      model: rawModelId,
      messages: opts.messages,
    };
    if (opts.responseFormat) params.response_format = opts.responseFormat;
    if (opts.tools) params.tools = opts.tools;
    if (opts.maxTokens) params.max_completion_tokens = opts.maxTokens;
    if (opts.temperature !== undefined) params.temperature = opts.temperature;

    const response = await client.chat.completions.create(params);

    const durationMs = Date.now() - startMs;
    const promptTokens = response.usage?.prompt_tokens || 0;
    const completionTokens = response.usage?.completion_tokens || 0;
    const totalCostUsd = await computeCost(modelKey, promptTokens, completionTokens);

    console.log(
      `[AI-GATEWAY] caller=${caller} model=${modelKey}` +
        ` prompt_tokens=${promptTokens} completion_tokens=${completionTokens}` +
        ` cost=$${totalCostUsd.toFixed(6)} duration=${durationMs}ms`
    );

    return {
      content: response.choices[0]?.message?.content || "",
      modelKey,
      promptTokens,
      completionTokens,
      totalCostUsd,
      durationMs,
    };
  }
}

export const aiGateway = new AiGateway();
