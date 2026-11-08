import { describe, it, expect } from "vitest";
import { taskExternalRef } from "./task-external-ref";

describe("taskExternalRef", () => {
  it("senza campi esterni → riferimento vuoto", () => {
    expect(taskExternalRef({ title: "x" })).toEqual({ ref: {} });
    expect(taskExternalRef(null)).toEqual({ ref: {} });
    expect(taskExternalRef({ externalWorkItemId: "", externalSystem: null })).toEqual({ ref: {} });
  });
  it("tiene id, sistema e url validi (id numerico come testo)", () => {
    expect(
      taskExternalRef({
        externalWorkItemId: 1574,
        externalSystem: " azure_devops ",
        externalWorkItemUrl: "https://dev.azure.com/org/p/_workitems/edit/1574",
      }),
    ).toEqual({
      ref: {
        externalWorkItemId: "1574",
        externalSystem: "azure_devops",
        externalWorkItemUrl: "https://dev.azure.com/org/p/_workitems/edit/1574",
      },
    });
    expect(taskExternalRef({ externalWorkItemId: " CREDITRISK-1574 " })).toEqual({
      ref: { externalWorkItemId: "CREDITRISK-1574" },
    });
  });
  it("valori non validi → errore", () => {
    expect(taskExternalRef({ externalWorkItemId: { a: 1 } })).toEqual({ error: "externalWorkItemId non valido" });
    expect(taskExternalRef({ externalWorkItemId: "x".repeat(101) })).toEqual({ error: "externalWorkItemId non valido" });
    expect(taskExternalRef({ externalWorkItemId: "1", externalSystem: "Azure DevOps" })).toEqual({
      error: "externalSystem non valido",
    });
    expect(taskExternalRef({ externalWorkItemId: "1", externalWorkItemUrl: "http://x.it/1" })).toEqual({
      error: "externalWorkItemUrl non valido",
    });
    expect(taskExternalRef({ externalWorkItemId: "1", externalWorkItemUrl: "javascript:alert(1)" })).toEqual({
      error: "externalWorkItemUrl non valido",
    });
  });
  it("sistema o url senza id → errore", () => {
    expect(taskExternalRef({ externalSystem: "azure_devops" })).toEqual({
      error: "externalWorkItemId obbligatorio con externalSystem o externalWorkItemUrl",
    });
  });
});
