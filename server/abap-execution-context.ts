// Pacchetto di esecuzione di un task ABAP per una squadra Botcave che lavora sul nodo locale
// (`GET /api/tasks/:id/abap-execution`). In una sola lettura l'agente riceve il task, il progetto, il sistema
// SAP effettivo (override del task o default del partner), i trasporti e i commenti del task, e dice se il task
// si può eseguire (`readiness`). Nessuna AI e nessuna scrittura: il lavoro sul sistema lo fa il nodo locale
// con i suoi strumenti SAP; l'esito l'agente lo registra con `POST /api/tasks/:id/agent-runs`.
// Niente segreti nel pacchetto: host, SAProuter, credenziali e VPN restano sul nodo.

type StoredTask = {
  id: string;
  organizationId: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  taskType: string;
  projectId: string | null;
  sapSystemId: string | null;
  externalWorkItemId: string | null;
  externalSystem: string | null;
  externalWorkItemUrl: string | null;
  dueDate: Date | string | null;
  estimatedEffort: number | null;
  remainingEffort: number | null;
  completionPercentage: number;
  aiSpec: unknown;
};

type StoredProject = {
  id: string;
  organizationId: string;
  name: string;
  description: string | null;
  clientId: string | null;
};

export type StoredSapSystem = {
  id: string;
  organizationId: string;
  partnerId: string | null;
  name: string;
  systemId: string;
  systemType: string;
  status: string;
  systemNumber: string;
  sapReleaseVersion: string | null;
  landscapeType: string | null;
  landscapeLevel: number | null;
  connectionType: string | null;
  isActive: boolean;
};

type StoredTransport = {
  id: string;
  taskId: string | null;
  sapSystemId: string;
  requestNumber: string;
  description: string;
  type: string;
  status: string;
  includedObjects: string[] | null;
  createdAt: Date | string;
};

type StoredComment = {
  id: string;
  content: string;
  isInternal: boolean;
  createdAt: Date | string;
};

export interface AbapExecutionDeps {
  getTask(id: string): Promise<StoredTask | null>;
  getProject(id: string): Promise<StoredProject | null>;
  getSapSystem(id: string): Promise<StoredSapSystem | null>;
  /** Sistemi SAP del partner (cliente del progetto). */
  getPartnerSapSystems(partnerId: string): Promise<StoredSapSystem[]>;
  /** Trasporti del task e, se c'è, del suo progetto. */
  getTransports(taskId: string, projectId: string | null): Promise<StoredTransport[]>;
  /** Commenti del task. */
  getComments(taskId: string): Promise<StoredComment[]>;
}

export type AbapExecutionBlocker =
  | "task_completed"
  | "no_sap_system"
  | "sap_system_inactive"
  | "sap_system_production";

export type AbapExecutionContext = {
  task: Omit<StoredTask, "sapSystemId" | "organizationId"> & { organizationId: string };
  project: { id: string; name: string; description: string | null } | null;
  sapSystem:
    | {
        id: string;
        name: string;
        sid: string;
        systemType: string;
        systemNumber: string;
        releaseVersion: string | null;
        landscapeType: string | null;
        landscapeLevel: number | null;
        connectionType: string | null;
        source: "task" | "partner-default";
      }
    | null;
  transports: Array<{
    requestNumber: string;
    description: string;
    type: string;
    status: string;
    includedObjects: string[];
    scope: "task" | "project";
  }>;
  comments: Array<{ id: string; content: string; isInternal: boolean; createdAt: Date | string }>;
  /** `ready` falso → l'agente non esegue e registra l'esecuzione come `blocked` con i motivi. */
  readiness: { ready: boolean; blockers: AbapExecutionBlocker[] };
  execution: {
    runner: "botcave-local-node";
    sapSystemId: string | null;
    /** Dove registrare l'esito (running/done/blocked/failed, idempotente con externalRunId). */
    agentRunsPath: string;
  };
};

export type AbapExecutionResult =
  | { status: 200; body: AbapExecutionContext }
  | { status: 404; body: { error: string } };

export const MAX_COMMENTS = 20;
export const MAX_COMMENT_CHARS = 4000;
export const MAX_TRANSPORTS = 20;
const INACTIVE_STATUSES = new Set(["inactive", "maintenance"]);

/**
 * Su un sistema produttivo l'agente non sviluppa. Vale il livello (5 = produzione) se c'è; senza livello il tipo,
 * che però nasce «production» di predefinito: per questo il livello, quando presente, ha la precedenza.
 */
export function isProductionSystem(system: Pick<StoredSapSystem, "landscapeType" | "landscapeLevel">): boolean {
  if (system.landscapeLevel != null) return system.landscapeLevel >= 5;
  return system.landscapeType === "production";
}

