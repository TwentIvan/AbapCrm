import { describe, it, expect } from "vitest";
import { parseSuggestion, suggestionUpdate, SUGGESTION_TABLES } from "./message-suggestion";

const ID = "3f1c2b7a-9d4e-4c1a-8b2f-0a1b2c3d4e5f";
const ok = { type: "task", id: ID, confidence: 0.85, reason: "numero del work item nell'oggetto" };

describe("parseSuggestion", () => {
  it("proposta valida", () => {
    expect(parseSuggestion(ok)).toEqual(ok);
    expect(parseSuggestion({ ...ok, reason: "  motivo  " })?.reason).toBe("motivo");
    expect(parseSuggestion({ ...ok, confidence: 0 })).not.toBeNull();
    expect(parseSuggestion({ ...ok, confidence: 1 })).not.toBeNull();
  });
  it("rifiuta tipo, id, confidenza o motivo non validi", () => {
    for (const bad of [
      null, "task", {},
      { ...ok, type: "users" }, { ...ok, type: "toString" },
      { ...ok, id: "42" }, { ...ok, id: 42 },
      { ...ok, confidence: 1.2 }, { ...ok, confidence: -0.1 }, { ...ok, confidence: "0.8" }, { ...ok, confidence: NaN },
      { ...ok, reason: "" }, { ...ok, reason: "   " }, { ...ok, reason: "x".repeat(1001) },
    ]) {
      expect(parseSuggestion(bad)).toBeNull();
    }
  });
});

describe("suggestionUpdate", () => {
  it("scrive la colonna del tipo con confidenza a due decimali e motivo", () => {
    expect(suggestionUpdate({ ...ok, type: "project" } as any)).toEqual({ confidenceScore: "0.85", matchingReason: ok.reason, projectId: ID });
    expect(suggestionUpdate(ok as any)).toEqual({ confidenceScore: "0.85", matchingReason: ok.reason, taskId: ID });
    expect(suggestionUpdate({ ...ok, type: "partner" } as any)).toEqual({ confidenceScore: "0.85", matchingReason: ok.reason, partnerId: ID });
  });
  it("le tabelle sono quelle collegabili", () => {
    expect(Object.values(SUGGESTION_TABLES).sort()).toEqual(["partners", "projects", "tasks"]);
  });
});
