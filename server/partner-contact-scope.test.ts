import { describe, it, expect } from "vitest";
import {
  sanitizeTokenPartnerUpdate,
  tokenContactOrganization,
  tokenPartnerOrganization,
} from "./partner-contact-scope";

describe("sanitizeTokenPartnerUpdate", () => {
  it("toglie i campi protetti e tiene gli altri", () => {
    expect(
      sanitizeTokenPartnerUpdate({
        id: "x",
        userId: "u2",
        organizationId: "o9",
        createdAt: "2020-01-01",
        updatedAt: "2020-01-01",
        name: "ACME",
        notes: null,
      }),
    ).toEqual({ name: "ACME", notes: null });
  });
  it("corpo non oggetto o array → null", () => {
    expect(sanitizeTokenPartnerUpdate(null)).toBeNull();
    expect(sanitizeTokenPartnerUpdate("x")).toBeNull();
    expect(sanitizeTokenPartnerUpdate([{ name: "a" }])).toBeNull();
  });
  it("niente da aggiornare → null", () => {
    expect(sanitizeTokenPartnerUpdate({ organizationId: "o9" })).toBeNull();
  });
});

describe("tokenPartnerOrganization", () => {
  const deps = (org: string | null) => ({ ownedPartnerOrg: async () => org });
  const input = { partnerId: "p", userId: "u", organizationIds: ["o1", "o2"] };
  it("partner in una organizzazione del perimetro → quella", async () => {
    expect(await tokenPartnerOrganization(deps("o2"), input)).toBe("o2");
  });
  it("partner fuori perimetro → null", async () => {
    expect(await tokenPartnerOrganization(deps("o3"), input)).toBeNull();
  });
  it("partner inesistente o di un altro utente → null", async () => {
    expect(await tokenPartnerOrganization(deps(null), input)).toBeNull();
  });
});

describe("tokenContactOrganization", () => {
  const deps = (org: string | null) => ({ partnerOrg: async () => org });
  const base = { organizationId: "o1", organizationIds: ["o1", "o2"] };
  it("senza partner → organizzazione della richiesta", async () => {
    expect(await tokenContactOrganization(deps(null), { ...base, partnerId: null })).toBe("o1");
  });
  it("partner nel perimetro → organizzazione del partner", async () => {
    expect(await tokenContactOrganization(deps("o2"), { ...base, partnerId: "p" })).toBe("o2");
  });
  it("partner fuori perimetro o inesistente → null", async () => {
    expect(await tokenContactOrganization(deps("o3"), { ...base, partnerId: "p" })).toBeNull();
    expect(await tokenContactOrganization(deps(null), { ...base, partnerId: "p" })).toBeNull();
  });
  it("partnerId non stringa → null", async () => {
    expect(await tokenContactOrganization(deps("o1"), { ...base, partnerId: 5 })).toBeNull();
  });
});
