import { z } from "zod";

// Schema per validare i dati estratti dal XML
export const SapSystemFromXmlSchema = z.object({
  name: z.string().min(1, "System name is required"),
  description: z.string().optional(),
  serverHost: z.string().min(1, "Server host is required"),
  systemNumber: z.string().regex(/^\d{2}$/, "System number must be 2 digits"),
  clientNumber: z.string().regex(/^\d{3}$/, "Client number must be 3 digits"),
  applicationServerPort: z.number().min(1).max(65535).default(3200),
  messageServerPort: z.number().min(1).max(65535).default(3600),
  systemType: z.enum(["ecc", "s4hana", "bw", "pi", "po", "solution_manager", "crm", "srm", "other"]).default("other"),
  status: z.enum(["active", "inactive", "maintenance", "test"]).default("active"),
  landscape: z.string().default("production"), // Cambiato da enum a stringa per supportare valori custom
  sapReleaseVersion: z.string().optional(),
  kernelVersion: z.string().optional(),
  notes: z.string().optional(),
  isActive: z.boolean().default(true),
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
            console.log(`✓ Successfully parsed system: ${sapSystem.name}`);
          }
        } catch (error) {
          const systemId = systemElement.getAttribute("systemid") || 
                          systemElement.getAttribute("systemId") || 
                          systemElement.getAttribute("name") || 
                          "unknown";
          const errorMessage = `Error parsing system ${systemId}: ${error instanceof Error ? error.message : String(error)}`;
          console.error(errorMessage);
          errors.push(errorMessage);
          
          // Log dell'elemento problematico per debugging
          console.log(`Problematic element for ${systemId}:`, systemElement.outerHTML.substring(0, 500));
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

    // Debug: stampa la struttura del documento
    console.log("XML Root element:", doc.documentElement?.tagName);
    console.log("XML structure preview:", doc.documentElement?.outerHTML?.substring(0, 500) + "...");

    // Pattern 1: Landscape > Workspaces > Workspace > System
    const workspacesSystems = Array.from(doc.querySelectorAll("Landscape Workspaces Workspace System"));
    console.log("Found systems in Workspaces pattern:", workspacesSystems.length);
    systems.push(...workspacesSystems);

    // Pattern 2: Landscape > System (diretto)
    const directSystems = Array.from(doc.querySelectorAll("Landscape > System"));
    console.log("Found systems in direct Landscape pattern:", directSystems.length);
    systems.push(...directSystems);

    // Pattern 3: Landscape > Services > System
    const servicesSystems = Array.from(doc.querySelectorAll("Landscape Services System"));
    console.log("Found systems in Services pattern:", servicesSystems.length);
    systems.push(...servicesSystems);

    // Pattern 4: Qualsiasi elemento System nel documento
    if (systems.length === 0) {
      const allSystems = Array.from(doc.querySelectorAll("System"));
      console.log("Found systems with generic System selector:", allSystems.length);
      systems.push(...allSystems);
    }

    // Pattern 5: Elementi con attributo systemid (caso generale)
    if (systems.length === 0) {
      const systemsByAttribute = Array.from(doc.querySelectorAll("*[systemid]"));
      console.log("Found elements with systemid attribute:", systemsByAttribute.length);
      systems.push(...systemsByAttribute);
    }

    // Pattern 6: Case-insensitive search
    if (systems.length === 0) {
      const allElements = Array.from(doc.querySelectorAll("*"));
      const systemElements = allElements.filter(el => 
        el.tagName.toLowerCase() === 'system' || 
        el.hasAttribute('systemid') ||
        el.hasAttribute('systemId')
      );
      console.log("Found systems with case-insensitive search:", systemElements.length);
      systems.push(...systemElements);
    }

    // Debug: lista tutti gli elementi trovati
    console.log("Total systems found:", systems.length);
    systems.forEach((sys, index) => {
      console.log(`System ${index + 1}:`, {
        tagName: sys.tagName,
        systemid: sys.getAttribute('systemid') || sys.getAttribute('systemId'),
        attributes: Array.from(sys.attributes).map(attr => `${attr.name}="${attr.value}"`).join(' ')
      });
    });

    return systems;
  }

  /**
   * Estrae informazioni da un elemento System
   */
  private static parseSystemElement(systemElement: Element): SapSystemFromXml | null {
    // Prova diversi attributi per il system ID
    const systemId = systemElement.getAttribute("systemid") || 
                     systemElement.getAttribute("systemId") || 
                     systemElement.getAttribute("sid") ||
                     systemElement.getAttribute("name") ||
                     systemElement.getAttribute("id");
                     
    const description = systemElement.getAttribute("description") || 
                       systemElement.getAttribute("desc") ||
                       systemElement.textContent?.trim() || "";

    console.log("Parsing system element:", {
      tagName: systemElement.tagName,
      systemId,
      description,
      allAttributes: Array.from(systemElement.attributes).map(attr => `${attr.name}="${attr.value}"`).join(' ')
    });

    if (!systemId) {
      throw new Error("System element missing system identifier (tried: systemid, systemId, sid, name, id)");
    }

    // Cerca servizi all'interno del sistema
    const items = systemElement.querySelectorAll("Item");
    let bestService: Element | null = null;
    
    console.log(`System ${systemId} - Found ${items.length} items`);

    // Prova a trovare un servizio WinGui o WebGui
    for (const item of Array.from(items)) {
      const services = Array.from(item.querySelectorAll("Service"));
      console.log(`  Item has ${services.length} services`);
      for (const service of services) {
        const serviceType = service.getAttribute("type");
        console.log(`    Service type: ${serviceType}`);
        if (serviceType === "WinGui" || serviceType === "SAPGUI") {
          bestService = service;
          break;
        }
      }
      if (bestService) break;
    }

    // Se non trova WinGui, usa il primo servizio disponibile
    if (!bestService) {
      const allServices = Array.from(systemElement.querySelectorAll("Service"));
      console.log(`No WinGui service found, trying ${allServices.length} total services`);
      if (allServices.length > 0) {
        bestService = allServices[0];
      }
    }

    // Se ancora non trova servizi, prova a estrarre info direttamente dall'elemento system
    let server: string | null = null;
    let systemNumber: string | null = null;
    let clientNumber: string | null = null;

    if (bestService) {
      console.log(`Using service:`, bestService.outerHTML.substring(0, 200));
      
      // Estrae informazioni dal servizio
      server = bestService.getAttribute("server") || 
               bestService.getAttribute("host") || 
               bestService.getAttribute("hostname");
      systemNumber = bestService.getAttribute("systemNumber") || 
                     bestService.getAttribute("sysnr") ||
                     bestService.getAttribute("instance");
      clientNumber = bestService.getAttribute("clientNumber") || 
                     bestService.getAttribute("client") ||
                     bestService.getAttribute("mandt");
    } else {
      console.log(`No services found, trying to extract info from system element directly`);
      
      // Prova a estrarre direttamente dall'elemento system
      server = systemElement.getAttribute("server") || 
               systemElement.getAttribute("host") || 
               systemElement.getAttribute("hostname");
      systemNumber = systemElement.getAttribute("systemNumber") || 
                     systemElement.getAttribute("sysnr") ||
                     systemElement.getAttribute("instance") ||
                     "00"; // Default SAP
      clientNumber = systemElement.getAttribute("clientNumber") || 
                     systemElement.getAttribute("client") ||
                     systemElement.getAttribute("mandt") ||
                     "100"; // Default SAP
    }
    
    console.log(`Extracted data:`, { server, systemNumber, clientNumber });
    
    // Gestione più robusta dei campi mancanti
    if (!server) {
      console.warn(`No server information found for system ${systemId}, skipping...`);
      return null; // Invece di lanciare errore, ritorna null per saltare questo sistema
    }

    // Gestione port nel server string (es: "server:port")
    let finalServer = server;
    let applicationServerPort = 3200; // Default SAP
    
    if (server.includes(':')) {
      const parts = server.split(':');
      finalServer = parts[0];
      const portStr = parts[1];
      const port = parseInt(portStr);
      if (!isNaN(port)) {
        applicationServerPort = port;
      }
    }

    // Usa valori di default se non trova system number o client
    if (!systemNumber) {
      console.warn(`No system number found for system ${systemId}, using default '00'`);
      systemNumber = "00";
    }

    if (!clientNumber) {
      console.warn(`No client number found for system ${systemId}, using default '100'`);
      clientNumber = "100";
    }

    // Verifica che i valori siano nel formato corretto
    if (!/^\d{2}$/.test(systemNumber)) {
      console.warn(`Invalid system number format for ${systemId}: ${systemNumber}, using '00'`);
      systemNumber = "00";
    }

    if (!/^\d{3}$/.test(clientNumber)) {
      console.warn(`Invalid client number format for ${systemId}: ${clientNumber}, using '100'`);
      clientNumber = "100";
    }

    // Determina il tipo di sistema dal nome o descrizione
    const systemType = this.inferSystemType(systemId, description);
    
    // Determina il landscape dal nome del sistema
    const landscape = this.inferLandscape(systemId, description);

    // Se c'è ancora un servizio, prova a estrarre la porta da lì
    if (bestService) {
      const portAttr = bestService.getAttribute("port");
      if (portAttr) {
        const port = parseInt(portAttr);
        if (!isNaN(port)) {
          applicationServerPort = port;
        }
      }
    }

    return {
      name: systemId,
      description: description || undefined,
      serverHost: finalServer,
      systemNumber: systemNumber.padStart(2, '0'), // Assicura 2 cifre
      clientNumber: clientNumber.padStart(3, '0'), // Assicura 3 cifre
      applicationServerPort,
      messageServerPort: 3600, // Default SAP message server port
      systemType,
      status: "active" as const,
      landscape,
      sapReleaseVersion: undefined,
      kernelVersion: undefined,
      notes: undefined,
      isActive: true,
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
   * Inferisce il landscape dal nome del sistema, inclusi numeri di livello
   */
  private static inferLandscape(systemId: string, description: string): "development" | "test" | "production" {
    const text = (systemId + " " + description).toLowerCase();
    const systemId_upper = systemId.toUpperCase();
    
    // Pattern testuali espliciti
    if (text.includes("dev") || text.includes("development") || text.includes("sviluppo")) {
      return "development";
    }
    if (text.includes("test") || text.includes("qas") || text.includes("quality") || text.includes("collaudo")) {
      return "test";
    }
    if (text.includes("prod") || text.includes("production") || text.includes("produzione")) {
      return "production";
    }
    if (text.includes("preprod") || text.includes("pre-prod") || text.includes("staging")) {
      return "test"; // Pre-produzione considerato test
    }
    
    // Pattern basati su numeri nell'ID del sistema
    // Estrae numeri dall'ID del sistema
    const numberMatch = systemId.match(/\d+/);
    if (numberMatch) {
      const number = parseInt(numberMatch[0]);
      console.log(`System ${systemId} - detected number: ${number}`);
      
      // Logica flessibile per numeri
      switch (number) {
        case 1:
          console.log(`System ${systemId} - number 1 = development`);
          return "development";
        case 2:
          console.log(`System ${systemId} - number 2 = test`);
          return "test";
        case 3:
          // 3 può essere quality/test o produzione, controlliamo ulteriori indizi
          if (systemId_upper.includes("Q") || text.includes("quality") || text.includes("qas")) {
            console.log(`System ${systemId} - number 3 with quality indicators = test`);
            return "test";
          } else {
            console.log(`System ${systemId} - number 3 = production`);
            return "production";
          }
        case 4:
          // 4 spesso è pre-produzione
          console.log(`System ${systemId} - number 4 = test (pre-prod)`);
          return "test";
        case 5:
        case 6:
        case 7:
        case 8:
        case 9:
          // Numeri alti tipicamente produzione
          console.log(`System ${systemId} - high number ${number} = production`);
          return "production";
        default:
          console.log(`System ${systemId} - number ${number} = using text analysis`);
          break;
      }
    }
    
    // Pattern basati su lettere standard SAP
    if (systemId_upper.includes("DEV") || systemId_upper.includes("D")) {
      return "development";
    }
    if (systemId_upper.includes("QAS") || systemId_upper.includes("Q") || systemId_upper.includes("TST") || systemId_upper.includes("T")) {
      return "test";
    }
    if (systemId_upper.includes("PRD") || systemId_upper.includes("P")) {
      return "production";
    }
    
    // Pattern basati su suffissi comuni
    if (systemId_upper.endsWith("D") || systemId_upper.endsWith("DEV")) {
      return "development";
    }
    if (systemId_upper.endsWith("Q") || systemId_upper.endsWith("T") || systemId_upper.endsWith("TST")) {
      return "test";
    }
    if (systemId_upper.endsWith("P") || systemId_upper.endsWith("PRD")) {
      return "production";
    }
    
    console.log(`System ${systemId} - no pattern matched, defaulting to production`);
    return "production"; // Default
  }
}