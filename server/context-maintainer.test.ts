import { describe, it, expect, vi, beforeEach } from "vitest";

const { complete, startRun } = vi.hoisted(() => ({ complete: vi.fn(), startRun: vi.fn(async () => {}) }));
const rows = [
  [{ id: "t1", projectId: "p1", title: "Titolo" }],
  [{ id: "e1", analysisResult: { summary: "ok", recommendations: ["a", "b", "c"] } }],
];

vi.mock("./db", () => {
  let call = 0;
  const chain = (): any => ({
    from: () => chain(),
    where: () => chain(),
    limit: async () => rows[call++ % 2],
  });
  return { db: { select: () => chain() } };
});
vi.mock("@shared/schema", () => ({ aiTaskExecutions: {}, tasks: {}, contextPacks: {} }));
vi.mock("drizzle-orm", () => ({ eq: () => null, and: () => null }));
vi.mock("./ai-gateway", () => ({ aiGateway: { complete } }));
vi.mock("./botcave/config", () => ({
  getBotcaveConfig: () => ({ url: "https://b", token: "t", organizationId: "org1", userId: "u1", agents: { email: 1, brief: 2 } }),
}));
vi.mock("./botcave/client", () => ({ startBotcaveRun: startRun }));

import { triggerBriefUpdate } from "./context-maintainer";

const flush = () => new Promise((r) => setTimeout(r, 20));

describe("context-maintainer su Botcave", () => {
  beforeEach(() => { complete.mockClear(); startRun.mockClear(); });

  it("con instradamento botcave nessuna chiamata ad aiGateway e una a startBotcaveRun; seconda chiamata entro 10 minuti: nessuna delle due", async () => {
    triggerBriefUpdate("e1", "t1", "org1");
    await flush();
    expect(complete).not.toHaveBeenCalled();
    expect(startRun).toHaveBeenCalledTimes(1);
    triggerBriefUpdate("e1", "t1", "org1");
    await flush();
    expect(complete).not.toHaveBeenCalled();
    expect(startRun).toHaveBeenCalledTimes(1);
  });
});
