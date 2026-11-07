import { describe, it, expect } from "vitest";
import { canLink, canLinkAll, canEditLink } from "./message-link-scope";

const deps = (m: string | null, r: string | null) => ({
  messageOrg: async () => m,
  recordOrg: async () => r,
});
const input = { organizationId: "o1", messageId: "m", table: "projects", recordId: "r" };

describe("canLink", () => {
  it("stessa organizzazione → true", async () => {
    expect(await canLink(deps("o1", "o1"), input)).toBe(true);
  });
  it("messaggio di un'altra organizzazione → false", async () => {
    expect(await canLink(deps("o2", "o1"), input)).toBe(false);
  });
  it("messaggio senza organizzazione → false", async () => {
    expect(await canLink(deps(null, "o1"), input)).toBe(false);
  });
  it("oggetto di un'altra organizzazione → false", async () => {
    expect(await canLink(deps("o1", "o2"), input)).toBe(false);
  });
  it("tabella non ammessa → false", async () => {
    expect(await canLink(deps("o1", "o1"), { ...input, table: "users" })).toBe(false);
  });
  it("oggetto inesistente → false", async () => {
    expect(await canLink(deps("o1", null), input)).toBe(false);
  });
});

describe("canEditLink", () => {
  it("collegamento di un'altra organizzazione → false", async () => {
    expect(await canEditLink({ linkOrg: async () => "o2" }, { organizationId: "o1", linkId: "l" })).toBe(false);
  });
  it("collegamento della stessa organizzazione → true", async () => {
    expect(await canEditLink({ linkOrg: async () => "o1" }, { organizationId: "o1", linkId: "l" })).toBe(true);
  });
});

describe("canLinkAll", () => {
  const recordDeps = (orgs: Record<string, string | null>) => ({
    messageOrg: async () => "o1",
    recordOrg: async (_t: string, id: string) => orgs[id] ?? null,
  });
  const base = { organizationId: "o1", messageId: "m" };
  it("tutti della stessa organizzazione → true", async () => {
    const links = [{ tableName: "projects", recordId: "a" }, { tableName: "tasks", recordId: "b" }];
    expect(await canLinkAll(recordDeps({ a: "o1", b: "o1" }), { ...base, links })).toBe(true);
  });
  it("anche un solo oggetto di un'altra organizzazione → false", async () => {
    const links = [{ tableName: "projects", recordId: "a" }, { tableName: "tasks", recordId: "b" }];
    expect(await canLinkAll(recordDeps({ a: "o1", b: "o2" }), { ...base, links })).toBe(false);
  });
  it("voce malformata → false", async () => {
    expect(await canLinkAll(recordDeps({ a: "o1" }), { ...base, links: [{ tableName: "projects", recordId: "a" }, null] })).toBe(false);
    expect(await canLinkAll(recordDeps({ a: "o1" }), { ...base, links: [{ tableName: "projects" }] })).toBe(false);
  });
  it("elenco vuoto → false", async () => {
    expect(await canLinkAll(recordDeps({}), { ...base, links: [] })).toBe(false);
  });
});
