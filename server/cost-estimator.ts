import { db } from "./db";
import { eq, and, inArray } from "drizzle-orm";
import {
  tasks,
  projects,
  messages,
  messageLinks,
  comments,
  aiTaskExecutions,
  aiModels,
  sapTransportRequests,
  aiAbapPatterns,
} from "@shared/schema";
import { getUsdEurRate, usdToEur } from "./fx";

export const OUTPUT_MULTIPLIERS: Record<string, number> = {
  development: 2.0,
  analysis: 1.2,
  design: 1.3,
  testing: 1.5,
  documentation: 1.5,
  support: 1.0,
  maintenance: 1.5,
  consulting: 1.0,
  meeting: 0.5,
  other: 1.2,
};

export function countTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function median(nums: number[]): number {
  if (nums.length === 0) return 0;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

function percentile90(nums: number[]): number {
  if (nums.length === 0) return 0;
  const sorted = [...nums].sort((a, b) => a - b);
  const idx = Math.max(0, Math.ceil(0.9 * sorted.length) - 1);
  return sorted[idx];
}

export interface CostEstimate {
  tokensMin: number;
  tokensMax: number;
  costMinEur: number;
  costMaxEur: number;
  basis: "historical" | "heuristic";
  sampleSize: number;
}

export async function estimateTaskCost({
  taskId,
  modelKey: requestedModelKey,
  organizationId,
}: {
  taskId: string;
  modelKey?: string;
  organizationId: string;
}): Promise<CostEstimate> {
  const [taskRow] = await db
    .select()
    .from(tasks)
    .where(eq(tasks.id, taskId))
    .limit(1);
  if (!taskRow) throw new Error("Task not found");

  let projectRow: any = null;
  if (taskRow.projectId) {
    const [proj] = await db
      .select()
      .from(projects)
      .where(eq(projects.id, taskRow.projectId))
      .limit(1);
    projectRow = proj || null;
  }

  const linkedMsgLinks = await db
    .select({ messageId: messageLinks.messageId })
    .from(messageLinks)
    .where((messageLinks as any).taskId ? eq((messageLinks as any).taskId, taskId) : eq(messageLinks.messageId, "never"))
    .catch(() => [] as any[]);

  const linkedMsgIds = linkedMsgLinks.map((l: any) => l.messageId).filter(Boolean);
  let linkedMessages: any[] = [];
  if (linkedMsgIds.length > 0) {
    linkedMessages = await db
      .select({ subject: messages.subject, content: messages.body })
      .from(messages)
      .where(inArray(messages.id, linkedMsgIds))
      .limit(10)
      .catch(() => []);
  }

  const taskComments = await db
    .select({ content: comments.content })
    .from(comments)
    .where(eq((comments as any).taskId, taskId))
    .limit(20)
    .catch(() => [] as any[]);

  let transports: any[] = [];
  if (taskRow.projectId) {
    transports = await db
      .select({ requestNumber: sapTransportRequests.requestNumber, description: sapTransportRequests.description })
      .from(sapTransportRequests)
      .where(
        and(
          eq(sapTransportRequests.projectId, taskRow.projectId),
          eq(sapTransportRequests.organizationId, organizationId)
        )
      )
      .limit(5)
      .catch(() => []);
  }

  const patterns = await db
    .select({ name: aiAbapPatterns.name, codeTemplate: aiAbapPatterns.codeTemplate })
    .from(aiAbapPatterns)
    .where(
      and(
        eq(aiAbapPatterns.organizationId, organizationId),
        eq(aiAbapPatterns.isActive, true)
      )
    )
    .limit(5)
    .catch(() => [] as any[]);

  const parts: string[] = [
    `Task: ${taskRow.title}`,
    taskRow.description ? `Description: ${taskRow.description}` : "",
    projectRow ? `Project: ${projectRow.name}\n${projectRow.description || ""}` : "",
    ...linkedMessages.map(
      (m: any) =>
        `Message: ${m.subject || ""} ${(m.content || "").substring(0, 500)}`
    ),
    ...taskComments.map(
      (c: any) => `Comment: ${(c.content || "").substring(0, 200)}`
    ),
    ...transports.map(
      (t: any) =>
        `Transport: ${t.requestNumber || ""} ${t.description || ""}`
    ),
    ...patterns.map(
      (p: any) =>
        `Pattern: ${p.name}\n${(p.codeTemplate || "").substring(0, 300)}`
    ),
  ];
  const promptText = parts.filter(Boolean).join("\n");

  const PROMPT_OVERHEAD_CHARS = 5200;
  const inputTokens =
    countTokens(promptText) + Math.ceil(PROMPT_OVERHEAD_CHARS / 4);

  const effectiveModelKey = requestedModelKey || "openai/gpt-4o";

  const [modelRow] = await db
    .select({
      inputPricePerMToken: aiModels.inputPricePerMToken,
      outputPricePerMToken: aiModels.outputPricePerMToken,
    })
    .from(aiModels)
    .where(eq(aiModels.modelKey, effectiveModelKey))
    .limit(1);

  const inputPrice = modelRow?.inputPricePerMToken
    ? parseFloat(modelRow.inputPricePerMToken as string)
    : 2.5;
  const outputPrice = modelRow?.outputPricePerMToken
    ? parseFloat(modelRow.outputPricePerMToken as string)
    : 10.0;

  const multiplier =
    OUTPUT_MULTIPLIERS[taskRow.taskType || "other"] ?? 1.2;
  const heuristicOutputTokens = Math.ceil(inputTokens * multiplier);
  const heuristicTotal = inputTokens + heuristicOutputTokens;

  const history = await db
    .select({
      promptTokens: aiTaskExecutions.promptTokens,
      completionTokens: aiTaskExecutions.completionTokens,
    })
    .from(aiTaskExecutions)
    .innerJoin(tasks, eq(aiTaskExecutions.taskId, tasks.id))
    .where(
      and(
        eq(aiTaskExecutions.organizationId, organizationId),
        eq(aiTaskExecutions.status, "completed"),
        eq((aiTaskExecutions as any).modelKey, effectiveModelKey),
        eq(tasks.taskType, taskRow.taskType || "other")
      )
    )
    .limit(200)
    .catch(() => [] as any[]);

  const validHistory = history.filter(
    (h) => h.promptTokens != null && h.completionTokens != null
  );
  const sampleSize = validHistory.length;

  let tokensMin: number;
  let tokensMax: number;
  let basis: "historical" | "heuristic";

  if (sampleSize >= 5) {
    basis = "historical";
    const totals = validHistory.map(
      (h) => (h.promptTokens || 0) + (h.completionTokens || 0)
    );
    const med = median(totals);
    const p90 = percentile90(totals);
    tokensMin = Math.max(1, Math.ceil(med * 0.85));
    tokensMax = Math.max(tokensMin, Math.ceil(p90));
  } else {
    basis = "heuristic";
    tokensMin = Math.max(1, Math.ceil(heuristicTotal * 0.7));
    tokensMax = Math.ceil(heuristicTotal * 1.3);
  }

  const avgPricePerMToken = (inputPrice * 0.4 + outputPrice * 0.6);
  const costMinUsd = (tokensMin / 1_000_000) * avgPricePerMToken;
  const costMaxUsd = (tokensMax / 1_000_000) * avgPricePerMToken;

  const fxRate = await getUsdEurRate(organizationId);

  return {
    tokensMin,
    tokensMax,
    costMinEur: parseFloat(usdToEur(costMinUsd, fxRate).toFixed(6)),
    costMaxEur: parseFloat(usdToEur(costMaxUsd, fxRate).toFixed(6)),
    basis,
    sampleSize,
  };
}
