import { describe, it, expect, vi } from "vitest";

vi.mock("./db", () => ({ db: {} }));
vi.mock("@shared/schema", () => ({ auditLogs: {}, messageLinks: {}, messages: {} }));
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  MissingOrganizationError,
  ORGANIZATION_REQUIRED_MESSAGE,
  pickDefaultOrganizationId,
  readOrganizationId,
  requireOrganizationId,
  resolveSessionOrganization,
} from "./organization-context";
import { AuditService } from "./audit-service";
import { MessageLogService } from "./message-log-service";

const req = (org?: string | string[]) => ({ headers: org === undefined ? {} : { "x-organization-id": org } });

describe("readOrganizationId", () => {
  it("legge l'header ripulito", () => {
    expect(readOrganizationId(req("org-a"))).toBe("org-a");
    expect(readOrganizationId(req(" org-a "))).toBe("org-a");
    expect(readOrganizationId(req(["org-a", "org-b"]))).toBe("org-a");
  });
  it("senza header o con header vuoto → null", () => {
    expect(readOrganizationId(req())).toBeNull();
    expect(readOrganizationId(req(""))).toBeNull();
    expect(readOrganizationId(req("   "))).toBeNull();
  });
});

describe("requireOrganizationId", () => {
  it("restituisce l'organizzazione dell'header", () => {
    expect(requireOrganizationId(req("org-a"))).toBe("org-a");
  });
  it("senza header lancia un errore 400, mai un'organizzazione fissa", () => {
    let err: unknown;
    try {
      requireOrganizationId(req());
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(MissingOrganizationError);
    expect((err as MissingOrganizationError).status).toBe(400);
    expect((err as MissingOrganizationError).code).toBe("organization_required");
    expect((err as Error).message).toBe(ORGANIZATION_REQUIRED_MESSAGE);
  });
});

describe("pickDefaultOrganizationId", () => {
  it("preferisce Personal, poi la prima", () => {
    expect(pickDefaultOrganizationId([{ id: "a", name: "Acme" }, { id: "p", name: "Personal" }])).toBe("p");
    expect(pickDefaultOrganizationId([{ id: "a", name: "Acme" }, { id: "b", name: "Beta" }])).toBe("a");
  });
  it("senza organizzazioni → null", () => {
    expect(pickDefaultOrganizationId([])).toBeNull();
  });
});

describe("resolveSessionOrganization", () => {
  const members = new Set(["a", "p"]);
  it("tiene l'header se l'utente è membro", () => {
    expect(resolveSessionOrganization("a", members, "p")).toEqual({ organizationId: "a", rejected: null });
  });
  it("senza header usa l'organizzazione predefinita dell'utente", () => {
    expect(resolveSessionOrganization(null, members, "p")).toEqual({ organizationId: "p", rejected: null });
  });
  it("header di un'altra organizzazione → predefinita, header scartato", () => {
    expect(resolveSessionOrganization("altrui", members, "p")).toEqual({ organizationId: "p", rejected: "altrui" });
  });
  it("utente senza organizzazioni → nessuna organizzazione, anche se l'header ne indica una", () => {
    expect(resolveSessionOrganization(null, new Set(), null)).toEqual({ organizationId: null, rejected: null });
    expect(resolveSessionOrganization("altrui", new Set(), null)).toEqual({ organizationId: null, rejected: "altrui" });
  });
});

describe("contesti di audit e collegamenti", () => {
  const expressReq = (org?: string) =>
    ({ headers: org ? { "x-organization-id": org } : {}, user: { id: "u1" }, get: () => "ua", ip: "1.2.3.4" }) as any;

  it("usano l'organizzazione della richiesta", () => {
    expect(AuditService.createContext(expressReq("org-a")).organizationId).toBe("org-a");
    expect(MessageLogService.createContext(expressReq("org-a")).organizationId).toBe("org-a");
  });
  it("senza header non inventano un'organizzazione", () => {
    expect(AuditService.createContext(expressReq()).organizationId).toBeUndefined();
    expect(() => MessageLogService.createContext(expressReq())).toThrow(MissingOrganizationError);
  });
});

describe("nessuna organizzazione di ripiego fissa nel server", () => {
  it("l'id legacy compare solo nella migrazione che recupera i dati rimasti lì", () => {
    const legacy = "4ca22699-5fd4-4030-8bb5-4e7cef9ce8be";
    for (const file of ["routes.ts", "audit-service.ts", "message-log-service.ts"]) {
      expect(readFileSync(join(__dirname, file), "utf8")).not.toContain(legacy);
    }
  });
});
