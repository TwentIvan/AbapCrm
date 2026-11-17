import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
import {
  DEFAULT_MAX_CHARS,
  MAX_MAX_CHARS,
  extractAttachmentText,
  parseMaxChars,
  resolveAttachmentText,
  type AttachmentTextDeps,
} from "./attachment-text";

const ORG = "11111111-1111-1111-1111-111111111111";
const OTHER = "22222222-2222-2222-2222-222222222222";

function deps(files: Record<string, Buffer>, message = { id: "m1", organizationId: ORG, attachments: Object.keys(files) }) {
  const d: AttachmentTextDeps = {
    async getMessage(id) {
      return id === message.id ? message : null;
    },
    async readAttachment(_m, filename) {
      return files[filename] ?? null;
    },
  };
  return d;
}

function xlsxBuffer(): Buffer {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["a", "b"], [1, 2]]), "Dati");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([]), "Vuoto");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
}

describe("extractAttachmentText", () => {
  it("testo e CSV in UTF-8", () => {
    expect(extractAttachmentText(Buffer.from("ciao è"), "nota.TXT")).toBe("ciao è");
    expect(extractAttachmentText(Buffer.from("a;b"), "x.csv")).toBe("a;b");
  });
  it("Excel: un blocco per foglio non vuoto", () => {
    expect(extractAttachmentText(xlsxBuffer(), "f.xlsx")).toBe("=== Sheet: Dati ===\na,b\n1,2");
  });
  it("formato non supportato → null", () => {
    expect(extractAttachmentText(Buffer.from("%PDF"), "f.pdf")).toBeNull();
  });
});

describe("parseMaxChars", () => {
  it("assente → predefinito; intero nei limiti → valore; altro → null", () => {
    expect(parseMaxChars(undefined)).toBe(DEFAULT_MAX_CHARS);
    expect(parseMaxChars("")).toBe(DEFAULT_MAX_CHARS);
    expect(parseMaxChars("10")).toBe(10);
    expect(parseMaxChars(String(MAX_MAX_CHARS))).toBe(MAX_MAX_CHARS);
    expect(parseMaxChars("0")).toBeNull();
    expect(parseMaxChars(String(MAX_MAX_CHARS + 1))).toBeNull();
    expect(parseMaxChars("1.5")).toBeNull();
    expect(parseMaxChars(["1"])).toBeNull();
  });
});

describe("resolveAttachmentText", () => {
  const base = { messageId: "m1", organizationIds: [ORG], maxChars: undefined };

  it("restituisce il testo con lunghezza e senza troncamento", async () => {
    const r = await resolveAttachmentText(deps({ "n.txt": Buffer.from("ciao") }), { ...base, filename: "n.txt" });
    expect(r).toEqual({
      status: 200,
      body: { messageId: "m1", filename: "n.txt", text: "ciao", length: 4, truncated: false },
    });
  });

  it("tronca a maxChars e riporta la lunghezza intera", async () => {
    const r = await resolveAttachmentText(deps({ "n.txt": Buffer.from("abcdef") }), {
      ...base,
      filename: "n.txt",
      maxChars: "3",
    });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ text: "abc", length: 6, truncated: true });
  });

  it("maxChars non valido → 400", async () => {
    const r = await resolveAttachmentText(deps({ "n.txt": Buffer.from("x") }), { ...base, filename: "n.txt", maxChars: "abc" });
    expect(r.status).toBe(400);
  });

  it("messaggio inesistente, fuori dalle organizzazioni o senza organizzazione → 404", async () => {
    const files = { "n.txt": Buffer.from("x") };
    expect((await resolveAttachmentText(deps(files), { ...base, messageId: "m2", filename: "n.txt" })).status).toBe(404);
    expect((await resolveAttachmentText(deps(files), { ...base, organizationIds: [OTHER], filename: "n.txt" })).status).toBe(404);
    const orphan = deps(files, { id: "m1", organizationId: null as unknown as string, attachments: ["n.txt"] });
    expect((await resolveAttachmentText(orphan, { ...base, filename: "n.txt" })).status).toBe(404);
  });

  it("allegato non del messaggio o file mancante → 404", async () => {
    const d = deps({}, { id: "m1", organizationId: ORG, attachments: ["sparito.txt"] });
    expect((await resolveAttachmentText(d, { ...base, filename: "altro.txt" })).status).toBe(404);
    expect((await resolveAttachmentText(d, { ...base, filename: "sparito.txt" })).status).toBe(404);
  });

  it("nome con percorso non tra gli allegati → 404 senza leggere il file", async () => {
    let read = false;
    const d = deps({ "n.txt": Buffer.from("x") });
    d.readAttachment = async () => {
      read = true;
      return Buffer.from("segreto");
    };
    expect((await resolveAttachmentText(d, { ...base, filename: "../../etc/passwd.txt" })).status).toBe(404);
    expect(read).toBe(false);
  });

  it("formato non supportato → 415 con l'elenco dei formati", async () => {
    const r = await resolveAttachmentText(deps({ "f.pdf": Buffer.from("%PDF") }), { ...base, filename: "f.pdf" });
    expect(r.status).toBe(415);
    expect(r.body).toMatchObject({ supported: [".xlsx", ".xls", ".csv", ".txt"] });
  });

  it("file senza testo → testo vuoto", async () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([]), "Vuoto");
    const empty = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
    const r = await resolveAttachmentText(deps({ "v.xlsx": empty }), { ...base, filename: "v.xlsx" });
    expect(r).toMatchObject({ status: 200, body: { text: "", length: 0, truncated: false } });
  });
});
