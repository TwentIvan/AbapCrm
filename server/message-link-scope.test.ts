import { describe, it, expect } from "vitest";
import { canLink, canEditLink } from "./message-link-scope";

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
