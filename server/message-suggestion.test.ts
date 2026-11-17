import { describe, it, expect } from "vitest";
import {
  parseSuggestion, suggestionUpdate, SUGGESTION_TABLES, parseSuggestionRef, checkSuggestion, rejectUpdate, findLinkTo,
} from "./message-suggestion";
import { suggestedLink } from "../shared/message-suggestion";

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
    expect(suggestionUpdate({ ...ok, type: "project" } as any)).toEqual({ confidenceScore: "0.85", matchingReason: ok.reason, isManuallyVerified: false, projectId: ID });
    expect(suggestionUpdate(ok as any)).toEqual({ confidenceScore: "0.85", matchingReason: ok.reason, isManuallyVerified: false, taskId: ID });
    expect(suggestionUpdate({ ...ok, type: "partner" } as any)).toEqual({ confidenceScore: "0.85", matchingReason: ok.reason, isManuallyVerified: false, partnerId: ID });
  });
  it("le tabelle sono quelle collegabili", () => {
    expect(Object.values(SUGGESTION_TABLES).sort()).toEqual(["partners", "projects", "tasks"]);
  });
});

const ID2 = "9a8b7c6d-5e4f-4a3b-9c2d-1e0f9a8b7c6d";
const classified = { projectId: ID2, taskId: ID, partnerId: null, confidenceScore: "0.85", matchingReason: " motivo ", isManuallyVerified: false };

describe("suggestedLink", () => {
  it("il più specifico tra task, progetto e partner, con confidenza e motivo", () => {
    expect(suggestedLink(classified)).toEqual({ type: "task", id: ID, confidence: 0.85, reason: "motivo", confirmed: false });
    expect(suggestedLink({ ...classified, taskId: null })?.type).toBe("project");
    expect(suggestedLink({ ...classified, taskId: null, projectId: null, partnerId: ID })?.type).toBe("partner");
    expect(suggestedLink({ ...classified, isManuallyVerified: true })?.confirmed).toBe(true);
  });
  it("basta la confidenza o il motivo", () => {
    expect(suggestedLink({ ...classified, matchingReason: null })?.reason).toBeNull();
    expect(suggestedLink({ ...classified, confidenceScore: null })?.confidence).toBeNull();
  });
  it("nessun suggerimento senza classificazione o senza oggetto", () => {
    expect(suggestedLink(null)).toBeNull();
    expect(suggestedLink({ ...classified, confidenceScore: null, matchingReason: "  " })).toBeNull();
    expect(suggestedLink({ ...classified, projectId: null, taskId: null })).toBeNull();
  });
});

describe("parseSuggestionRef", () => {
  it("tipo ammesso e id UUID", () => {
    expect(parseSuggestionRef({ type: "task", id: ID, extra: 1 })).toEqual({ type: "task", id: ID });
    for (const bad of [null, {}, { type: "users", id: ID }, { type: "task", id: "42" }, { type: "constructor", id: ID }]) {
      expect(parseSuggestionRef(bad)).toBeNull();
    }
  });
});

describe("checkSuggestion", () => {
  it("ok se il suggerimento è quello visto dal client", () => {
    const r = checkSuggestion(classified, { type: "task", id: ID });
    expect(r).toMatchObject({ ok: true, table: "tasks", suggestion: { type: "task", id: ID } });
    expect(checkSuggestion({ ...classified, isManuallyVerified: true }, { type: "task", id: ID }).ok).toBe(true);
  });
  it("400 riferimento non valido, 404 messaggio assente, 409 suggerimento cambiato o assente", () => {
    expect(checkSuggestion(classified, null)).toMatchObject({ ok: false, status: 400 });
    expect(checkSuggestion(undefined, { type: "task", id: ID })).toMatchObject({ ok: false, status: 404 });
    expect(checkSuggestion(classified, { type: "project", id: ID2 })).toMatchObject({ ok: false, status: 409 });
    expect(checkSuggestion(classified, { type: "task", id: ID2 })).toMatchObject({ ok: false, status: 409 });
    expect(checkSuggestion({ ...classified, confidenceScore: null, matchingReason: null }, { type: "task", id: ID }))
      .toMatchObject({ ok: false, status: 409 });
  });
});

describe("rejectUpdate e findLinkTo", () => {
  it("lo scarto toglie oggetto, confidenza e motivo", () => {
    expect(rejectUpdate("project")).toEqual({ projectId: null, confidenceScore: null, matchingReason: null, isManuallyVerified: false });
    const after = { ...classified, ...rejectUpdate("task") };
    expect(suggestedLink(after)).toBeNull();
  });
  it("trova il collegamento esistente verso l'oggetto", () => {
    const links = [{ id: "a", linkedTableName: "projects", linkedRecordId: ID }, { id: "b", linkedTableName: "tasks", linkedRecordId: ID }];
    expect(findLinkTo(links, "tasks", ID)?.id).toBe("b");
    expect(findLinkTo(links, "partners", ID)).toBeNull();
  });
});
