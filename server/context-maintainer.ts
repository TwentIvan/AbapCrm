// Context Maintainer (Phase 5)
// After an AI execution completes, asynchronously updates the project's context pack brief.
// Rate limit: max 1 update per project per 10 minutes (in-memory).
// Never throws — errors are logged and swallowed.

import { db } from "./db";
import { eq, and } from "drizzle-orm";
import { aiTaskExecutions, tasks, contextPacks } from "@shared/schema";
import { aiGateway } from "./ai-gateway";

const RATE_LIMIT_MS = 10 * 60 * 1000; // 10 minutes
const MAINTAINER_MODEL = process.env.CONTEXT_MAINTAINER_MODEL_KEY || "openai/gpt-4o-mini";
const MAX_DECISIONS = 30;

// in-memory rate limit: projectId → last update timestamp
const lastUpdateByProject = new Map<string, number>();

export function triggerBriefUpdate(executionId: string, taskId: string, organizationId: string): void {
  // Fire and forget — never awaited by caller
  runBriefUpdate(executionId, taskId, organizationId).catch(err => {
    console.error("[ContextMaintainer] Error updating brief:", err);
  });
}

async function runBriefUpdate(executionId: string, taskId: string, organizationId: string): Promise<void> {
  try {
    // Load task to get projectId
    const [taskRow] = await db.select().from(tasks).where(eq(tasks.id, taskId)).limit(1);
    if (!taskRow?.projectId) return;
    const projectId = taskRow.projectId;

    // Rate limit check
    const now = Date.now();
    const lastUpdate = lastUpdateByProject.get(projectId) ?? 0;
    if (now - lastUpdate < RATE_LIMIT_MS) {
      console.log(`[ContextMaintainer] Skipping update for project ${projectId} (rate limit)`);
      return;
    }
    lastUpdateByProject.set(projectId, now);

    // Load execution result
    const [exec] = await db.select().from(aiTaskExecutions).where(eq(aiTaskExecutions.id, executionId)).limit(1);
    if (!exec) return;

    // Load or create context pack for the project
    let [pack] = await db.select().from(contextPacks)
      .where(and(
        eq(contextPacks.organizationId, organizationId),
        eq(contextPacks.scopeType, "project"),
        eq(contextPacks.scopeId, projectId),
      )).limit(1);

    if (!pack) {
      const [created] = await db.insert(contextPacks).values({
        organizationId,
        scopeType: "project",
        scopeId: projectId,
        brief: "",
        decisions: [],
        glossary: {},
      }).returning();
      pack = created;
    }

    // Build summary of completed execution for the AI
    const analysis = exec.analysisResult as any;
    const execSummary = [
      `Task completato: "${taskRow.title}"`,
      analysis?.summary ? `Risultato: ${analysis.summary}` : "",
      analysis?.recommendations?.length ? `Raccomandazioni: ${analysis.recommendations.slice(0, 2).join("; ")}` : "",
    ].filter(Boolean).join("\n");

    const prompt = `Aggiorna questo brief di progetto (max 300 parole) integrando l'esito del task appena completato.
Aggiungi al massimo 1 decisione se rilevante.
Rispondi SOLO JSON: { "brief": "...", "newDecision": "..." | null }

Brief attuale:
${pack.brief || "(vuoto)"}

Task completato:
${execSummary}`;

    const gwResult = await aiGateway.complete({
      modelKey: MAINTAINER_MODEL,
      messages: [{ role: "user", content: prompt }],
      responseFormat: { type: "json_object" },
      organizationId,
      caller: "context-maintainer/updateBrief",
    });

    let parsed: { brief?: string; newDecision?: string | null } = {};
    try {
      parsed = JSON.parse(gwResult.content || "{}");
    } catch {
      console.error("[ContextMaintainer] Failed to parse AI response");
      return;
    }

    // Update brief + append decision (FIFO 30)
    const currentDecisions = (pack.decisions as any[]) || [];
    let updatedDecisions = currentDecisions;
    if (parsed.newDecision) {
      const newEntry = {
        date: new Date().toISOString().slice(0, 10),
        text: parsed.newDecision,
        sourceTaskId: taskId,
      };
      updatedDecisions = [...currentDecisions, newEntry].slice(-MAX_DECISIONS);
    }

    await db.update(contextPacks)
      .set({
        brief: parsed.brief || pack.brief || "",
        decisions: updatedDecisions,
        updatedAt: new Date(),
        updatedBy: "agent",
      })
      .where(eq(contextPacks.id, pack.id));

    console.log(`[ContextMaintainer] Brief updated for project ${projectId}`);
  } catch (err) {
    console.error("[ContextMaintainer] Unexpected error:", err);
  }
}
