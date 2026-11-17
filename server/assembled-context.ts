// Contesto assemblato di un task (Phase 5), filtrato per organizzazione.
// Gerarchia: task → progetto → progetti padre (max 5 livelli) → organizzazione.
//
// Tutto ciò che entra nel contesto appartiene all'organizzazione del task:
// - i progetti della catena si fermano al primo progetto di un'altra organizzazione;
// - i context pack si leggono solo dell'organizzazione del task, con lo scope giusto
//   (pack del progetto per i progetti, pack «organization» per l'organizzazione).
// Con `organizationIds` (perimetro della richiesta) un task fuori perimetro non viene assemblato.
// Subito dopo il task entra lo storico delle esecuzioni degli agenti esterni (task_agent_runs), dalla più recente:
// chi riprende il task sa cosa è già stato fatto, con quale esito e dove trovare il risultato.
// Logica pura con dipendenze iniettate; l'accesso al database è in context-assembler.ts.

import { countTokens } from "./tokens";

export interface AssembledContext {
  text: string;
  sections: { label: string; tokens: number }[];
  tokensUsed: number;
}

export interface ContextTask {
  id: string;
  title: string;
  description?: string | null;
  aiSpec?: unknown;
  projectId?: string | null;
  organizationId: string | null;
}

export interface ContextProject {
  id: string;
  name: string;
  description?: string | null;
  parentProjectId?: string | null;
  organizationId: string | null;
}

export interface ContextPackData {
  brief?: string | null;
  decisions?: unknown;
  glossary?: unknown;
  conventions?: string | null;
}

export interface ContextAgentRun {
  agent: string;
  status: string;
  outcome?: string | null;
  detail?: string | null;
  links?: { url: string; label?: string }[] | null;
  startedAt?: Date | string | null;
  finishedAt?: Date | string | null;
  createdAt?: Date | string | null;
}

export interface AssembledContextDeps {
  getTask(id: string): Promise<ContextTask | null>;
  getProject(id: string): Promise<ContextProject | null>;
  /** Pack con scope «project» del progetto, nell'organizzazione indicata. */
  getProjectPack(organizationId: string, projectId: string): Promise<ContextPackData | null>;
  /** Pack con scope «organization» dell'organizzazione. */
  getOrganizationPack(organizationId: string): Promise<ContextPackData | null>;
  /** Ultime esecuzioni di agenti esterni sul task nell'organizzazione indicata, dalla più recente. */
  getAgentRuns?(organizationId: string, taskId: string, limit: number): Promise<ContextAgentRun[]>;
}

export const EMPTY_CONTEXT: AssembledContext = { text: "", sections: [], tokensUsed: 0 };

const MAX_PROJECT_DEPTH = 6;
export const MAX_CONTEXT_RUNS = 5;
const RUNS_BUDGET = 1500;
const RUN_DETAIL_CHARS = 600;

const STATUS_LABEL: Record<string, string> = {
  running: "in corso",
  done: "completata",
  blocked: "bloccata",
  failed: "fallita",
};

function formatWhen(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 16).replace("T", " ");
}

/** Sezione dello storico delle esecuzioni degli agenti esterni (testo markdown), vuota se non ce ne sono. */
export function formatAgentRuns(runs: ContextAgentRun[]): string {
  if (!runs.length) return "";
  let sec = `## STORICO ESECUZIONI AGENTI (${runs.length === 1 ? "ultima" : `ultime ${runs.length}`}, dalla più recente)\n`;
  for (const run of runs) {
    const when = formatWhen(run.finishedAt) ?? formatWhen(run.startedAt) ?? formatWhen(run.createdAt);
    const status = STATUS_LABEL[run.status] ?? run.status;
    sec += `- ${when ? `[${when} UTC] ` : ""}${run.agent} — ${status}${run.outcome ? `: ${run.outcome}` : ""}\n`;
    const detail = run.detail?.trim();
    if (detail) {
      const short = detail.length > RUN_DETAIL_CHARS ? detail.slice(0, RUN_DETAIL_CHARS) + "…" : detail;
      sec += `  ${short.replace(/\s*\n\s*/g, " ")}\n`;
    }
    const links = Array.isArray(run.links) ? run.links : [];
    if (links.length) sec += `  Collegamenti: ${links.map(l => (l.label ? `${l.label} ${l.url}` : l.url)).join(", ")}\n`;
  }
  return sec;
}

function truncateToTokens(text: string, maxTokens: number): string {
  if (countTokens(text) <= maxTokens) return text;
  // Approssimazione: 4 caratteri per token
  const maxChars = maxTokens * 4;
  return text.slice(0, maxChars) + "\n[...troncato per limite budget token...]";
}

/**
 * Contesto assemblato del task, oppure null se il task non esiste, non ha organizzazione
 * o (con `organizationIds`) è fuori dal perimetro della richiesta.
 */
