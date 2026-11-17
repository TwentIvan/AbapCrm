import type { Express, RequestHandler } from "express";
import { TOKEN_MESSAGES, TOKEN_RATE_PER_MIN, isDeniedForToken } from "./api-tokens";

/**
 * Contratto OpenAPI delle route aperte ai token API (`thu_…`).
 *
 * Il contratto si ricava dalle route registrate davvero sull'app Express e passa dallo stesso filtro del
 * middleware dei token (`isDeniedForToken`): una route vietata a un token non compare mai, una route nuova
 * compare da sola. Le descrizioni curate stanno in `OPERATION_DOCS`.
 */

export const OPENAPI_PATH = "/api/openapi.json";

const HTTP_METHODS = ["get", "post", "put", "patch", "delete"] as const;
type HttpMethod = (typeof HTTP_METHODS)[number];

export interface RegisteredRoute {
  method: HttpMethod;
  /** Percorso in stile Express, es. `/api/tasks/:id`. */
  path: string;
}

/**
 * Percorsi esclusi dal contratto anche se un token potrebbe raggiungerli: diagnostica e debug non fanno
 * parte dell'API pubblicata.
 */
const UNDOCUMENTED_PREFIXES = ["/api/__", "/api/debug"];

interface OperationDoc {
  summary: string;
  description?: string;
  /** Parametri di query documentati (oltre a quelli di percorso, che si ricavano dal percorso). */
  query?: Array<{ name: string; description: string; schema?: Record<string, unknown> }>;
}

