import { describe, it, expect } from "vitest";
import { commentCreateInput, commentUpdateInput, COMMENT_MAX_LENGTH } from "./comment-input";

describe("commentCreateInput", () => {
  it("testo ripulito, interno di default, oggetto collegato", () => {
    expect(commentCreateInput({ content: "  ciao  ", taskId: "t1" })).toEqual({
      data: { content: "ciao", isInternal: true, taskId: "t1" },
    });
    expect(commentCreateInput({ content: "x", projectId: "p1", isInternal: false })).toEqual({
      data: { content: "x", isInternal: false, projectId: "p1" },
    });
  });
  it("ignora autore e campi estranei inviati dal client", () => {
    expect(commentCreateInput({ content: "x", messageId: "m1", userId: "altro", id: "z" })).toEqual({
      data: { content: "x", isInternal: true, messageId: "m1" },
    });
  });
  it("testo mancante, vuoto o troppo lungo → errore", () => {
    expect(commentCreateInput({ taskId: "t1" })).toEqual({ error: "content obbligatorio" });
    expect(commentCreateInput({ content: "   ", taskId: "t1" })).toEqual({ error: "content obbligatorio" });
    expect(commentCreateInput({ content: 5, taskId: "t1" })).toEqual({ error: "content obbligatorio" });
    expect(commentCreateInput({ content: "x".repeat(COMMENT_MAX_LENGTH + 1), taskId: "t1" })).toEqual({
      error: "content troppo lungo",
    });
  });
  it("senza oggetto collegato o con valori non validi → errore", () => {
    expect(commentCreateInput({ content: "x" })).toEqual({ error: "serve projectId, taskId o messageId" });
    expect(commentCreateInput({ content: "x", taskId: "" })).toEqual({ error: "serve projectId, taskId o messageId" });
    expect(commentCreateInput({ content: "x", taskId: 3 })).toEqual({ error: "taskId non valido" });
    expect(commentCreateInput({ content: "x", taskId: "t", isInternal: "no" })).toEqual({ error: "isInternal non valido" });
    expect(commentCreateInput(null)).toEqual({ error: "dati del commento non validi" });
    expect(commentCreateInput([])).toEqual({ error: "dati del commento non validi" });
  });
});

describe("commentUpdateInput", () => {
  it("modifica solo testo e visibilità", () => {
    expect(commentUpdateInput({ content: " nuovo ", taskId: "altro", userId: "u2" })).toEqual({
      data: { content: "nuovo" },
    });
    expect(commentUpdateInput({ isInternal: false })).toEqual({ data: { isInternal: false } });
  });
  it("niente da modificare o valori non validi → errore", () => {
    expect(commentUpdateInput({})).toEqual({ error: "niente da modificare" });
    expect(commentUpdateInput({ userId: "u2" })).toEqual({ error: "niente da modificare" });
    expect(commentUpdateInput({ content: "" })).toEqual({ error: "content obbligatorio" });
    expect(commentUpdateInput({ isInternal: 1 })).toEqual({ error: "isInternal non valido" });
    expect(commentUpdateInput("x")).toEqual({ error: "dati del commento non validi" });
  });
});
