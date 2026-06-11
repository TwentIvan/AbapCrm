// Seed script for AI providers and models
// Run with: npx tsx scripts/seed-ai-models.ts
// Idempotent: uses upsert by model_key / slug

import { db } from "../server/db";
import { aiProviders, aiModels } from "../shared/schema";
import { eq } from "drizzle-orm";

const providers = [
  { name: "OpenAI", slug: "openai", baseUrl: null, status: "enabled" as const },
  { name: "Anthropic", slug: "anthropic", baseUrl: null, status: "enabled" as const },
  { name: "Google", slug: "google", baseUrl: null, status: "enabled" as const },
  { name: "DeepSeek", slug: "deepseek", baseUrl: null, status: "enabled" as const },
];

const models = [
  // OpenAI
  {
    providerSlug: "openai",
    modelKey: "openai/gpt-5",
    modelId: "gpt-5",
    displayName: "GPT-5",
    inputPricePerMToken: "10.000000",
    outputPricePerMToken: "30.000000",
    capabilities: { toolUse: true, vision: true, json: true, maxContextTokens: 128000 },
    status: "active" as const,
  },
  {
    providerSlug: "openai",
    modelKey: "openai/gpt-4o",
    modelId: "gpt-4o",
    displayName: "GPT-4o",
    inputPricePerMToken: "5.000000",
    outputPricePerMToken: "15.000000",
    capabilities: { toolUse: true, vision: true, json: true, maxContextTokens: 128000 },
    status: "active" as const,
  },
  {
    providerSlug: "openai",
    modelKey: "openai/gpt-4o-mini",
    modelId: "gpt-4o-mini",
    displayName: "GPT-4o Mini",
    inputPricePerMToken: "0.150000",
    outputPricePerMToken: "0.600000",
    capabilities: { toolUse: true, vision: true, json: true, maxContextTokens: 128000 },
    status: "active" as const,
  },
  // Anthropic
  {
    providerSlug: "anthropic",
    modelKey: "anthropic/claude-3-5-sonnet",
    modelId: "claude-3-5-sonnet-20241022",
    displayName: "Claude 3.5 Sonnet",
    inputPricePerMToken: "3.000000",
    outputPricePerMToken: "15.000000",
    capabilities: { toolUse: true, vision: true, json: true, maxContextTokens: 200000 },
    status: "active" as const,
  },
  {
    providerSlug: "anthropic",
    modelKey: "anthropic/claude-3-5-haiku",
    modelId: "claude-3-5-haiku-20241022",
    displayName: "Claude 3.5 Haiku",
    inputPricePerMToken: "0.800000",
    outputPricePerMToken: "4.000000",
    capabilities: { toolUse: true, vision: true, json: true, maxContextTokens: 200000 },
    status: "active" as const,
  },
  // Google
  {
    providerSlug: "google",
    modelKey: "google/gemini-2-0-flash",
    modelId: "gemini-2.0-flash",
    displayName: "Gemini 2.0 Flash",
    inputPricePerMToken: "0.100000",
    outputPricePerMToken: "0.400000",
    capabilities: { toolUse: true, vision: true, json: true, maxContextTokens: 1000000 },
    status: "active" as const,
  },
  {
    providerSlug: "google",
    modelKey: "google/gemini-1-5-pro",
    modelId: "gemini-1.5-pro",
    displayName: "Gemini 1.5 Pro",
    inputPricePerMToken: "3.500000",
    outputPricePerMToken: "10.500000",
    capabilities: { toolUse: true, vision: true, json: true, maxContextTokens: 2000000 },
    status: "active" as const,
  },
  // DeepSeek
  {
    providerSlug: "deepseek",
    modelKey: "deepseek/deepseek-chat",
    modelId: "deepseek-chat",
    displayName: "DeepSeek Chat (V3)",
    inputPricePerMToken: "0.270000",
    outputPricePerMToken: "1.100000",
    capabilities: { toolUse: true, vision: false, json: true, maxContextTokens: 64000 },
    status: "active" as const,
  },
  {
    providerSlug: "deepseek",
    modelKey: "deepseek/deepseek-reasoner",
    modelId: "deepseek-reasoner",
    displayName: "DeepSeek Reasoner (R1)",
    inputPricePerMToken: "0.550000",
    outputPricePerMToken: "2.190000",
    capabilities: { toolUse: false, vision: false, json: true, maxContextTokens: 64000 },
    status: "active" as const,
  },
];

async function seed() {
  console.log("Seeding AI providers and models...");

  // Upsert providers
  const providerIdMap = new Map<string, string>();

  for (const p of providers) {
    const existing = await db
      .select({ id: aiProviders.id })
      .from(aiProviders)
      .where(eq(aiProviders.slug, p.slug))
      .limit(1);

    if (existing.length > 0) {
      await db
        .update(aiProviders)
        .set({ name: p.name, status: p.status, updatedAt: new Date() })
        .where(eq(aiProviders.slug, p.slug));
      providerIdMap.set(p.slug, existing[0].id);
      console.log(`  Updated provider: ${p.name}`);
    } else {
      const [inserted] = await db
        .insert(aiProviders)
        .values({ name: p.name, slug: p.slug, baseUrl: p.baseUrl, status: p.status })
        .returning({ id: aiProviders.id });
      providerIdMap.set(p.slug, inserted.id);
      console.log(`  Inserted provider: ${p.name}`);
    }
  }

  // Upsert models
  for (const m of models) {
    const providerId = providerIdMap.get(m.providerSlug);
    if (!providerId) {
      console.error(`  Provider not found: ${m.providerSlug}`);
      continue;
    }

    const existing = await db
      .select({ id: aiModels.id })
      .from(aiModels)
      .where(eq(aiModels.modelKey, m.modelKey))
      .limit(1);

    const values = {
      providerId,
      modelKey: m.modelKey,
      modelId: m.modelId,
      displayName: m.displayName,
      inputPricePerMToken: m.inputPricePerMToken,
      outputPricePerMToken: m.outputPricePerMToken,
      capabilities: m.capabilities,
      status: m.status,
    };

    if (existing.length > 0) {
      await db
        .update(aiModels)
        .set({ ...values, updatedAt: new Date() })
        .where(eq(aiModels.modelKey, m.modelKey));
      console.log(`  Updated model: ${m.modelKey}`);
    } else {
      await db.insert(aiModels).values(values);
      console.log(`  Inserted model: ${m.modelKey}`);
    }
  }

  console.log("Done.");
  process.exit(0);
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