/** Descrizioni delle operazioni principali, per chiave `METODO percorso-express`. */
const OPERATION_DOCS: Record<string, OperationDoc> = {
  "GET /api/openapi.json": { summary: "Questo contratto OpenAPI" },
  "GET /api/user": { summary: "Utente del token (senza segreti)" },

  "GET /api/organizations": { summary: "Organizzazioni dell'utente" },

  "GET /api/projects": { summary: "Elenco dei progetti dell'organizzazione" },
  "GET /api/projects/:id": { summary: "Dettaglio di un progetto" },
  "POST /api/projects": { summary: "Crea un progetto" },
  "PUT /api/projects/:id": { summary: "Aggiorna un progetto" },
  "DELETE /api/projects/:id": { summary: "Elimina un progetto" },
  "GET /api/projects/:id/relationships": { summary: "Entità collegate al progetto" },
  "GET /api/projects/:id/related-data": { summary: "Conteggio dei dati collegati al progetto" },

  "GET /api/tasks": { summary: "Elenco dei task dell'organizzazione" },
  "GET /api/tasks/:id": { summary: "Dettaglio di un task" },
  "GET /api/tasks/project/:projectId": { summary: "Task di un progetto" },
  "POST /api/tasks": {
    summary: "Crea un task",
    description: "Accetta il riferimento al work item esterno (externalSource, externalId, externalUrl).",
  },
  "PUT /api/tasks/:id": { summary: "Aggiorna un task" },
  "DELETE /api/tasks/:id": { summary: "Elimina un task" },
  "GET /api/tasks/:id/assembled-context": { summary: "Contesto assemblato del task" },
  "GET /api/tasks/:id/connection-plan": { summary: "Piano di connessione al sistema SAP del task" },
  "GET /api/tasks/:id/connection-info": { summary: "Dati di connessione del task (VPN e sistema SAP)" },

  "GET /api/partners": { summary: "Elenco dei partner" },
  "GET /api/partners/:id": { summary: "Dettaglio di un partner" },
  "POST /api/partners": { summary: "Crea un partner" },
  "PUT /api/partners/:id": { summary: "Aggiorna un partner" },
  "DELETE /api/partners/:id": { summary: "Elimina un partner" },
  "POST /api/partners/search-or-create": { summary: "Cerca un partner o lo crea se non esiste" },

  "GET /api/contacts": { summary: "Elenco dei contatti" },
  "GET /api/contacts/:id": { summary: "Dettaglio di un contatto" },
  "POST /api/contacts": { summary: "Crea un contatto" },
  "PUT /api/contacts/:id": { summary: "Aggiorna un contatto" },
  "DELETE /api/contacts/:id": { summary: "Elimina un contatto" },

  "GET /api/messages": {
    summary: "Elenco dei messaggi",
    query: [
      {
        name: "summary",
        description: "Con `true` restituisce la lista leggera, senza il corpo dei messaggi.",
        schema: { type: "boolean" },
      },
    ],
  },
  "GET /api/messages/:id": { summary: "Dettaglio di un messaggio" },
  "GET /api/messages/:id/rendered": { summary: "Corpo del messaggio pronto da mostrare" },
  "POST /api/messages": { summary: "Crea un messaggio" },
  "PUT /api/messages/:id": { summary: "Aggiorna un messaggio" },
  "DELETE /api/messages/:id": { summary: "Elimina un messaggio" },
  "POST /api/messages/:id/read": { summary: "Segna il messaggio come letto" },
  "GET /api/messages/unread-count": { summary: "Numero di messaggi non letti" },
  "GET /api/messages/:messageId/attachments/:filename": { summary: "Scarica un allegato del messaggio" },
  "POST /api/messages/:id/apply-suggestion": { summary: "Applica il collegamento suggerito al messaggio" },
  "GET /api/messages/:id/proposals": { summary: "Proposte generate dal messaggio" },
  "POST /api/messages/:messageId/link": { summary: "Collega il messaggio a un record" },
  "GET /api/messages/:messageId/links": { summary: "Collegamenti del messaggio" },
  "POST /api/messages/:messageId/link-bulk": { summary: "Collega il messaggio a più record" },
  "GET /api/messages/linked/:tableName/:recordId": { summary: "Messaggi collegati a un record" },

  "GET /api/message-links/:tableName/:recordId": { summary: "Collegamenti dei messaggi di un record" },
  "POST /api/message-links": { summary: "Crea un collegamento messaggio-record" },
  "PUT /api/message-links/:linkId": { summary: "Aggiorna un collegamento" },
  "DELETE /api/message-links/:linkId": { summary: "Elimina un collegamento" },

  "GET /api/comments": { summary: "Elenco dei commenti" },
  "GET /api/comments/:id": { summary: "Dettaglio di un commento" },
  "GET /api/comments/project/:projectId": { summary: "Commenti di un progetto" },
  "GET /api/comments/task/:taskId": { summary: "Commenti di un task" },
  "GET /api/comments/message/:messageId": { summary: "Commenti di un messaggio" },
  "POST /api/comments": { summary: "Crea un commento" },
  "PUT /api/comments/:id": { summary: "Aggiorna un commento" },
  "DELETE /api/comments/:id": { summary: "Elimina un commento" },

  "GET /api/proposals": { summary: "Elenco delle proposte" },
  "GET /api/proposals/pending-count": { summary: "Numero di proposte in attesa" },
  "GET /api/proposals/:id": { summary: "Dettaglio di una proposta" },
  "POST /api/proposals/:id/apply": { summary: "Approva e applica una proposta" },
  "POST /api/proposals/:id/reject": { summary: "Rifiuta una proposta" },
  "DELETE /api/proposals/:id": { summary: "Elimina una proposta" },
  "GET /api/proposals/:id/discussions": { summary: "Discussione della proposta" },
  "POST /api/proposals/:id/discussions": { summary: "Aggiunge un intervento alla discussione della proposta" },

  "GET /api/sap-systems": { summary: "Elenco dei sistemi SAP" },
  "GET /api/sap-systems/:id": { summary: "Dettaglio di un sistema SAP" },
  "GET /api/sap-systems/partner/:partnerId": { summary: "Sistemi SAP di un partner" },
  "POST /api/sap-systems": { summary: "Crea un sistema SAP" },
  "PUT /api/sap-systems/:id": { summary: "Aggiorna un sistema SAP" },
  "DELETE /api/sap-systems/:id": { summary: "Elimina un sistema SAP" },

  "GET /api/transport-requests": { summary: "Elenco degli ordini di trasporto" },
  "GET /api/transport-requests/:id": { summary: "Dettaglio di un ordine di trasporto" },
  "GET /api/transport-requests/number/:requestNumber": { summary: "Ordine di trasporto per numero" },
  "GET /api/transport-requests/project/:projectId": { summary: "Ordini di trasporto di un progetto" },
  "GET /api/transport-requests/sap-system/:systemId": { summary: "Ordini di trasporto di un sistema SAP" },
  "POST /api/transport-requests": { summary: "Crea un ordine di trasporto" },
  "PUT /api/transport-requests/:id": { summary: "Aggiorna un ordine di trasporto" },
  "DELETE /api/transport-requests/:id": { summary: "Elimina un ordine di trasporto" },

  "GET /api/time-entries": { summary: "Elenco delle registrazioni di tempo" },
  "GET /api/time-entries/task/:taskId": { summary: "Registrazioni di tempo di un task" },
  "POST /api/time-entries": { summary: "Crea una registrazione di tempo" },
  "PUT /api/time-entries/:id": { summary: "Aggiorna una registrazione di tempo" },
  "DELETE /api/time-entries/:id": { summary: "Elimina una registrazione di tempo" },

  "GET /api/context-packs/:scopeType": { summary: "Context pack dell'ambito (senza id)" },
  "GET /api/context-packs/:scopeType/:scopeId": { summary: "Context pack di un'entità" },
  "PUT /api/context-packs/:scopeType": { summary: "Aggiorna il context pack dell'ambito (senza id)" },
  "PUT /api/context-packs/:scopeType/:scopeId": { summary: "Aggiorna il context pack di un'entità" },
};

