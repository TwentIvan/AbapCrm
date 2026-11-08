import type { Express } from "express";
import type { ApiTokenRow } from "@shared/schema";
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
  now?: () => Date;
}

const NAME_MESSAGE = "nome obbligatorio, al massimo 100 caratteri";
const ALL_ORGS_MESSAGE = "allOrganizations deve essere true o false";

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
}
