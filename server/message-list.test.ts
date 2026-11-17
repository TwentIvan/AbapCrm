import { describe, it, expect } from "vitest";
import { and } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import {
  isSummaryRequest,
  MESSAGE_SUMMARY_FIELDS,
  messageListConditions,
  messageSummaryColumns,
  parseMessageListFilters,
} from "./message-list";

describe("isSummaryRequest", () => {
  it("summary=true o 1 → lista leggera", () => {
    expect(isSummaryRequest({ summary: "true" })).toBe(true);
    expect(isSummaryRequest({ summary: "1" })).toBe(true);
  });
  it("assente o altri valori → righe complete (comportamento di prima)", () => {
    expect(isSummaryRequest({})).toBe(false);
    expect(isSummaryRequest({ summary: "false" })).toBe(false);
    expect(isSummaryRequest({ summary: "yes" })).toBe(false);
    expect(isSummaryRequest({ summary: ["true", "true"] })).toBe(false);
  });
});

describe("messageSummaryColumns", () => {
  it("solo i campi di riepilogo, mai corpo, HTML, allegati o sorgenti", () => {
    const keys = Object.keys(messageSummaryColumns);
    expect(keys).toEqual([...MESSAGE_SUMMARY_FIELDS]);
    for (const heavy of ["body", "htmlBody", "forwardArtifacts", "metadata", "externalMetadata", "attachments"]) {
      expect(keys).not.toContain(heavy);
    }
  });
  it("con lo stato dello smistamento (progetto, task, partner, confidenza)", () => {
    const keys = Object.keys(messageSummaryColumns);
    for (const field of ["projectId", "taskId", "partnerId", "confidenceScore"]) expect(keys).toContain(field);
  });
});

describe("parseMessageListFilters", () => {
  it("senza parametri nessun filtro (comportamento di prima)", () => {
    expect(parseMessageListFilters({})).toEqual({ ok: true, filters: { toTriage: false } });
  });
  it("toTriage=true|1 → solo i messaggi da smistare; false|0 → nessun filtro", () => {
    for (const v of ["true", "1"]) expect(parseMessageListFilters({ toTriage: v })).toEqual({ ok: true, filters: { toTriage: true } });
    for (const v of ["false", "0"]) expect(parseMessageListFilters({ toTriage: v })).toEqual({ ok: true, filters: { toTriage: false } });
  });
  it("toTriage con un altro valore → errore", () => {
    for (const v of ["yes", "", ["true", "true"]]) expect(parseMessageListFilters({ toTriage: v }).ok).toBe(false);
  });
  it("since in ISO 8601 (data o data e ora)", () => {
    const full = parseMessageListFilters({ since: "2026-11-17T10:00:00Z" });
    expect(full.ok && full.filters.since?.toISOString()).toBe("2026-11-17T10:00:00.000Z");
    const offset = parseMessageListFilters({ since: "2026-11-17T11:00:00.500+01:00" });
    expect(offset.ok && offset.filters.since?.toISOString()).toBe("2026-11-17T10:00:00.500Z");
    const day = parseMessageListFilters({ since: "2026-11-17" });
    expect(day.ok && day.filters.since?.toISOString()).toBe("2026-11-17T00:00:00.000Z");
  });
  it("since non valido → errore, mai l'elenco intero", () => {
    for (const v of ["ieri", "17/11/2026", "2026-13-45", "1700000000", "", ["2026-11-17"]]) {
      expect(parseMessageListFilters({ since: v }).ok).toBe(false);
    }
  });
});

describe("messageListConditions", () => {
  const render = (conds: ReturnType<typeof messageListConditions>) =>
    new PgDialect().sqlToQuery(and(...conds)!);

  it("nessun filtro → nessuna condizione", () => {
    expect(messageListConditions({ toTriage: false })).toEqual([]);
  });
  it("toTriage: senza progetto, task, partner e senza collegamenti", () => {
    const { sql } = render(messageListConditions({ toTriage: true }));
    expect(sql).toContain('"messages"."project_id" is null');
    expect(sql).toContain('"messages"."task_id" is null');
    expect(sql).toContain('"messages"."partner_id" is null');
    expect(sql).toMatch(/not exists \(select 1 from "message_links" where "message_links"."message_id" = "messages"."id"\)/);
  });
  it("since: ricevuti dopo l'istante (escluso)", () => {
    const since = new Date("2026-11-17T10:00:00Z");
    const { sql, params } = render(messageListConditions({ toTriage: false, since }));
    expect(sql).toContain('"messages"."received_at" >');
    expect(params).toHaveLength(1);
  });
  it("i due filtri insieme", () => {
    expect(messageListConditions({ toTriage: true, since: new Date() })).toHaveLength(2);
  });
});