/**
 * Route registrate sull'app (Express 4): solo quelle con percorso stringa, comprese quelle dei router montati
 * con `app.use("/prefisso", router)` quando il prefisso è ricostruibile.
 */
export function listRegisteredRoutes(app: Express): RegisteredRoute[] {
  const routes: RegisteredRoute[] = [];
  const seen = new Set<string>();
  const stack: any[] = (app as any)._router?.stack ?? [];
  collect(stack, "", routes, seen);
  return routes;
}

function collect(stack: any[], base: string, out: RegisteredRoute[], seen: Set<string>): void {
  for (const layer of stack) {
    if (layer.route) {
      const paths: unknown[] = Array.isArray(layer.route.path) ? layer.route.path : [layer.route.path];
      for (const p of paths) {
        if (typeof p !== "string") continue;
        for (const method of Object.keys(layer.route.methods ?? {})) {
          if (!(HTTP_METHODS as readonly string[]).includes(method)) continue;
          const route = { method: method as HttpMethod, path: base + p };
          const key = `${route.method} ${route.path}`;
          if (seen.has(key)) continue; // la prima registrazione è quella che risponde
          seen.add(key);
          out.push(route);
        }
      }
    } else if (layer.name === "router" && layer.handle?.stack) {
      const prefix = mountPath(layer.regexp);
      if (prefix !== null) collect(layer.handle.stack, base + prefix, out, seen);
    }
  }
}

/** Ricostruisce il prefisso di un router montato da `layer.regexp` (Express 4); null se non è un prefisso fisso. */
function mountPath(regexp: RegExp | undefined): string | null {
  if (!regexp) return null;
  if ((regexp as any).fast_slash) return "";
  const match = regexp.source.match(/^\^((?:\\\/[\w.~-]+)+)\\\/\?\(\?=\\\/\|\$\)$/);
  return match ? match[1].replace(/\\\//g, "/") : null;
}

/**
 * Espande un percorso Express nelle forme OpenAPI: `:id` → `{id}`, i vincoli `:id(\\d+)` si perdono,
 * un parametro finale opzionale `:x?` produce due percorsi (con e senza). Null per percorsi non esprimibili
 * (caratteri jolly).
 */
export function expressPathVariants(path: string): Array<{ expressPath: string; openApiPath: string; params: string[] }> | null {
  if (/[*+]|\(\?/.test(path.replace(/:\w+\([^)]*\)/g, ""))) return null;
  const clean = path.replace(/(:\w+)\([^)]*\)/g, "$1");
  const optional = clean.match(/\/:(\w+)\?$/);
  const forms = optional ? [clean.slice(0, -optional[0].length), clean.slice(0, -1)] : [clean];
  const variants = [];
  for (const form of forms) {
    if (form.includes("?")) return null;
    const params: string[] = [];
    const openApiPath = form.replace(/:(\w+)/g, (_m, name: string) => {
      params.push(name);
      return `{${name}}`;
    });
    variants.push({ expressPath: form, openApiPath: openApiPath || "/", params });
  }
  return variants;
}

