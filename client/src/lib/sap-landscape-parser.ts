import { z } from "zod";

// Schema per validare i dati estratti dal XML
export const SapSystemFromXmlSchema = z.object({
  name: z.string().min(1, "System name is required"),
  description: z.string().optional(),
  serverHost: z.string().min(1, "Server host is required"),
  systemNumber: z.string().regex(/^\d{2}$/, "System number must be 2 digits"),
  clientNumber: z.string().regex(/^\d{3}$/, "Client number must be 3 digits"),
  applicationServerPort: z.number().min(1).max(65535).optional(),
  systemType: z.enum(["ecc", "s4hana", "bw", "pi", "po", "solution_manager", "crm", "srm", "other"]).default("other"),
  landscape: z.enum(["development", "test", "production"]).default("production"),
});

export type SapSystemFromXml = z.infer<typeof SapSystemFromXmlSchema>;

export interface ParseResult {
  success: boolean;
  systems: SapSystemFromXml[];
  errors: string[];
}

/**
 * Parser per file SAPUILandscape.xml
 * Supporta sia il formato standard SAP che varianti comuni
 */
export class SapLandscapeParser {
  
  /**
   * Parsa un file SAPUILandscape.xml
   */
  static async parseXmlFile(xmlContent: string): Promise<ParseResult> {
    const errors: string[] = [];
    const systems: SapSystemFromXml[] = [];

    try {
      // Parse del XML usando DOMParser (disponibile nel browser)
      const parser = new DOMParser();
      const doc = parser.parseFromString(xmlContent, "text/xml");

      // Controlla errori di parsing
      const parseError = doc.querySelector("parsererror");
      if (parseError) {
        return {
          success: false,
          systems: [],
          errors: ["Invalid XML format: " + parseError.textContent]
        };
      }

      // Cerca elementi System nel documento
      const systemElements = this.findSystemElements(doc);
      
      if (systemElements.length === 0) {
        errors.push("No SAP systems found in the XML file");
      }

      for (const systemElement of systemElements) {
        try {
          const sapSystem = this.parseSystemElement(systemElement);
          if (sapSystem) {
            // Valida i dati estratti
            const validatedSystem = SapSystemFromXmlSchema.parse(sapSystem);
            systems.push(validatedSystem);
          }
        } catch (error) {
          const systemId = systemElement.getAttribute("systemid") || "unknown";
          errors.push(`Error parsing system ${systemId}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }

      return {
        success: systems.length > 0,
        systems,
        errors
      };

    } catch (error) {
      return {
        success: false,
        systems: [],
        errors: [`Failed to parse XML: ${error instanceof Error ? error.message : String(error)}`]
      };
    }
  }

  /**
   * Trova elementi System nel documento XML
   * Supporta diverse strutture comuni del SAPUILandscape.xml
   */
  private static findSystemElements(doc: Document): Element[] {
    const systems: Element[] = [];

    // Cerca pattern standard: Landscape > Workspaces > Workspace > System
    const workspacesSystems = Array.from(doc.querySelectorAll("Landscape Workspaces Workspace System"));
    systems.push(...workspacesSystems);

    // Cerca pattern alternativo: Landscape > System
    const directSystems = Array.from(doc.querySelectorAll("Landscape > System"));
    systems.push(...directSystems);

    // Cerca pattern generico: qualsiasi elemento System
    if (systems.length === 0) {
      const allSystems = Array.from(doc.querySelectorAll("System"));
      systems.push(...allSystems);
    }

    return systems;
  }

  /**
   * Estrae informazioni da un elemento System
   */
  private static parseSystemElement(systemElement: Element): SapSystemFromXml | null {
    const systemId = systemElement.getAttribute("systemid");
    const description = systemElement.getAttribute("description") || "";

    if (!systemId) {
      throw new Error("System element missing systemid attribute");
    }

    // Cerca servizi all'interno del sistema
    const items = systemElement.querySelectorAll("Item");
    let bestService: Element | null = null;

    // Prova a trovare un servizio WinGui o WebGui
    for (const item of Array.from(items)) {
      const services = Array.from(item.querySelectorAll("Service"));
      for (const service of services) {
        const serviceType = service.getAttribute("type");
        if (serviceType === "WinGui" || serviceType === "SAPGUI") {
          bestService = service;
          break;
        }
      }
      if (bestService) break;
    }

    // Se non trova WinGui, usa il primo servizio disponibile
    if (!bestService) {
      const allServices = systemElement.querySelectorAll("Service");
      if (allServices.length > 0) {
        bestService = allServices[0];
      }
    }

    if (!bestService) {
      throw new Error(`No services found for system ${systemId}`);
    }

    // Estrae informazioni dal servizio
    const server = bestService.getAttribute("server") || bestService.getAttribute("host");
    const systemNumber = bestService.getAttribute("systemNumber") || bestService.getAttribute("sysnr");
    const clientNumber = bestService.getAttribute("clientNumber") || bestService.getAttribute("client");
    
    if (!server) {
      throw new Error(`No server information found for system ${systemId}`);
    }

    if (!systemNumber) {
      throw new Error(`No system number found for system ${systemId}`);
    }

    if (!clientNumber) {
      throw new Error(`No client number found for system ${systemId}`);
    }

    // Determina il tipo di sistema dal nome o descrizione
    const systemType = this.inferSystemType(systemId, description);
    
    // Determina il landscape dal nome del sistema
    const landscape = this.inferLandscape(systemId, description);

    // Porta dell'application server (default SAP)
    let applicationServerPort = 3200; // Default SAP
    const portAttr = bestService.getAttribute("port");
    if (portAttr) {
      const port = parseInt(portAttr);
      if (!isNaN(port)) {
        applicationServerPort = port;
      }
    }

    return {
      name: systemId,
      description: description || undefined,
      serverHost: server,
      systemNumber: systemNumber.padStart(2, '0'), // Assicura 2 cifre
      clientNumber: clientNumber.padStart(3, '0'), // Assicura 3 cifre
      applicationServerPort,
      systemType,
      landscape
    };
  }

  /**
   * Inferisce il tipo di sistema dal nome o descrizione
   */
  private static inferSystemType(systemId: string, description: string): "ecc" | "s4hana" | "bw" | "pi" | "po" | "solution_manager" | "crm" | "srm" | "other" {
    const text = (systemId + " " + description).toLowerCase();
    
    if (text.includes("s/4") || text.includes("s4hana") || text.includes("s4")) {
      return "s4hana";
    }
    if (text.includes("bw") || text.includes("business warehouse")) {
      return "bw";
    }
    if (text.includes("pi") || text.includes("process integration")) {
      return "pi";
    }
    if (text.includes("po") || text.includes("process orchestration")) {
      return "po";
    }
    if (text.includes("solution manager") || text.includes("solman")) {
      return "solution_manager";
    }
    if (text.includes("crm")) {
      return "crm";
    }
    if (text.includes("srm")) {
      return "srm";
    }
    if (text.includes("ecc") || text.includes("ecc6")) {
      return "ecc";
    }
    
    return "other";
  }

  /**
   * Inferisce il landscape dal nome del sistema
   */
  private static inferLandscape(systemId: string, description: string): "development" | "test" | "production" {
    const text = (systemId + " " + description).toLowerCase();
    
    if (text.includes("dev") || text.includes("development") || text.includes("sviluppo")) {
      return "development";
    }
    if (text.includes("test") || text.includes("qas") || text.includes("quality") || text.includes("collaudo")) {
      return "test";
    }
    if (text.includes("prod") || text.includes("production") || text.includes("produzione")) {
      return "production";
    }
    
    // Default basato su convenzioni comuni
    const systemId_upper = systemId.toUpperCase();
    if (systemId_upper.includes("DEV") || systemId_upper.includes("D")) {
      return "development";
    }
    if (systemId_upper.includes("QAS") || systemId_upper.includes("Q") || systemId_upper.includes("TST") || systemId_upper.includes("T")) {
      return "test";
    }
    if (systemId_upper.includes("PRD") || systemId_upper.includes("P")) {
      return "production";
    }
    
    return "production"; // Default
  }
}