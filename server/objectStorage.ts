// Storage dei loghi su disco locale (sostituisce l'Object Storage di Replit, che
// funzionava solo tramite il sidecar di Replit). Stessa interfaccia usata da routes.ts:
//  - getLogoUploadURL()  → URL su cui il client fa una PUT con il file
//  - normalizeLogoPath() → path pubblico /objects/logos/<id> da salvare nel DB
//  - getLogoFile()       → descrittore del file per il download
//  - downloadObject()    → stream del file nella response
// I file vivono in OBJECT_STORAGE_DIR (default /app/data/objects): montare lì un volume persistente.
import { Response } from "express";
import { randomUUID } from "crypto";
import fs from "fs";
import path from "path";

export class ObjectNotFoundError extends Error {
  constructor() {
    super("Object not found");
    this.name = "ObjectNotFoundError";
    Object.setPrototypeOf(this, ObjectNotFoundError.prototype);
  }
}

export interface LocalFile {
  absolutePath: string;
  contentType: string;
  size: number;
}

const UPLOAD_PREFIX = "/objects/upload/logos/";
const PUBLIC_PREFIX = "/objects/logos/";
const LOGO_ID_RE = /^[a-zA-Z0-9-]+$/;

export class ObjectStorageService {
  constructor() {}

  getStorageDir(): string {
    const dir = process.env.OBJECT_STORAGE_DIR || "/app/data/objects";
    fs.mkdirSync(path.join(dir, "logos"), { recursive: true });
    return dir;
  }

  private logoPath(logoId: string): string {
    if (!LOGO_ID_RE.test(logoId)) throw new ObjectNotFoundError();
    return path.join(this.getStorageDir(), "logos", logoId);
  }

  // URL (relativo al dominio dell'app) su cui il client esegue la PUT del file.
  async getLogoUploadURL(): Promise<string> {
    this.getStorageDir();
    const logoId = randomUUID();
    return `${UPLOAD_PREFIX}${logoId}`;
  }

  // Salva il corpo di una PUT come logo. Restituisce il path pubblico.
  async saveLogo(logoId: string, body: Buffer, contentType: string | undefined): Promise<string> {
    const filePath = this.logoPath(logoId);
    await fs.promises.writeFile(filePath, body);
    await fs.promises.writeFile(
      `${filePath}.meta.json`,
      JSON.stringify({ contentType: contentType || "application/octet-stream", size: body.length }),
    );
    return `${PUBLIC_PREFIX}${logoId}`;
  }

  // Da URL di upload (assoluto o relativo, con o senza query) a path pubblico.
  normalizeLogoPath(rawPath: string): string {
    let p = rawPath;
    try {
      if (/^https?:\/\//.test(rawPath)) p = new URL(rawPath).pathname;
    } catch {
      /* lascia rawPath */
    }
    p = p.split("?")[0];
    if (p.startsWith(UPLOAD_PREFIX)) return `${PUBLIC_PREFIX}${p.slice(UPLOAD_PREFIX.length)}`;
    return p;
  }

  async getLogoFile(logoPath: string): Promise<LocalFile> {
    if (!logoPath.startsWith(PUBLIC_PREFIX)) throw new ObjectNotFoundError();
    const logoId = logoPath.slice(PUBLIC_PREFIX.length);
    const absolutePath = this.logoPath(logoId);
    if (!fs.existsSync(absolutePath)) throw new ObjectNotFoundError();
    let contentType = "application/octet-stream";
    try {
      const meta = JSON.parse(await fs.promises.readFile(`${absolutePath}.meta.json`, "utf8"));
      if (meta.contentType) contentType = meta.contentType;
    } catch {
      /* senza meta: octet-stream */
    }
    const { size } = await fs.promises.stat(absolutePath);
    return { absolutePath, contentType, size };
  }

  async downloadObject(file: LocalFile, res: Response, cacheTtlSec: number = 3600) {
    try {
      res.set({
        "Content-Type": file.contentType,
        "Content-Length": String(file.size),
        "Cache-Control": `public, max-age=${cacheTtlSec}`,
      });
      const stream = fs.createReadStream(file.absolutePath);
      stream.on("error", (err) => {
        console.error("Stream error:", err);
        if (!res.headersSent) res.status(500).json({ error: "Error streaming file" });
      });
      stream.pipe(res);
    } catch (error) {
      console.error("Error downloading file:", error);
      if (!res.headersSent) res.status(500).json({ error: "Error downloading file" });
    }
  }
}
