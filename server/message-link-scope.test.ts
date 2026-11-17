import { describe, it, expect } from "vitest";
import {
  canEditLink,
  dbLinkScopeDeps,
  linkAllOrganization,
  linkOrganization,
  linkedRecordOrganizations,
  linksInScope,
  messageOrganization,
} from "./message-link-scope";

const deps = (m: string | null, r: string | null) => ({
  messageOrg: async () => m,
  recordOrg: async () => r,
});

describe("linkOrganization", () => {
  const scope = { organizationIds: ["o1", "o2"], messageId: "m", table: "tasks", recordId: "r" };
  it("messaggio in una delle organizzazioni e oggetto nella stessa → organizzazione del messaggio", async () => {
    expect(await linkOrganization(deps("o2", "o2"), scope)).toBe("o2");
  });
  it("messaggio fuori dalle organizzazioni della richiesta → null", async () => {
    expect(await linkOrganization(deps("o3", "o3"), scope)).toBeNull();
  });
  it("oggetto in un'altra organizzazione del messaggio → null", async () => {
    expect(await linkOrganization(deps("o1", "o2"), scope)).toBeNull();
  });
  it("messaggio senza organizzazione o oggetto inesistente → null", async () => {
    expect(await linkOrganization(deps(null, null), scope)).toBeNull();
    expect(await linkOrganization(deps("o1", null), scope)).toBeNull();
  });
  it("tabella non ammessa → null", async () => {
    expect(await linkOrganization(deps("o1", "o1"), { ...scope, table: "users" })).toBeNull();
  });
});

describe("linkAllOrganization", () => {
  const recordDeps = (messageOrg: string | null, orgs: Record<string, string | null>) => ({
    messageOrg: async () => messageOrg,
    recordOrg: async (_t: string, id: string) => orgs[id] ?? null,
  });
  const base = { organizationIds: ["o1", "o2"], messageId: "m" };
  const links = [{ tableName: "projects", recordId: "a" }, { tableName: "tasks", recordId: "b" }];

  it("tutti nell'organizzazione del messaggio → organizzazione del messaggio", async () => {
    expect(await linkAllOrganization(recordDeps("o2", { a: "o2", b: "o2" }), { ...base, links })).toBe("o2");
  });
  it("anche un solo oggetto di un'altra organizzazione → null", async () => {
    expect(await linkAllOrganization(recordDeps("o1", { a: "o1", b: "o2" }), { ...base, links })).toBeNull();
  });
  it("messaggio fuori dalle organizzazioni della richiesta → null", async () => {
    expect(await linkAllOrganization(recordDeps("o3", { a: "o3", b: "o3" }), { ...base, links })).toBeNull();
  });
  it("voce malformata o tabella non ammessa → null", async () => {
    const d = recordDeps("o1", { a: "o1" });
    expect(await linkAllOrganization(d, { ...base, links: [links[0], null] })).toBeNull();
    expect(await linkAllOrganization(d, { ...base, links: [{ tableName: "projects" }] })).toBeNull();
    expect(await linkAllOrganization(d, { ...base, links: [{ tableName: "users", recordId: "a" }] })).toBeNull();
  });
  it("elenco vuoto → null", async () => {
    expect(await linkAllOrganization(recordDeps("o1", {}), { ...base, links: [] })).toBeNull();
  });
});

describe("canEditLink", () => {
  const linkDeps = (o: string | null) => ({ linkOrg: async () => o });
  it("collegamento in una delle organizzazioni della richiesta → true", async () => {
    expect(await canEditLink(linkDeps("o2"), { organizationIds: ["o1", "o2"], linkId: "l" })).toBe(true);
  });
  it("collegamento di un'altra organizzazione o inesistente → false", async () => {
    expect(await canEditLink(linkDeps("o3"), { organizationIds: ["o1", "o2"], linkId: "l" })).toBe(false);
    expect(await canEditLink(linkDeps(null), { organizationIds: ["o1"], linkId: "l" })).toBe(false);
  });
});

describe("messageOrganization", () => {
  it("messaggio in una delle organizzazioni → la sua organizzazione, altrimenti null", async () => {
    expect(await messageOrganization(deps("o2", null), { organizationIds: ["o1", "o2"], messageId: "m" })).toBe("o2");
    expect(await messageOrganization(deps("o3", null), { organizationIds: ["o1", "o2"], messageId: "m" })).toBeNull();
    expect(await messageOrganization(deps(null, null), { organizationIds: ["o1"], messageId: "m" })).toBeNull();
  });
});

describe("linkedRecordOrganizations", () => {
  const scope = { organizationIds: ["o1", "o2"], table: "projects", recordId: "r" };
  it("oggetto collegabile in una delle organizzazioni → solo la sua organizzazione", async () => {
    expect(await linkedRecordOrganizations(deps(null, "o2"), scope)).toEqual(["o2"]);
  });
  it("oggetto collegabile fuori perimetro o inesistente → null", async () => {
    expect(await linkedRecordOrganizations(deps(null, "o3"), scope)).toBeNull();
    expect(await linkedRecordOrganizations(deps(null, null), scope)).toBeNull();
  });
  it("tabella non collegabile → le organizzazioni della richiesta", async () => {
    expect(await linkedRecordOrganizations(deps(null, null), { ...scope, table: "sap_systems" })).toEqual(["o1", "o2"]);
  });
});

describe("linksInScope", () => {
  it("tiene solo i collegamenti delle organizzazioni ammesse col messaggio nella stessa organizzazione", () => {
    const links = [
      { id: "ok", organizationId: "o1", message: { organizationId: "o1" } },
      { id: "altra-org", organizationId: "o3", message: { organizationId: "o3" } },
      { id: "messaggio-altrove", organizationId: "o1", message: { organizationId: "o2" } },
      { id: "messaggio-mancante", organizationId: "o1", message: null },
      { id: "senza-messaggio", organizationId: "o2" },
    ];
    expect(linksInScope(links, ["o1", "o2"]).map((l) => l.id)).toEqual(["ok", "senza-messaggio"]);
  });
});

describe("dbLinkScopeDeps", () => {
  it("id non UUID → null senza interrogare il database", async () => {
    expect(await dbLinkScopeDeps.messageOrg("42")).toBeNull();
    expect(await dbLinkScopeDeps.recordOrg("tasks", "x' OR 1=1")).toBeNull();
    expect(await dbLinkScopeDeps.linkOrg("")).toBeNull();
  });
});
