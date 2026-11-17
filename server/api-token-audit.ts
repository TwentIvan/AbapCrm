import type { RequestHandler } from "express";
import type { InsertApiTokenWriteAudit } from "../shared/schema";

export interface ApiTokenWriteAuditDeps {
  record(entry: InsertApiTokenWriteAudit): Promise<void>;
  /** Millisecondi correnti, per la durata (iniettabile nei test). */
  clock?: () => number;
}

const WRITE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Esito registrato quando il client chiude la connessione prima della risposta (convenzione nginx). */
export const CLIENT_CLOSED_STATUS = 499;
export const AUDIT_PATH_MAX = 500;
export const AUDIT_USER_AGENT_MAX = 200;

function truncate(value: string, max: number): string {
  return value.length > max ? value.slice(0, max) : value;
}

/** Percorso senza query string né frammento: la query può contenere dati che non vanno conservati. */
export function auditPath(originalUrl: string): string {
  const path = originalUrl.split(/[?#]/, 1)[0] || "/";
  return truncate(path, AUDIT_PATH_MAX);
}

/**
 * Registra ogni scrittura (POST/PUT/PATCH/DELETE) fatta con un token API: token, utente, organizzazione
 * effettiva, metodo, percorso, esito HTTP, durata, IP e user agent. Mai il corpo né la query string.
 * Se il client chiude la connessione prima della risposta, l'esito registrato è 499.
 *
 * Va montato PRIMA del middleware del token: la riga si scrive alla fine della risposta (`finish`), quando
 * `req.apiToken` e l'organizzazione definitiva sono noti; così entrano anche le scritture rifiutate dal
 * middleware stesso (403 route vietata, 429 limite di richieste). Un errore nell'audit non tocca la risposta.
 */
export function createApiTokenWriteAudit(deps: ApiTokenWriteAuditDeps): RequestHandler {
  const clock = deps.clock ?? Date.now;

  return (req, res, next) => {
    if (!WRITE_METHODS.has(req.method.toUpperCase())) return next();
    const start = clock();

    let done = false;
    const write = (statusCode: number) => {
      if (done) return;
      done = true;
      const token = req.apiToken;
      if (!token) return;
      const userId = (req.user as { id?: string } | undefined)?.id;
      if (!userId) return;
      const orgHeader = req.headers["x-organization-id"];
      const organizationId =
        typeof orgHeader === "string" && UUID_PATTERN.test(orgHeader) ? orgHeader : token.organizationId;
      const userAgent = req.get("user-agent");
      const entry: InsertApiTokenWriteAudit = {
        tokenId: token.id,
        userId,
        organizationId: organizationId ?? null,
        method: req.method.toUpperCase(),
        path: auditPath(req.originalUrl || req.url),
        statusCode,
        durationMs: Math.max(0, Math.round(clock() - start)),
        ipAddress: req.ip ?? null,
        userAgent: userAgent ? truncate(userAgent, AUDIT_USER_AGENT_MAX) : null,
      };
      deps.record(entry).catch((error) => {
        // Nel log solo il nome dell'errore: niente dati della richiesta.
        console.error("Audit della scrittura con token API non registrato:", error instanceof Error ? error.name : "errore");
      });
    };
    res.on("finish", () => write(res.statusCode));
    // Connessione chiusa prima della fine della risposta: la scrittura può essere avvenuta lo stesso.
    res.on("close", () => {
      if (!res.writableFinished) write(CLIENT_CLOSED_STATUS);
    });
    next();
  };
}
