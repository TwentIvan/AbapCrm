import { useEffect } from "react";
import type { BotcaveContext } from "@/types/botcave";

// Botcave accetta page e id di 1..40 caratteri [A-Za-z0-9._:-] e un titolo di 1..200 su una riga:
// qui si puliscono i valori, così un contesto non valido non viene scartato dal pannello.
function cleanToken(value: string): string | undefined {
  const cleaned = value.replace(/[^A-Za-z0-9._:-]/g, "-").slice(0, 40);
  return cleaned.length > 0 ? cleaned : undefined;
}

function cleanTitle(value: string | undefined | null): string | undefined {
  if (!value) return undefined;
  const line = value.replace(/\s+/g, " ").trim().slice(0, 200);
  return line.length > 0 ? line : undefined;
}

export function setBotcaveContext(ctx: { page: string; id?: string | number | null; title?: string | null }): void {
  const page = cleanToken(ctx.page) ?? "home";
  const next: BotcaveContext = { page };
  const id = ctx.id != null ? cleanToken(String(ctx.id)) : undefined;
  if (id) next.id = id;
  const title = cleanTitle(ctx.title);
  if (title) next.title = title;
  window.Botcave?.setContext(next);
}

// Contesto della pagina corrente ricavato dall'indirizzo: primo segmento del path, "home" alla radice.
export function setBotcaveRouteContext(pathname: string = window.location.pathname): void {
  const segment = pathname.split("/").filter(Boolean)[0];
  setBotcaveContext({ page: segment ?? "home" });
}

// Contesto di un oggetto aperto (progetto, task, work item); chiuso l'oggetto si torna a quello della pagina.
export function useBotcaveObjectContext(ctx: { page: string; id?: string | number | null; title?: string | null } | null): void {
  const key = ctx ? `${ctx.page}|${ctx.id ?? ""}|${ctx.title ?? ""}` : "";
  useEffect(() => {
    if (!ctx) return;
    setBotcaveContext(ctx);
    return () => setBotcaveRouteContext();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
}
