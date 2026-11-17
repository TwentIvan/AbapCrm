import type { CookieOptions } from "express-session";

type Env = Record<string, string | undefined>;

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Legge SESSION_COOKIE_SECURE ("true"/"false", "1"/"0"); se assente decide NODE_ENV.
 * Un valore non riconosciuto blocca l'avvio: meglio un errore che un cookie in chiaro per sbaglio.
 */
function resolveSecure(env: Env): boolean {
  const raw = env.SESSION_COOKIE_SECURE?.trim().toLowerCase();
  if (raw === undefined || raw === "") return env.NODE_ENV === "production";
  if (raw === "true" || raw === "1") return true;
  if (raw === "false" || raw === "0") return false;
  throw new Error(`SESSION_COOKIE_SECURE non valido: "${env.SESSION_COOKIE_SECURE}" (usa true o false)`);
}

/**
 * Opzioni del cookie di sessione. In produzione il cookie è `Secure`: il browser lo rimanda solo su HTTPS.
 * Dietro il proxy HTTPS (Coolify/Traefik) serve `trust proxy`, così express-session riconosce la
 * connessione come sicura da X-Forwarded-Proto; su HTTP in chiaro il cookie non viene emesso.
 */
export function sessionCookieOptions(env: Env = process.env): CookieOptions {
  return {
    maxAge: THIRTY_DAYS_MS,
    secure: resolveSecure(env),
    httpOnly: true,
    sameSite: "lax",
  };
}