export async function buildAssembledContext(
  deps: AssembledContextDeps,
  input: { taskId: string; tokenBudget?: number; organizationIds?: string[] },
): Promise<AssembledContext | null> {
  const { taskId, tokenBudget = 6000, organizationIds } = input;
  const sections: { label: string; tokens: number; text: string }[] = [];

  // ── 1. Task (sempre incluso, fuori budget) ────────────────────────────────
  const taskRow = await deps.getTask(taskId);
  if (!taskRow || !taskRow.organizationId) return null;
  const orgId = taskRow.organizationId;
  if (organizationIds && !organizationIds.includes(orgId)) return null;

  let taskSection = `## TASK: ${taskRow.title}\n`;
  const spec = taskRow.aiSpec as any;
  if (spec) {
    taskSection += `**Obiettivo:** ${spec.objective || ""}\n`;
    if (spec.inputs?.length) taskSection += `**Input:** ${spec.inputs.join(", ")}\n`;
    if (spec.acceptanceCriteria?.length) taskSection += `**Criteri di accettazione:**\n${spec.acceptanceCriteria.map((c: string) => `- ${c}`).join("\n")}\n`;
    if (spec.openQuestions?.length) taskSection += `**Domande aperte:** ${spec.openQuestions.join("; ")}\n`;
    if (spec.complexity) taskSection += `**Complessità:** ${spec.complexity}\n`;
  } else if (taskRow.description) {
    taskSection += taskRow.description + "\n";
  }
  sections.push({ label: "task", tokens: countTokens(taskSection), text: taskSection });

  let remainingBudget = tokenBudget;

  // ── 1b. Storico delle esecuzioni degli agenti esterni (max 1500 token) ────
  if (deps.getAgentRuns && remainingBudget > 100) {
    const runs = await deps.getAgentRuns(orgId, taskRow.id, MAX_CONTEXT_RUNS);
    const sec = formatAgentRuns(runs.slice(0, MAX_CONTEXT_RUNS));
    if (sec) {
      const truncated = truncateToTokens(sec, Math.min(RUNS_BUDGET, remainingBudget));
      const tkns = countTokens(truncated);
      sections.push({ label: "esecuzioni-agenti", tokens: tkns, text: truncated });
      remainingBudget -= tkns;
    }
  }

  // ── 2. Catena dei progetti, solo dell'organizzazione del task ─────────────
  const projectChain: ContextProject[] = [];
  const seen = new Set<string>();
  let currentId = taskRow.projectId ?? null;
  while (currentId && projectChain.length < MAX_PROJECT_DEPTH && !seen.has(currentId)) {
    seen.add(currentId);
    const proj = await deps.getProject(currentId);
    if (!proj || proj.organizationId !== orgId) break;
    projectChain.push(proj);
    currentId = proj.parentProjectId ?? null;
  }

  // ── 3. Progetto diretto: brief + decisioni + convenzioni (max 2000 token) ─
  if (projectChain[0]) {
    const proj = projectChain[0];
    const budget = Math.min(2000, remainingBudget);
    if (budget > 100) {
      const pack = await deps.getProjectPack(orgId, proj.id);
      let sec = `## PROGETTO: ${proj.name}\n`;
      if (proj.description) sec += proj.description + "\n";
      if (pack) {
        if (pack.brief) sec += `\n**Brief:**\n${pack.brief}\n`;
        const decisions = Array.isArray(pack.decisions) ? (pack.decisions as any[]) : [];
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

  // ── 4. Progetti padre: solo il brief (max 800 token ciascuno) ─────────────
  for (let i = 1; i < projectChain.length && remainingBudget > 100; i++) {
    const proj = projectChain[i];
    const budget = Math.min(800, remainingBudget);
    const pack = await deps.getProjectPack(orgId, proj.id);
    let sec = `## PROGETTO PADRE (L${i}): ${proj.name}\n`;
    if (pack?.brief) sec += pack.brief + "\n";
    else if (proj.description) sec += proj.description + "\n";
    const truncated = truncateToTokens(sec, budget);
    const tkns = countTokens(truncated);
    sections.push({ label: `progetto-padre-L${i}:${proj.name}`, tokens: tkns, text: truncated });
    remainingBudget -= tkns;
  }

  // ── 5. Pack dell'organizzazione: convenzioni + glossario (max 500 token) ──
  if (remainingBudget > 50) {
    const orgPack = await deps.getOrganizationPack(orgId);
    const glossary = orgPack?.glossary && typeof orgPack.glossary === "object"
      ? (orgPack.glossary as Record<string, string>)
      : {};
    if (orgPack && (orgPack.conventions || Object.keys(glossary).length)) {
      const budget = Math.min(500, remainingBudget);
      let sec = `## CONTESTO ORGANIZZAZIONE\n`;
      if (orgPack.conventions) sec += `**Convenzioni globali:**\n${orgPack.conventions}\n`;
      if (Object.keys(glossary).length) {
        sec += `**Glossario:** ${Object.entries(glossary).map(([k, v]) => `${k}=${v}`).join(", ")}\n`;
      }
      const truncated = truncateToTokens(sec, budget);
      const tkns = countTokens(truncated);
      sections.push({ label: "organizzazione", tokens: tkns, text: truncated });
      remainingBudget -= tkns;
    }
  }

  // ── Testo finale ──────────────────────────────────────────────────────────
  return {
    text: sections.map(s => s.text).join("\n"),
    sections: sections.map(({ label, tokens }) => ({ label, tokens })),
    tokensUsed: sections.reduce((sum, s) => sum + s.tokens, 0),
  };
}
