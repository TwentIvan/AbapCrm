import type { RequestHandler } from "express";
import type { ApiTokenRow, User } from "../shared/schema";
import {
  TOKEN_MESSAGES,
  TOKEN_RATE_PER_MIN,
  createRateCounter,
  hashApiToken,
  isDeniedForToken,
  readBearerApiToken,
} from "./api-tokens";

declare global {
  namespace Express {
    interface Request {
      /** Valorizzato solo per le richieste autenticate con un token personale. */
      apiToken?: { id: number; organizationId: string };
    }
  }
}

const MINUTE_MS = 60_000;

export interface ApiTokenAuthDeps {
  findActive(hash: string, now: Date): Promise<ApiTokenRow | undefined>;
  touch(id: number, now: Date): Promise<void>;
  getUser(id: string): Promise<User | undefined>;
  getUserOrganizationIds(userId: string): Promise<string[]>;
  now?: () => Date;
}

/**
 * Autentica `Authorization: Bearer thu_…`. Senza un token nel formato atteso non tocca nulla
 * (sessione e companion proseguono come prima). Con il token, questo vince sempre sulla sessione.
 */
export function createApiTokenAuth(deps: ApiTokenAuthDeps): RequestHandler {
  const now = deps.now ?? (() => new Date());
  const rate = createRateCounter(TOKEN_RATE_PER_MIN, MINUTE_MS);
  const lastTouch = new Map<number, number>();

  return async (req, res, next) => {
    const token = readBearerApiToken(req.headers.authorization);
    if (!token) return next();

    const current = now();
    let row: ApiTokenRow | undefined;
    let user: User | undefined;
    let isMember = false;
    try {
      row = await deps.findActive(hashApiToken(token), current);
      if (row) {
        user = await deps.getUser(row.userId);
        if (user) {
          const orgIds = await deps.getUserOrganizationIds(user.id);
          isMember = orgIds.includes(row.organizationId);
        }
      }
    } catch (error) {
      // Nel log solo il nome dell'errore: mai il token né il suo hash.
      console.error("Errore nella verifica del token API:", error instanceof Error ? error.name : "errore");
      return res.status(500).json({ message: "errore interno" });
    }
    if (!row || !user || !isMember) {
      return res.status(401).json({ message: TOKEN_MESSAGES.invalid });
    }

    // Mai segreti su req.user: GET /api/user lo restituisce così com'è.
    const { password: _p, resetToken: _r, resetTokenExpiry: _e, ...safeUser } = user;
    req.user = safeUser as User;
    req.headers["x-organization-id"] = row.organizationId;
    req.headers["x-organization-scope"] = "personal";
    req.apiToken = { id: row.id, organizationId: row.organizationId };

    if (isDeniedForToken(req.method, req.path)) {
      return res.status(403).json({ message: TOKEN_MESSAGES.denied });
    }
    if (!rate.consume(String(row.id), current.getTime())) {
      return res.status(429).json({ message: TOKEN_MESSAGES.rate });
    }

    const last = lastTouch.get(row.id);
    if (last === undefined || current.getTime() - last >= MINUTE_MS) {
      lastTouch.set(row.id, current.getTime());
      deps.touch(row.id, current).catch(() => {});
    }
    next();
  };
}
