// Brief di progetto aggiornato dall'agente Botcave dopo ogni esecuzione (`GET`/`PUT /api/projects/:id/brief`).
// The Hub Up non riscrive più il brief al suo interno: l'agente legge il brief attuale con i task del progetto
// cambiati dall'ultimo aggiornamento, scrive il brief nuovo (e al più qualche decisione) e The Hub Up lo salva
// nel context pack del progetto. Nessuna AI interna. Perimetro: le organizzazioni della richiesta (anche token);
// progetto fuori perimetro = 404. Concorrenza ottimistica con `expectedUpdatedAt` (409 se il brief è cambiato).

import { z } from "zod";

export const MAX_BRIEF_CHARS = 8000;
export const MAX_DECISIONS = 30;
export const MAX_NEW_DECISIONS = 5;
export const MAX_DECISION_CHARS = 1000;
export const MAX_CHANGED_TASKS = 20;

export type BriefDecision = { date: string; text: string; sourceTaskId?: string };

export type StoredPack = {
  id: string;
  organizationId: string;
  brief: string | null;
  conventions: string | null;
  decisions: unknown;
  glossary: unknown;
  updatedAt: Date | string | null;
  updatedBy: string | null;
};

type StoredProject = { id: string; organizationId: string; name: string };

type StoredTask = {
  id: string;
  projectId: string | null;
  title: string;
  status: string;
  updatedAt: Date | string;
};

export interface ProjectBriefDeps {
  getProject(id: string): Promise<StoredProject | null>;
  /** Context pack del progetto (scope `project`) nell'organizzazione del progetto. */
  getPack(organizationId: string, projectId: string): Promise<StoredPack | null>;
  /** Task del progetto aggiornati dopo `since` (tutti se null), i più recenti per primi, al massimo `limit`. */
  getChangedTasks(projectId: string, since: Date | null, limit: number): Promise<StoredTask[]>;
  getTask(id: string): Promise<{ id: string; projectId: string | null } | null>;
  /** Crea o aggiorna il context pack del progetto e restituisce la riga salvata. */
  savePack(
    organizationId: string,
    projectId: string,
    existingId: string | null,
    values: { brief: string; decisions: BriefDecision[]; updatedAt: Date; updatedBy: string },
  ): Promise<StoredPack>;
  now?: () => Date;
}

type Result = { status: number; body: unknown };

const isoDate = z
  .string()
  .refine((v) => !Number.isNaN(Date.parse(v)), "data non valida");

export const briefUpdateSchema = z
  .object({
    brief: z.string().trim().min(1).max(MAX_BRIEF_CHARS),
    /** Decisioni nuove da aggiungere in coda (le più vecchie escono oltre MAX_DECISIONS). */
    newDecisions: z.array(z.string().trim().min(1).max(MAX_DECISION_CHARS)).max(MAX_NEW_DECISIONS).optional(),
    /** Task la cui esecuzione ha motivato l'aggiornamento: deve essere del progetto. */
    sourceTaskId: z.string().uuid().optional(),
    /** `updatedAt` del brief letto dall'agente; null = l'agente l'ha letto vuoto (nessun context pack). */
    expectedUpdatedAt: isoDate.nullable().optional(),
  })
  .strict();

function toDate(value: Date | string | null | undefined): Date | null {
  if (value == null) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function decisionsOf(pack: StoredPack | null): BriefDecision[] {
  return Array.isArray(pack?.decisions) ? (pack!.decisions as BriefDecision[]) : [];
}

function view(project: StoredProject, pack: StoredPack | null) {
  return {
    projectId: project.id,
    organizationId: project.organizationId,
    projectName: project.name,
    brief: pack?.brief ?? "",
    conventions: pack?.conventions ?? null,
    decisions: decisionsOf(pack),
    glossary: pack?.glossary && typeof pack.glossary === "object" ? pack.glossary : {},
    updatedAt: toDate(pack?.updatedAt)?.toISOString() ?? null,
    updatedBy: pack?.updatedBy ?? null,
    updatedByAgent: pack?.updatedBy === "agent",
  };
}

async function projectInScope(deps: ProjectBriefDeps, projectId: string, organizationIds: string[]) {
  const project = await deps.getProject(projectId);
  return project && organizationIds.includes(project.organizationId) ? project : null;
}

/** Brief attuale del progetto e task cambiati dopo l'ultimo aggiornamento (da integrare). */
export async function readProjectBrief(
  deps: ProjectBriefDeps,
  input: { projectId: string; organizationIds: string[] },
): Promise<Result> {
  const project = await projectInScope(deps, input.projectId, input.organizationIds);
  if (!project) return { status: 404, body: { error: "Progetto non trovato" } };
  const pack = await deps.getPack(project.organizationId, project.id);
  const since = toDate(pack?.updatedAt);
  const changed = await deps.getChangedTasks(project.id, since, MAX_CHANGED_TASKS);
  return {
    status: 200,
    body: {
      ...view(project, pack),
      changedTasksSinceUpdate: changed.map((t) => ({
        id: t.id,
        title: t.title,
        status: t.status,
        updatedAt: toDate(t.updatedAt)?.toISOString() ?? null,
      })),
    },
  };
}

/** Salva il brief scritto dall'agente (o da un utente con la sessione) nel context pack del progetto. */
export async function updateProjectBrief(
  deps: ProjectBriefDeps,
  input: { projectId: string; organizationIds: string[]; body: unknown; updatedBy: string },
): Promise<Result> {
  const parsed = briefUpdateSchema.safeParse(input.body);
  if (!parsed.success) {
    return { status: 400, body: { error: "Corpo non valido", details: parsed.error.issues } };
  }
  const project = await projectInScope(deps, input.projectId, input.organizationIds);
  if (!project) return { status: 404, body: { error: "Progetto non trovato" } };

  const { brief, newDecisions, sourceTaskId, expectedUpdatedAt } = parsed.data;
  if (sourceTaskId) {
    const task = await deps.getTask(sourceTaskId);
    if (!task || task.projectId !== project.id) {
      return { status: 400, body: { error: "sourceTaskId non è un task del progetto" } };
    }
  }

  const pack = await deps.getPack(project.organizationId, project.id);
  if (expectedUpdatedAt !== undefined) {
    const current = toDate(pack?.updatedAt)?.getTime() ?? null;
    const expected = expectedUpdatedAt === null ? null : new Date(expectedUpdatedAt).getTime();
    if (current !== expected) {
      return {
        status: 409,
        body: { error: "Il brief è cambiato dopo la lettura: rileggilo e riprova", current: view(project, pack) },
      };
    }
  }

  const now = (deps.now ?? (() => new Date()))();
  const date = now.toISOString().slice(0, 10);
  const added: BriefDecision[] = (newDecisions ?? []).map((text) =>
    sourceTaskId ? { date, text, sourceTaskId } : { date, text },
  );
  const decisions = [...decisionsOf(pack), ...added].slice(-MAX_DECISIONS);

  const saved = await deps.savePack(project.organizationId, project.id, pack?.id ?? null, {
    brief,
    decisions,
    updatedAt: now,
    updatedBy: input.updatedBy,
  });
  return { status: 200, body: view(project, saved) };
}
