import type { BotcaveConfig, BotcaveFunction } from "./config";

// Avvia una run su Botcave. Non lancia mai: registra solo un esito di errore,
// senza token né contenuto dell'input.
export async function startBotcaveRun(
  config: BotcaveConfig,
  fn: BotcaveFunction,
  ref: { type: string; id: string },
  input: string,
  deps: { fetch?: typeof fetch; log?: (line: string) => void } = {},
): Promise<void> {
  const doFetch = deps.fetch ?? fetch;
  const log = deps.log ?? ((line: string) => console.warn(line));
  const fail = (what: string) => log(`[Botcave] ${fn} ${ref.type}:${ref.id} fallita: ${what}`);
  const agentId = config.agents[fn];
  if (!agentId) return fail("agente non configurato");
  try {
    const res = await doFetch(`${config.url}/api/agents/${agentId}/runs`, {
      method: "POST",
      headers: { Authorization: `Bearer ${config.token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ input }),
      redirect: "manual",
      signal: AbortSignal.timeout(10_000),
    });
    // Il corpo non serve: si cancella per non tenere occupato il socket.
    try { await res.body?.cancel(); } catch { /* ignorato */ }
    if (res.status !== 202) fail(String(res.status));
  } catch {
    fail("rete");
  }
}
