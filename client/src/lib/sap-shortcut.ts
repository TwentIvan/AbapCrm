/**
 * Utility per generare SAP Shortcut files (.sap)
 * 
 * Un SAP shortcut è un file di testo con formato INI che contiene:
 * - Parametri di connessione al sistema SAP
 * - Transaction code da eseguire automaticamente
 * - Configurazioni di sessione
 */

export interface SapShortcutParams {
  systemName: string;
  description?: string;
  serverHost: string;
  systemId: string;
  systemNumber: string;
  client: string;
  language?: string;
  transactionCode?: string;
  programName?: string;
  username?: string;
}

/**
 * Genera il contenuto di un file SAP shortcut (.sap)
 */
export function generateSapShortcut(params: SapShortcutParams): string {
  const lines: string[] = [];
  
  // System section
  lines.push("[System]");
  lines.push(`Name=${params.systemName}`);
  if (params.description) {
    lines.push(`Description=${params.description}`);
  }
  lines.push(`Client=${params.client}`);
  
  // Connection section  
  lines.push("[Connection]");
  lines.push(`Server=${params.serverHost}`);
  lines.push(`SystemId=${params.systemId}`);
  lines.push(`SystemNumber=${params.systemNumber}`);
  
  // User section
  if (params.username || params.language) {
    lines.push("[User]");
    if (params.username) {
      lines.push(`Name=${params.username}`);
    }
    if (params.language) {
      lines.push(`Language=${params.language}`);
    }
  }
  
  // Function section - transaction o programma
  if (params.transactionCode || params.programName) {
    lines.push("[Function]");
    if (params.transactionCode) {
      lines.push(`Command=${params.transactionCode}`);
      lines.push(`Type=Transaction`);
    } else if (params.programName) {
      lines.push(`Command=${params.programName}`);
      lines.push(`Type=SystemCommand`);
    }
  }
  
  // Configuration section
  lines.push("[Configuration]");
  lines.push("WorkDir=");
  
  // Options section
  lines.push("[Options]");
  lines.push("Reuse=1");
  lines.push("GuiSize=Maximized");
  
  return lines.join("\r\n");
}

/**
 * Scarica un SAP shortcut come file .sap
 */
export function downloadSapShortcut(params: SapShortcutParams, filename?: string) {
  const content = generateSapShortcut(params);
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  
  const link = document.createElement("a");
  link.href = url;
  link.download = filename || `${params.systemName}_${params.programName || params.transactionCode || 'shortcut'}.sap`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Genera uno shortcut SAP specifico per ZTHU_DOCUMENTATION
 */
export function generateZTHUDocumentationShortcut(systemData: {
  systemName: string;
  description?: string;
  serverHost: string;
  systemId: string;
  systemNumber: string;
  client: string;
  language?: string;
  username?: string;
}): string {
  return generateSapShortcut({
    ...systemData,
    programName: "ZTHU_DOCUMENTATION",
  });
}

/**
 * Scarica lo shortcut per ZTHU_DOCUMENTATION
 */
export function downloadZTHUDocumentationShortcut(systemData: {
  systemName: string;
  description?: string;
  serverHost: string;
  systemId: string;
  systemNumber: string;
  client: string;
  language?: string;
  username?: string;
}) {
  downloadSapShortcut({
    ...systemData,
    programName: "ZTHU_DOCUMENTATION",
  }, `${systemData.systemName}_ZTHU_DOCUMENTATION.sap`);
}
