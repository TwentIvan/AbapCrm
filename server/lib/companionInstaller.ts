// ── Companion installer — switch modalità (come ghost/prod del module runner) ──
// Modalità "command" (default, oggi): la UI genera un file .command personalizzato
//   col token+server; l'utente lo apre con doppio click. Nessuna digitazione.
// Modalità "pkg" (produzione): serve un .pkg firmato/notarizzato (Apple Developer
//   ID) pre-costruito, indicato da HUBUP_PKG_PATH. 100% nativo, nessun terminale.
//
// Si passa dall'una all'altra con HUBUP_INSTALLER_MODE=command|pkg — senza toccare
// UI né endpoint: cambia solo l'artefatto prodotto da buildInstaller().

import fs from "fs";
import path from "path";

export type InstallerMode = "command" | "pkg";

export interface InstallerArtifact {
  filename: string;      // nome file suggerito al download
  contentType: string;
  body: Buffer;
}

export interface CompanionInstaller {
  readonly mode: InstallerMode;
  build(opts: { server: string; token: string }): InstallerArtifact;
}

const TEMPLATE_DIR = "resources/modules/discovery-mac";

// Modalità 1 — .command personalizzato (doppio click, zero digitazione).
class CommandInstaller implements CompanionInstaller {
  readonly mode = "command" as const;
  build({ server, token }: { server: string; token: string }): InstallerArtifact {
    const tpl = fs.readFileSync(path.resolve(TEMPLATE_DIR, "hubup_install.command"), "utf8");
    const body = tpl
      .replace(/@@HUBUP_SERVER@@/g, server)
      .replace(/@@HUBUP_TOKEN@@/g, token);
    return {
      filename: "Installa-HubUp-Companion.command",
      contentType: "application/octet-stream",
      body: Buffer.from(body, "utf8"),
    };
  }
}

// Modalità 2 — .pkg firmato/notarizzato (serve Apple Developer ID).
// Il .pkg è pre-costruito fuori da qui e indicato da HUBUP_PKG_PATH. Il token
// non viene cablato nel .pkg (che è statico/firmato): il companion lo riceve
// via configuration profile / primo avvio. Qui serviamo solo il binario firmato.
class PkgInstaller implements CompanionInstaller {
  readonly mode = "pkg" as const;
  constructor(private pkgPath = process.env.HUBUP_PKG_PATH || "") {}
  build(_opts: { server: string; token: string }): InstallerArtifact {
    if (!this.pkgPath || !fs.existsSync(this.pkgPath)) {
      throw new Error(
        "Installer .pkg non configurato: imposta HUBUP_PKG_PATH a un pacchetto " +
        "firmato/notarizzato (Apple Developer ID). Finché non è pronto, usa " +
        "HUBUP_INSTALLER_MODE=command."
      );
    }
    return {
      filename: "Installa-HubUp-Companion.pkg",
      contentType: "application/octet-stream",
      body: fs.readFileSync(this.pkgPath),
    };
  }
}

export function getCompanionInstaller(): CompanionInstaller {
  const mode = (process.env.HUBUP_INSTALLER_MODE || "command").toLowerCase();
  return mode === "pkg" ? new PkgInstaller() : new CommandInstaller();
}
