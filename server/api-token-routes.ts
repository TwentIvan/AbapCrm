import type { Express } from "express";
import type { ApiTokenRow, ApiTokenWriteAuditRow } from "@shared/schema";
import { generateApiToken, TOKEN_TTL_DAYS } from "./api-tokens";

export interface ApiTokenRouteDeps {
  createApiToken(input: {
    userId: string;
    /** null = «tutte le mie organizzazioni». */
    organizationId: string | null;
    name: string;
    tokenHash: string;
    prefix: string;
    expiresAt: Date;
  }): Promise<ApiTokenRow>;
  listApiTokens(userId: string): Promise<ApiTokenRow[]>;
  revokeApiToken(userId: string, id: number): Promise<boolean>;
  /** Token dell'utente anche revocato o scaduto: l'audit resta consultabile. */
  getApiTokenOfUser(userId: string, id: number): Promise<ApiTokenRow | undefined>;
  listApiTokenWrites(tokenId: number, opts: { limit: number; beforeId?: number }): Promise<ApiTokenWriteAuditRow[]>;
  now?: () => Date;
}

const NAME_MESSAGE = "nome obbligatorio, al massimo 100 caratteri";
const ALL_ORGS_MESSAGE = "allOrganizations deve essere true o false";
const WRITES_DEFAULT_LIMIT = 50;
const WRITES_MAX_LIMIT = 200;

/** Intero positivo in forma decimale, altrimenti null. */
function parsePositiveInt(value: unknown): number | null {
  if (typeof value !== "string" || !/^[0-9]+$/.test(value)) return null;
  const n = Number(value);
  return Number.isSafeInteger(n) && n >= 1 ? n : null;
}

/** Gestione dei token API dell'utente di sessione (con un token le blocca già il middleware). */
export function registerApiTokenRoutes(app: Express, deps: ApiTokenRouteDeps): void {
  const now = deps.now ?? (() => new Date());

  app.get("/api/account/api-tokens", async (req: any, res) => {
    if (!req.isAuthenticated?.() || !req.user) return res.sendStatus(401);
    try {
      const rows = await deps.listApiTokens(req.user.id);
      res.json(
        rows.map((r) => ({
          id: r.id,
          name: r.name,
          prefix: r.prefix,
          organizationId: r.organizationId,
          createdAt: r.createdAt,
          expiresAt: r.expiresAt,
          lastUsedAt: r.lastUsedAt,
        })),
      );
    } catch {
      res.status(500).json({ message: "errore interno" });
    }
  });

  app.post("/api/account/api-tokens", async (req: any, res) => {
    if (!req.isAuthenticated?.() || !req.user) return res.sendStatus(401);
    const raw = req.body?.name;
    const name = typeof raw === "string" ? raw.trim() : "";
    if (name.length < 1 || name.length > 100) return res.status(400).json({ message: NAME_MESSAGE });
    // `allOrganizations: true` → token «tutte le mie organizzazioni» (organizationId null): l'organizzazione
    // la indica ogni richiesta. Altrimenti il token vale per l'organizzazione attiva (X-Organization-Id).
    const rawAll = req.body?.allOrganizations;
    const allOrganizations = rawAll === undefined ? false : rawAll;
    if (typeof allOrganizations !== "boolean") return res.status(400).json({ message: ALL_ORGS_MESSAGE });
    const activeOrganizationId = req.headers["x-organization-id"] as string | undefined;
    if (!allOrganizations && !activeOrganizationId) {
      return res.status(400).json({ message: "organizzazione non determinata" });
    }
    const organizationId = allOrganizations ? null : activeOrganizationId!;
    try {
      const { token, hash, prefix } = generateApiToken();
      const expiresAt = new Date(now().getTime() + TOKEN_TTL_DAYS * 86_400_000);
      const row = await deps.createApiToken({
        userId: req.user.id,
        organizationId,
        name,
        tokenHash: hash,
        prefix,
        expiresAt,
      });
      res.status(201).json({
        id: row.id,
        name: row.name,
        prefix: row.prefix,
        organizationId: row.organizationId,
        expiresAt: row.expiresAt,
        token,
      });
    } catch {
      res.status(500).json({ message: "errore interno" });
    }
  });

  app.delete("/api/account/api-tokens/:id", async (req: any, res) => {
    if (!req.isAuthenticated?.() || !req.user) return res.sendStatus(401);
    const idStr = String(req.params.id);
    const id = /^[0-9]+$/.test(idStr) ? Number(idStr) : 0;
    if (!Number.isSafeInteger(id) || id < 1) return res.status(404).json({ message: "token non trovato" });
    try {
      const ok = await deps.revokeApiToken(req.user.id, id);
      if (!ok) return res.status(404).json({ message: "token non trovato" });
      res.sendStatus(204);
    } catch {
      res.status(500).json({ message: "errore interno" });
    }
  });

  // Audit delle scritture fatte con il token, dalla più recente. Solo per il proprietario, con la sessione
  // (con un token il prefisso /api/account/api-tokens è già vietato). Paginazione con `before` = id dell'ultima riga.
  app.get("/api/account/api-tokens/:id/writes", async (req: any, res) => {
    if (!req.isAuthenticated?.() || !req.user) return res.sendStatus(401);
    const id = parsePositiveInt(String(req.params.id));
    if (id === null) return res.status(404).json({ message: "token non trovato" });
    const rawLimit = req.query.limit;
    const rawBefore = req.query.before;
    const limit = rawLimit === undefined ? WRITES_DEFAULT_LIMIT : parsePositiveInt(rawLimit);
    if (limit === null || limit > WRITES_MAX_LIMIT) {
      return res.status(400).json({ message: `limit deve essere un intero tra 1 e ${WRITES_MAX_LIMIT}` });
    }
    const beforeId = rawBefore === undefined ? undefined : parsePositiveInt(rawBefore);
    if (beforeId === null) return res.status(400).json({ message: "before deve essere un intero positivo" });
    try {
      const token = await deps.getApiTokenOfUser(req.user.id, id);
      if (!token) return res.status(404).json({ message: "token non trovato" });
      // Una riga in più per sapere se c'è una pagina successiva.
      const rows = await deps.listApiTokenWrites(id, { limit: limit + 1, beforeId });
      const items = rows.slice(0, limit).map((r) => ({
        id: r.id,
        method: r.method,
        path: r.path,
        statusCode: r.statusCode,
        durationMs: r.durationMs,
        organizationId: r.organizationId,
        ipAddress: r.ipAddress,
        userAgent: r.userAgent,
        createdAt: r.createdAt,
      }));
      res.json({ items, nextBefore: rows.length > limit ? items[items.length - 1].id : null });
    } catch {
      res.status(500).json({ message: "errore interno" });
    }
  });
}
