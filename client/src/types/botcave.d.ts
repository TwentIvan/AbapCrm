// Pannello Botcave incorporato (script /embed/v1/botcave.js caricato da index.html).
export interface BotcaveContext {
  page: string;
  id?: string;
  title?: string;
}

declare global {
  interface Window {
    Botcave?: {
      setContext(ctx: BotcaveContext): void;
      open(tab?: "alfred" | "pending" | "bulletin" | "lucius"): void;
      close(): void;
    };
  }
}
