// Configurazione di Botcave letta dall'ambiente. Senza configurazione completa
// le funzioni AI restano interne a The Hub Up.
export type BotcaveFunction = "email" | "brief";

export const BOTCAVE_FUNCTIONS: Record<BotcaveFunction, string> = {
  email: "BOTCAVE_AGENT_EMAIL",
  brief: "BOTCAVE_AGENT_BRIEF",
};

export type BotcaveConfig = {
  url: string;
  token: string;
  organizationId: string;
  userId: string;
  agents: Partial<Record<BotcaveFunction, number>>;
};

function validUrl(raw: string, env: NodeJS.ProcessEnv): string | null {
  try {
    const u = new URL(raw);
    const local = u.hostname === "localhost" || u.hostname === "127.0.0.1" || u.hostname === "[::1]";
    if (u.protocol === "https:") return raw.replace(/\/+$/, "");
    if (u.protocol === "http:" && local && env.NODE_ENV !== "production") return raw.replace(/\/+$/, "");
  } catch {
    // indirizzo non valido
  }
  return null;
}

export function readBotcaveConfig(env: NodeJS.ProcessEnv): { config: BotcaveConfig | null; warnings: string[] } {
  const warnings: string[] = [];
  const names = ["BOTCAVE_URL", "BOTCAVE_TOKEN", "BOTCAVE_ORGANIZATION_ID", "BOTCAVE_USER_ID"] as const;
  const missing = names.filter((n) => !env[n]?.trim());
  if (missing.length === names.length && !Object.values(BOTCAVE_FUNCTIONS).some((n) => env[n])) {
    return { config: null, warnings };
  }
  if (missing.length > 0) {
    warnings.push(`Botcave non configurato: mancano ${missing.join(", ")}`);
    return { config: null, warnings };
  }
  const url = validUrl(env.BOTCAVE_URL!.trim(), env);
  if (!url) {
    warnings.push("Botcave non configurato: BOTCAVE_URL deve essere https");
    return { config: null, warnings };
  }
  const agents: Partial<Record<BotcaveFunction, number>> = {};
  for (const fn of Object.keys(BOTCAVE_FUNCTIONS) as BotcaveFunction[]) {
    const name = BOTCAVE_FUNCTIONS[fn];
    const raw = env[name]?.trim();
    if (!raw) continue;
    if (/^[1-9]\d*$/.test(raw) && Number.isSafeInteger(Number(raw))) agents[fn] = Number(raw);
    else warnings.push(`${name} scartata: deve essere un intero positivo`);
  }
  return {
    config: {
      url,
      token: env.BOTCAVE_TOKEN!.trim(),
      organizationId: env.BOTCAVE_ORGANIZATION_ID!.trim(),
      userId: env.BOTCAVE_USER_ID!.trim(),
      agents,
    },
    warnings,
  };
}

let cached: { config: BotcaveConfig | null } | null = null;

// Letta una sola volta da process.env.
export function getBotcaveConfig(): BotcaveConfig | null {
  if (!cached) cached = { config: readBotcaveConfig(process.env).config };
  return cached.config;
}
