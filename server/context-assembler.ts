// Context Assembler (Phase 5)
// Assembles a hierarchical project context for AI task execution.
// Hierarchy: task → project → parentProject* (max 5 levels) → organization

import { db } from "./db";
import { eq } from "drizzle-orm";
import { tasks, projects, contextPacks, organizations } from "@shared/schema";
import { countTokens } from "./cost-estimator";

export interface AssembledContext {
  text: string;
  sections: { label: string; tokens: number }[];
  tokensUsed: number;
}

function truncateToTokens(text: string, maxTokens: number): string {
  if (countTokens(text) <= maxTokens) return text;
  // Approximate: 4 chars per token
  const maxChars = maxTokens * 4;
  return text.slice(0, maxChars) + "\n[...troncato per limite budget token...]";
}

export async function assembleContext({
  taskId,
  tokenBudget = 6000,
}: {
  taskId: string;
  tokenBudget?: number;
}): Promise<AssembledContext> {
  const sections: { label: string; tokens: number; text: string }[] = [];

  // ── 1. Task (always included, outside budget) ──────────────────────────────
  const [taskRow] = await db.select().from(tasks).where(eq(tasks.id, taskId)).limit(1);
  if (!taskRow) return { text: "", sections: [], tokensUsed: 0 };

  let taskSection = `## TASK: ${taskRow.title}\n`;
  const spec = taskRow.aiSpec as any;
  if (spec) {
    taskSection += `**Obiettivo:** ${spec.objective || ""}\n`;
    if (spec.inputs?.length) taskSection += `**Input:** ${spec.inputs.join(", ")}\n`;
    if (spec.acceptanceCriteria?.length) taskSection += `**Criteri di accettazione:**\n${spec.acceptanceCriteria.map((c: string) => `- ${c}`).join("\n")}\n`;
    if (spec.openQuestions?.length) taskSection += `**Domande aperte:** ${spec.openQuestions.join("; ")}\n`;
    if (spec.complexity) taskSection += `**Complessità:** ${spec.complexity}\n`;
  } else {
    if (taskRow.description) taskSection += taskRow.description + "\n";
  }
  sections.push({ label: "task", tokens: countTokens(taskSection), text: taskSection });

  let remainingBudget = tokenBudget;

  // ── 2. Collect project hierarchy ──────────────────────────────────────────
  const projectChain: (typeof projects.$inferSelect)[] = [];
  if (taskRow.projectId) {
    let currentId: string | null | undefined = taskRow.projectId;
    let depth = 0;
    while (currentId && depth < 6) {
      const [proj] = await db.select().from(projects).where(eq(projects.id, currentId)).limit(1);
      if (!proj) break;
      projectChain.push(proj);
      currentId = proj.parentProjectId;
      depth++;
    }
  }

  // ── 3. Direct project: brief + decisions + conventions (max 2000 token) ──
  if (projectChain[0]) {
    const proj = projectChain[0];
    const budget = Math.min(2000, remainingBudget);
    if (budget > 100) {
      const [pack] = await db.select().from(contextPacks)
        .where(eq(contextPacks.scopeId, proj.id)).limit(1);
      let sec = `## PROGETTO: ${proj.name}\n`;
      if (proj.description) sec += proj.description + "\n";
      if (pack) {
        if (pack.brief) sec += `\n**Brief:**\n${pack.brief}\n`;
        const decisions = (pack.decisions as any[]) || [];
        if (decisions.length > 0) {
          sec += `\n**Decisioni recenti:**\n${decisions.slice(-5).map((d: any) => `- ${d.date}: ${d.text}`).join("\n")}\n`;
        }
        if (pack.conventions) sec += `\n**Convenzioni:**\n${pack.conventions}\n`;
      }
      const truncated = truncateToTokens(sec, budget);
      const tkns = countTokens(truncated);
      sections.push({ label: `progetto:${proj.name}`, tokens: tkns, text: truncated });
      remainingBudget -= tkns;
    }
  }

  // ── 4. Parent projects: only brief (max 800 token each) ──────────────────
  for (let i = 1; i < projectChain.length && remainingBudget > 100; i++) {
    const proj = projectChain[i];
    const budget = Math.min(800, remainingBudget);
    const [pack] = await db.select().from(contextPacks)
      .where(eq(contextPacks.scopeId, proj.id)).limit(1);
    let sec = `## PROGETTO PADRE (L${i}): ${proj.name}\n`;
    if (pack?.brief) sec += pack.brief + "\n";
    else if (proj.description) sec += proj.description + "\n";
    const truncated = truncateToTokens(sec, budget);
    const tkns = countTokens(truncated);
    sections.push({ label: `progetto-padre-L${i}:${proj.name}`, tokens: tkns, text: truncated });
    remainingBudget -= tkns;
  }

  // ── 5. Organization context pack: conventions + glossary (max 500 token) ──
  if (taskRow.organizationId && remainingBudget > 50) {
    const [orgPack] = await db.select().from(contextPacks)
      .where(eq(contextPacks.organizationId, taskRow.organizationId))
      .limit(1);
    if (orgPack && (orgPack.conventions || Object.keys((orgPack.glossary as any) || {}).length)) {
      const budget = Math.min(500, remainingBudget);
      let sec = `## CONTESTO ORGANIZZAZIONE\n`;
      if (orgPack.conventions) sec += `**Convenzioni globali:**\n${orgPack.conventions}\n`;
      const glossary = orgPack.glossary as Record<string, string>;
      if (glossary && Object.keys(glossary).length) {
        sec += `**Glossario:** ${Object.entries(glossary).map(([k, v]) => `${k}=${v}`).join(", ")}\n`;
      }
      const truncated = truncateToTokens(sec, budget);
      const tkns = countTokens(truncated);
      sections.push({ label: "organizzazione", tokens: tkns, text: truncated });
      remainingBudget -= tkns;
    }
  }

  // ── Assemble final text ───────────────────────────────────────────────────
  const allText = sections.map(s => s.text).join("\n");
  const totalTokens = sections.reduce((sum, s) => sum + s.tokens, 0);
  return {
    text: allText,
    sections: sections.map(({ label, tokens }) => ({ label, tokens })),
    tokensUsed: totalTokens,
  };
}