/**
 * Sistema SAP effettivo del task, solo dentro l'organizzazione del task: l'override esplicito sul task,
 * altrimenti il sistema attivo del partner del progetto con il livello più basso (1 = sviluppo).
 * Un override di un'altra organizzazione vale come assente (non si ripiega sul partner: il task chiede
 * esplicitamente quel sistema).
 */
export async function resolveAbapSapSystem(
  deps: Pick<AbapExecutionDeps, "getSapSystem" | "getPartnerSapSystems">,
  task: Pick<StoredTask, "organizationId" | "sapSystemId">,
  project: Pick<StoredProject, "clientId"> | null,
): Promise<{ system: StoredSapSystem; source: "task" | "partner-default" } | null> {
  if (task.sapSystemId) {
    const system = await deps.getSapSystem(task.sapSystemId);
    return system && system.organizationId === task.organizationId ? { system, source: "task" } : null;
  }
  if (!project?.clientId) return null;
  const candidates = (await deps.getPartnerSapSystems(project.clientId))
    .filter((s) => s.organizationId === task.organizationId && s.isActive)
    .sort((a, b) => (a.landscapeLevel ?? 99) - (b.landscapeLevel ?? 99));
  return candidates[0] ? { system: candidates[0], source: "partner-default" } : null;
}

const time = (value: Date | string) => new Date(value).getTime();

/** Task nelle organizzazioni della richiesta, altrimenti 404 (senza dire se esiste altrove). */
export async function abapExecutionContext(
  deps: AbapExecutionDeps,
  input: { taskId: string; organizationIds: string[] },
): Promise<AbapExecutionResult> {
  const task = await deps.getTask(input.taskId);
  if (!task || !input.organizationIds.includes(task.organizationId)) {
    return { status: 404, body: { error: "task non trovato" } };
  }

  const projectRow = task.projectId ? await deps.getProject(task.projectId) : null;
  const project = projectRow && projectRow.organizationId === task.organizationId ? projectRow : null;

  const [resolved, transportRows, commentRows] = await Promise.all([
    resolveAbapSapSystem(deps, task, project),
    deps.getTransports(task.id, project?.id ?? null),
    deps.getComments(task.id),
  ]);

  // Trasporti solo su sistemi dell'organizzazione del task (la tabella non ha l'organizzazione).
  const systemIds = Array.from(new Set(transportRows.map((t) => t.sapSystemId)));
  const systems = await Promise.all(systemIds.map((id) => deps.getSapSystem(id)));
  const allowedSystems = new Set(
    systems.filter((s): s is StoredSapSystem => !!s && s.organizationId === task.organizationId).map((s) => s.id),
  );
  const transports = transportRows
    .filter((t) => allowedSystems.has(t.sapSystemId))
    .sort((a, b) => time(b.createdAt) - time(a.createdAt))
    .slice(0, MAX_TRANSPORTS)
    .map((t) => ({
      requestNumber: t.requestNumber,
      description: t.description,
      type: t.type,
      status: t.status,
      includedObjects: t.includedObjects ?? [],
      scope: (t.taskId === task.id ? "task" : "project") as "task" | "project",
    }));

  const comments = [...commentRows]
    .sort((a, b) => time(a.createdAt) - time(b.createdAt))
    .slice(-MAX_COMMENTS)
    .map((c) => ({
      id: c.id,
      content: c.content.length > MAX_COMMENT_CHARS ? c.content.slice(0, MAX_COMMENT_CHARS) : c.content,
      isInternal: c.isInternal,
      createdAt: c.createdAt,
    }));

  const blockers: AbapExecutionBlocker[] = [];
  if (task.status === "completed") blockers.push("task_completed");
  if (!resolved) blockers.push("no_sap_system");
  else {
    if (!resolved.system.isActive || INACTIVE_STATUSES.has(resolved.system.status)) blockers.push("sap_system_inactive");
    if (isProductionSystem(resolved.system)) blockers.push("sap_system_production");
  }

  const { sapSystemId: _sapSystemId, ...taskFields } = task;
  return {
    status: 200,
    body: {
      task: taskFields,
      project: project ? { id: project.id, name: project.name, description: project.description } : null,
      sapSystem: resolved
        ? {
            id: resolved.system.id,
            name: resolved.system.name,
            sid: resolved.system.systemId,
            systemType: resolved.system.systemType,
            systemNumber: resolved.system.systemNumber,
            releaseVersion: resolved.system.sapReleaseVersion,
            landscapeType: resolved.system.landscapeType,
            landscapeLevel: resolved.system.landscapeLevel,
            connectionType: resolved.system.connectionType,
            source: resolved.source,
          }
        : null,
      transports,
      comments,
      readiness: { ready: blockers.length === 0, blockers },
      execution: {
        runner: "botcave-local-node",
        sapSystemId: resolved?.system.id ?? null,
        agentRunsPath: `/api/tasks/${task.id}/agent-runs`,
      },
    },
  };
}
