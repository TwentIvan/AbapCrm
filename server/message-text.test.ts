import { describe, it, expect, vi } from "vitest";

// EmailForwardCleaner importa lo storage (e con lui @shared, che Vitest non risolve): qui non serve.
vi.mock("./storage", () => ({ storage: {} }));

import { extractAnalysisText } from "./message-text";

describe("extractAnalysisText", () => {
  it("toglie gli spazi dal testo semplice", () => {
    expect(extractAnalysisText({ body: "  ciao  " })).toBe("ciao");
  });
  it("senza testo né html restituisce stringa vuota", () => {
    expect(extractAnalysisText({ body: "", htmlBody: null })).toBe("");
  });
  it("usa l'html se porta più contenuto", () => {
    expect(extractAnalysisText({ body: "x", htmlBody: "<p>testo piu lungo</p>" })).toContain("testo piu lungo");
  });
  it("usa il testo se è più lungo dell'html", () => {
    const body = "testo semplice molto piu lungo dell'html";
    expect(extractAnalysisText({ body, htmlBody: "<p>corto</p>" })).toBe(body);
  });
});
