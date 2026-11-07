import { describe, it, expect, vi } from "vitest";
import { readBotcaveConfig, type BotcaveConfig } from "./config";
import { routeFunction } from "./routing";
import { startBotcaveRun } from "./client";

const ENV = {
  BOTCAVE_URL: "https://botcave.example",
  BOTCAVE_TOKEN: "cas_secret",
  BOTCAVE_ORGANIZATION_ID: "org1",
  BOTCAVE_USER_ID: "u1",
  BOTCAVE_AGENT_EMAIL: "12",
  BOTCAVE_AGENT_BRIEF: "13",
};
const CFG: BotcaveConfig = { url: "https://botcave.example", token: "cas_secret", organizationId: "org1", userId: "u1", agents: { email: 12, brief: 13 } };

describe("readBotcaveConfig", () => {
  it("completa → config", () => {
    const { config, warnings } = readBotcaveConfig(ENV);
    expect(config).toEqual(CFG);
    expect(warnings).toEqual([]);
  });
  it("manca BOTCAVE_TOKEN → null con avviso che lo nomina", () => {
    const { BOTCAVE_TOKEN, ...rest } = ENV;
    const r = readBotcaveConfig(rest);
    expect(r.config).toBeNull();
    expect(r.warnings.join(" ")).toContain("BOTCAVE_TOKEN");
  });
  it("id agente 'abc' scartato con avviso", () => {
    const r = readBotcaveConfig({ ...ENV, BOTCAVE_AGENT_EMAIL: "abc" });
    expect(r.config?.agents.email).toBeUndefined();
    expect(r.config?.agents.brief).toBe(13);
    expect(r.warnings.join(" ")).toContain("BOTCAVE_AGENT_EMAIL");
  });
  it("url http non localhost rifiutato", () => {
    expect(readBotcaveConfig({ ...ENV, BOTCAVE_URL: "http://botcave.example" }).config).toBeNull();
    expect(readBotcaveConfig({ ...ENV, BOTCAVE_URL: "http://localhost:3000" }).config).not.toBeNull();
    expect(readBotcaveConfig({ ...ENV, BOTCAVE_URL: "http://localhost:3000", NODE_ENV: "production" }).config).toBeNull();
  });
});

describe("routeFunction", () => {
  it("email stessa organizzazione e utente → botcave", () => {
    expect(routeFunction(CFG, "email", { organizationId: "org1", userId: "u1" })).toBe("botcave");
  });
  it("organizzazione diversa → internal", () => {
    expect(routeFunction(CFG, "email", { organizationId: "org2", userId: "u1" })).toBe("internal");
  });
  it("utente diverso → internal", () => {
    expect(routeFunction(CFG, "email", { organizationId: "org1", userId: "u2" })).toBe("internal");
  });
  it("agente non impostato → internal", () => {
    expect(routeFunction({ ...CFG, agents: { brief: 13 } }, "email", { organizationId: "org1", userId: "u1" })).toBe("internal");
  });
  it("config null → internal", () => {
    expect(routeFunction(null, "brief", { organizationId: "org1" })).toBe("internal");
  });
  it("brief con utente diverso ma stessa organizzazione → botcave", () => {
    expect(routeFunction(CFG, "brief", { organizationId: "org1", userId: "u2" })).toBe("botcave");
  });
});

describe("startBotcaveRun", () => {
  it("chiama l'URL giusto con Bearer e corpo {input}", async () => {
    const fetchMock = vi.fn(async () => new Response("{}", { status: 202 }));
    const log = vi.fn();
    await startBotcaveRun(CFG, "email", { type: "email", id: "5" }, "ciao", { fetch: fetchMock as any, log });
    const [url, init] = fetchMock.mock.calls[0] as any;
    expect(url).toBe("https://botcave.example/api/agents/12/runs");
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe("Bearer cas_secret");
    expect(init.headers["Content-Type"]).toBe("application/json");
    expect(JSON.parse(init.body)).toEqual({ input: "ciao" });
    expect(init.redirect).toBe("manual");
    expect(log).not.toHaveBeenCalled();
  });
  it("429 registra una riga senza token né input e non lancia", async () => {
    const log = vi.fn();
    await startBotcaveRun(CFG, "brief", { type: "project", id: "9" }, "testo riservato", {
      fetch: (async () => new Response("{}", { status: 429 })) as any, log,
    });
    expect(log).toHaveBeenCalledTimes(1);
    const line = log.mock.calls[0][0];
    expect(line).toBe("[Botcave] brief project:9 fallita: 429");
    expect(line).not.toContain("cas_secret");
    expect(line).not.toContain("riservato");
  });
  it("errore di rete idem", async () => {
    const log = vi.fn();
    await startBotcaveRun(CFG, "email", { type: "email", id: "5" }, "testo riservato", {
      fetch: (async () => { throw new Error("boom cas_secret"); }) as any, log,
    });
    expect(log.mock.calls[0][0]).toBe("[Botcave] email email:5 fallita: rete");
  });
});