/** Vero se l'operazione fa parte del contratto: sotto /api, documentata e aperta ai token. */
export function isTokenOpenRoute(method: string, path: string): boolean {
  if (!path.startsWith("/api/")) return false;
  if (UNDOCUMENTED_PREFIXES.some((p) => path.startsWith(p))) return false;
  // Risorsa variabile (`/api/:x/...`): potrebbe coincidere con una vietata, meglio non pubblicarla.
  if (/^\/api\/[:{]/.test(path)) return false;
  // I parametri diventano un segmento d'esempio: le regole a prefisso non contengono parametri e quelle con
  // un segmento variabile (credenziali SAP, esito dei job) lo accettano qualunque esso sia.
  const sample = path.replace(/\{(\w+)\}/g, "x").replace(/:(\w+)/g, "x");
  return !isDeniedForToken(method, sample);
}

function tagFor(path: string): string {
  return path.split("/")[2] || "api";
}

function operationId(method: string, openApiPath: string): string {
  const parts = openApiPath
    .split("/")
    .filter((s) => s && s !== "api")
    .map((s) => (s.startsWith("{") ? "by-" + s.slice(1, -1) : s));
  const words = [method, ...parts].join("-").split(/[^A-Za-z0-9]+/).filter(Boolean);
  return words.map((w, i) => (i === 0 ? w.toLowerCase() : w[0].toUpperCase() + w.slice(1))).join("");
}

const ERROR_SCHEMA_REF = { $ref: "#/components/schemas/Error" };

function errorResponse(description: string) {
  return { description, content: { "application/json": { schema: ERROR_SCHEMA_REF } } };
}

export interface BuildOptions {
  /** Versione del contratto (info.version). */
  version?: string;
  /** URL del server (servers[0].url); se manca, percorsi relativi all'host che serve il contratto. */
  serverUrl?: string;
}

/** Costruisce il documento OpenAPI 3.1 delle route aperte ai token. */
export function buildTokenOpenApi(routes: RegisteredRoute[], options: BuildOptions = {}) {
  const paths: Record<string, Record<string, unknown>> = {};
  const usedIds = new Set<string>();
  const tags = new Set<string>();

  const sorted = [...routes].sort(
    (a, b) => a.path.localeCompare(b.path) || HTTP_METHODS.indexOf(a.method) - HTTP_METHODS.indexOf(b.method),
  );
  for (const route of sorted) {
    const variants = expressPathVariants(route.path);
    if (!variants) continue;
    for (const v of variants) {
      if (!isTokenOpenRoute(route.method, v.expressPath)) continue;
      const item = (paths[v.openApiPath] ??= {});
      if (item[route.method]) continue;

      let id = operationId(route.method, v.openApiPath);
      for (let n = 2; usedIds.has(id); n++) id = operationId(route.method, v.openApiPath) + n;
      usedIds.add(id);

      const doc = OPERATION_DOCS[`${route.method.toUpperCase()} ${v.expressPath}`];
      const tag = tagFor(v.openApiPath);
      tags.add(tag);
      const isWrite = route.method !== "get";

      const parameters: unknown[] = v.params.map((name) => ({
        name,
        in: "path",
        required: true,
        schema: { type: "string" },
      }));
      for (const q of doc?.query ?? []) {
        parameters.push({ name: q.name, in: "query", required: false, description: q.description, schema: q.schema ?? { type: "string" } });
      }
      parameters.push(
        { $ref: "#/components/parameters/OrganizationId" },
        { $ref: "#/components/parameters/OrganizationScope" },
      );

      const operation: Record<string, unknown> = {
        operationId: id,
        summary: doc?.summary ?? `${route.method.toUpperCase()} ${v.openApiPath}`,
        tags: [tag],
        parameters,
        responses: {
          "200": { description: "Esito della richiesta", content: { "application/json": { schema: {} } } },
          ...(route.method === "post"
            ? { "201": { description: "Risorsa creata", content: { "application/json": { schema: {} } } } }
            : {}),
          ...(isWrite || v.params.length ? { "400": errorResponse("Richiesta non valida") } : {}),
          "401": { $ref: "#/components/responses/Unauthorized" },
          "403": { $ref: "#/components/responses/Forbidden" },
          ...(v.params.length ? { "404": errorResponse("Risorsa non trovata") } : {}),
          "429": { $ref: "#/components/responses/TooManyRequests" },
          "500": errorResponse("Errore interno"),
        },
      };
      if (doc?.description) operation.description = doc.description;
      if (isWrite && route.method !== "delete") {
        operation.requestBody = {
          required: false,
          content: { "application/json": { schema: { type: "object", additionalProperties: true } } },
        };
      }
      item[route.method] = operation;
    }
  }

  return {
    openapi: "3.1.0",
    info: {
      title: "The Hub Up — API per i token",
      version: options.version ?? "1.0.0",
      description: [
        "Operazioni disponibili con un token API personale (`Authorization: Bearer thu_…`).",
        "Il contratto si genera dalle route registrate e usa le stesse regole del middleware dei token:",
        "le route vietate ai token (token, accesso, utenti, credenziali, VPN, posta, AI interna, companion,",
        "scritture su organizzazioni e catalogo MCP) non compaiono.",
        "",
        "Organizzazione: un token legato a una organizzazione ignora `X-Organization-Id` e `X-Organization-Scope`;",
        "un token «tutte le mie organizzazioni» usa `X-Organization-Id` se presente (deve essere un'organizzazione",
        "dell'utente, altrimenti 403), altrimenti l'organizzazione Personal dell'utente.",
        "",
        `Limite: ${TOKEN_RATE_PER_MIN} richieste al minuto per token (oltre, 429). Le scritture fatte con un token`,
        "sono registrate nell'audit del token.",
      ].join("\n"),
    },
    ...(options.serverUrl ? { servers: [{ url: options.serverUrl }] } : {}),
    security: [{ bearerAuth: [] }],
    tags: Array.from(tags).sort().map((name) => ({ name })),
    paths,
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          description: "Token API personale `thu_…`, creato da Account → Token API.",
        },
      },
      parameters: {
        OrganizationId: {
          name: "X-Organization-Id",
          in: "header",
          required: false,
          description: "Organizzazione della richiesta (uuid). Considerato solo con un token «tutte le mie organizzazioni».",
          schema: { type: "string", format: "uuid" },
        },
        OrganizationScope: {
          name: "X-Organization-Scope",
          in: "header",
          required: false,
          description: "`personal` (predefinito) o `all`. Considerato solo con un token «tutte le mie organizzazioni».",
          schema: { type: "string", enum: ["personal", "all"] },
        },
      },
      schemas: {
        Error: {
          type: "object",
          description: "Corpo d'errore: le route usano `message` o `error`.",
          properties: {
            message: { type: "string" },
            error: { type: "string" },
          },
        },
      },
      responses: {
        Unauthorized: {
          description: `Token assente, non valido o scaduto («${TOKEN_MESSAGES.invalid}»)`,
          content: { "application/json": { schema: ERROR_SCHEMA_REF } },
        },
        Forbidden: {
          description: `Operazione o organizzazione non consentita («${TOKEN_MESSAGES.denied}», «${TOKEN_MESSAGES.organization}»)`,
          content: { "application/json": { schema: ERROR_SCHEMA_REF } },
        },
        TooManyRequests: {
          description: `Limite di richieste superato («${TOKEN_MESSAGES.rate}»)`,
          content: { "application/json": { schema: ERROR_SCHEMA_REF } },
        },
      },
    },
  };
}

/**
 * Registra `GET /api/openapi.json` (sessione o token). Il documento si calcola alla prima richiesta, quando
 * tutte le route sono registrate, e poi resta in memoria.
 */
export function registerOpenApiRoute(app: Express, options: BuildOptions = {}): void {
  let cached: ReturnType<typeof buildTokenOpenApi> | null = null;
  const handler: RequestHandler = (req: any, res) => {
    if (!req.isAuthenticated?.() || !req.user) return res.sendStatus(401);
    cached ??= buildTokenOpenApi(listRegisteredRoutes(app), options);
    res.json(cached);
  };
  app.get(OPENAPI_PATH, handler);
}
