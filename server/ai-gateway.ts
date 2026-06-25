// AI Gateway - Multi-provider AI client with model registry and cost tracking
// All AI calls in this application should go through this gateway.
// No other file should instantiate OpenAI or Anthropic directly.

import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import { db } from "./db";
import { eq } from "drizzle-orm";
import { aiModels, organizations } from "@shared/schema";

// ── Types ──────────────────────────────────────────────────────────────────────

export type GatewayMessage =
  | {
      role: "system" | "user";
      content: string | Array<{ type: string; text?: string; image_url?: { url: string; detail?: string } }>;
    }
  | {
      role: "assistant";
      content?: string | null;
      tool_calls?: Array<{ id: string; type: "function"; function: { name: string; arguments: string } }>;
    }
  | {
      role: "tool";
      content: string;
      tool_call_id: string;
    };

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
  /** Tool calls requested by the model (present when the model chose to invoke tools) */
  toolCalls?: Array<{ id: string; name: string; arguments: any }>;
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

// ── Model ID resolution ───────────────────────────────────────────────────────

async function resolveModelId(modelKey: string): Promise<string> {
  try {
    const [model] = await db
      .select({ modelId: aiModels.modelId })
      .from(aiModels)
      .where(eq(aiModels.modelKey, modelKey))
      .limit(1);
    if (model?.modelId) {
      return sanitizeModelId(model.modelId);
    }
  } catch {}
  const slashIdx = modelKey.indexOf("/");
  return slashIdx >= 0 ? modelKey.slice(slashIdx + 1) : modelKey;
}

function sanitizeModelId(id: string): string {
  return id.replace(/^(claude-[\w-]+-\d+-\d+)-\d{8}$/, "$1");
}

// ── Gateway client ─────────────────────────────────────────────────────────────

class AiGateway {
  private getOpenAIClient(baseURL?: string, apiKey?: string): OpenAI {
    return new OpenAI({
      apiKey: apiKey || process.env.OPENAI_API_KEY,
      ...(baseURL ? { baseURL } : {}),
    });
  }

  private getAnthropicClient(): Anthropic {
    return new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });
  }

  private async completeWithAnthropic(
    opts: GatewayCompleteOptions,
    rawModelId: string,
    modelKey: string,
    caller: string,
    startMs: number
  ): Promise<GatewayCompleteResult> {
    const client = this.getAnthropicClient();

    // Separate system messages from the rest
    const systemParts: string[] = [];
    const anthropicMessages: Anthropic.MessageParam[] = [];

    for (const msg of opts.messages) {
      if (msg.role === "system") {
        const content = Array.isArray(msg.content)
          ? msg.content.map((c: any) => c.text || "").join("\n")
          : (msg.content as string);
        systemParts.push(content);
      } else if (msg.role === "user" || msg.role === "assistant") {
        const content = Array.isArray(msg.content)
          ? msg.content.map((c: any) => c.text || c.image_url?.url || "").join("\n")
          : ((msg as any).content as string) || "";
        anthropicMessages.push({ role: msg.role as "user" | "assistant", content });
      }
    }

    // For JSON mode, append instruction to system prompt
    let systemPrompt = systemParts.join("\n\n");
    if (opts.responseFormat?.type === "json_object") {
      systemPrompt += "\n\nRespond with valid JSON only. Do not include markdown code blocks or any text outside the JSON object.";
    }

    const params: Anthropic.MessageCreateParamsNonStreaming = {
      model: rawModelId,
      max_tokens: opts.maxTokens || 8096,
      messages: anthropicMessages,
      ...(systemPrompt ? { system: systemPrompt } : {}),
    };

    console.log(`[AI-GATEWAY] Anthropic call starting: model=${rawModelId} caller=${caller}`);
    const response = await client.messages.create(params, { timeout: 120_000 });

    const durationMs = Date.now() - startMs;
    const promptTokens = response.usage?.input_tokens || 0;
    const completionTokens = response.usage?.output_tokens || 0;
    const totalCostUsd = await computeCost(modelKey, promptTokens, completionTokens);

    const content = response.content
      .filter((b) => b.type === "text")
      .map((b) => (b as Anthropic.TextBlock).text)
      .join("");

    console.log(
      `[AI-GATEWAY] caller=${caller} model=${modelKey}` +
        ` prompt_tokens=${promptTokens} completion_tokens=${completionTokens}` +
        ` cost=$${totalCostUsd.toFixed(6)} duration=${durationMs}ms`
    );

    return { content, modelKey, promptTokens, completionTokens, totalCostUsd, durationMs };
  }

  async complete(opts: GatewayCompleteOptions): Promise<GatewayCompleteResult> {
    const modelKey = opts.modelKey || (await getDefaultModelKey(opts.organizationId));
    const caller = opts.caller || "unknown";
    const startMs = Date.now();

    // Route: explicit AI_GATEWAY_BASE_URL overrides everything (proxy mode)
    if (process.env.AI_GATEWAY_BASE_URL) {
      const client = this.getOpenAIClient(
        process.env.AI_GATEWAY_BASE_URL,
        process.env.AI_GATEWAY_API_KEY || process.env.OPENAI_API_KEY
      );
      const rawModelId = modelKey;

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

      const rawToolCalls = response.choices[0]?.message?.tool_calls;
      const toolCalls = rawToolCalls?.map((tc) => ({
        id: tc.id,
        name: tc.function.name,
        arguments: (() => {
          try { return JSON.parse(tc.function.arguments); }
          catch { return tc.function.arguments; }
        })(),
      }));

      return {
        content: response.choices[0]?.message?.content || "",
        modelKey,
        promptTokens,
        completionTokens,
        totalCostUsd,
        durationMs,
        ...(toolCalls?.length ? { toolCalls } : {}),
      };
    }

    // Route by provider prefix
    if (modelKey.startsWith("openai/")) {
      const client = this.getOpenAIClient();
      const rawModelId = await resolveModelId(modelKey);

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

      const rawToolCalls = response.choices[0]?.message?.tool_calls;
      const toolCalls = rawToolCalls?.map((tc) => ({
        id: tc.id,
        name: tc.function.name,
        arguments: (() => {
          try { return JSON.parse(tc.function.arguments); }
          catch { return tc.function.arguments; }
        })(),
      }));

      return {
        content: response.choices[0]?.message?.content || "",
        modelKey,
        promptTokens,
        completionTokens,
        totalCostUsd,
        durationMs,
        ...(toolCalls?.length ? { toolCalls } : {}),
      };
    }

    if (modelKey.startsWith("anthropic/")) {
      const rawModelId = await resolveModelId(modelKey);
      return this.completeWithAnthropic(opts, rawModelId, modelKey, caller, startMs);
    }

    throw new Error(
      `[AI-GATEWAY] Cannot route model "${modelKey}": unknown provider. Supported prefixes: openai/, anthropic/. For google/ or deepseek/ set AI_GATEWAY_BASE_URL.`
    );
  }
}

export const aiGateway = new AiGateway();
