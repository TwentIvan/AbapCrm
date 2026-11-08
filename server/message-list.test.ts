import { describe, it, expect } from "vitest";
import { isSummaryRequest, MESSAGE_SUMMARY_FIELDS, messageSummaryColumns } from "./message-list";

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
});
