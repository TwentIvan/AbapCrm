// Context Assembler (Phase 5)
// Contesto gerarchico di un task per l'esecuzione AI, filtrato per organizzazione.
// La logica è in assembled-context.ts; qui ci sono solo le letture dal database.

import { db } from "./db";
import { and, desc, eq, isNull } from "drizzle-orm";
import { tasks, projects, contextPacks, taskAgentRuns } from "@shared/schema";
import {
  buildAssembledContext,
  EMPTY_CONTEXT,
  type AssembledContext,
  type AssembledContextDeps,
  type ContextProject,
} from "./assembled-context";

export type { AssembledContext } from "./assembled-context";

const dbDeps: AssembledContextDeps = {
  async getTask(id) {
    const [row] = await db.select().from(tasks).where(eq(tasks.id, id)).limit(1);
    return row ?? null;
  },
  async getProject(id) {
    const [row] = await db.select({
      id: projects.id,
      name: projects.name,
      description: projects.description,
      parentProjectId: projects.parentProjectId,
      organizationId: projects.organizationId,
    }).from(projects).where(eq(projects.id, id)).limit(1);
    return (row as ContextProject | undefined) ?? null;
  },
  async getProjectPack(organizationId, projectId) {
    const [row] = await db.select().from(contextPacks)
      .where(and(
        eq(contextPacks.organizationId, organizationId),
        eq(contextPacks.scopeType, "project"),
        eq(contextPacks.scopeId, projectId),
      ))
      .limit(1);
    return row ?? null;
  },
  async getOrganizationPack(organizationId) {
    const [row] = await db.select().from(contextPacks)
      .where(and(
        eq(contextPacks.organizationId, organizationId),
        eq(contextPacks.scopeType, "organization"),
        isNull(contextPacks.scopeId),
      ))
      .limit(1);
    return row ?? null;
  },
  getAgentRuns(organizationId, taskId, limit) {
    return db.select().from(taskAgentRuns)
      .where(and(eq(taskAgentRuns.organizationId, organizationId), eq(taskAgentRuns.taskId, taskId)))
      .orderBy(desc(taskAgentRuns.createdAt))
      .limit(limit);
  },
};

/** Contesto del task per l'uso interno (esecutore AI, stima dei costi): vuoto se il task non esiste. */
export async function assembleContext({
  taskId,
  tokenBudget = 6000,
}: {
  taskId: string;
  tokenBudget?: number;
}): Promise<AssembledContext> {
  return (await buildAssembledContext(dbDeps, { taskId, tokenBudget })) ?? EMPTY_CONTEXT;
}

/**
 * Contesto del task nel perimetro della richiesta (`organizationIds`):
 * null se il task non esiste o è di un'organizzazione fuori perimetro.
 */
export async function assembleContextInScope({
  taskId,
  tokenBudget = 6000,
  organizationIds,
}: {
  taskId: string;
  tokenBudget?: number;
  organizationIds: string[];
}): Promise<AssembledContext | null> {
  return buildAssembledContext(dbDeps, { taskId, tokenBudget, organizationIds });
}
