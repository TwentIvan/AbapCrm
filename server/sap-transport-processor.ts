import { storage } from "./storage";
import { nanoid } from "nanoid";
import { z } from "zod";
import type { 
  InsertSapTransportRequest, 
  InsertSapTransportTask,
  InsertSapTransportObject,
  InsertSapObjectContent 
} from "@shared/schema";

// Schema Zod completo per validazione JSON Transport Request
const TransportContentSchema = z.object({
  line_number: z.number().int().positive(),
  content: z.string()
});

const TransportObjectSchema = z.object({
  object_name: z.string().min(1, "object_name obbligatorio"),
  object_type: z.enum(["program", "class", "function", "table", "view", "report", "screen", "smartform", "webdynpro", "other"]).optional(),
  lock_status: z.string().optional(),
  content: z.array(TransportContentSchema).optional()
});

const TransportTaskSchema = z.object({
  task_number: z.string().min(1, "task_number obbligatorio"),
  description: z.string().optional(),
  user: z.string().min(1, "user obbligatorio per task"),
  status: z.enum(["modifiable", "released", "imported", "error"]).optional()
});

const TransportRequestJsonSchema = z.object({
  request_number: z.string().min(1, "request_number obbligatorio"),
  description: z.string().min(1, "description obbligatoria"),
  owner: z.string().min(1, "owner obbligatorio"),
  project_id: z.string().uuid("project_id deve essere un UUID valido"),
  status: z.enum(["modifiable", "released", "imported", "error"]).optional(),
  target_system: z.string().optional(),
  release_date: z.string().datetime().optional(), // ISO 8601 format
  tasks: z.array(TransportTaskSchema).optional(),
  objects: z.array(TransportObjectSchema).optional()
});

type TransportRequestJson = z.infer<typeof TransportRequestJsonSchema>;

export class SapTransportProcessor {
  /**
   * Processa un JSON di Transport Request e lo salva nel database
   */
  static async processTransportRequestJson(
    jsonContent: string,
    userId: string,
    organizationId: string,
    messageId: string
  ): Promise<{ success: boolean; error?: string; requestId?: string }> {
    try {
      console.log(`[SAP-TR] Processing Transport Request JSON for user ${userId}`);
      
      // Parse del JSON
      let jsonData: any;
      try {
        jsonData = JSON.parse(jsonContent);
      } catch (error) {
        return { success: false, error: "JSON non valido o malformato" };
      }
      
      // Validazione Zod completa
      const validationResult = TransportRequestJsonSchema.safeParse(jsonData);
      if (!validationResult.success) {
        const errors = validationResult.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ');
        console.error(`[SAP-TR] Validation errors: ${errors}`);
        return { success: false, error: `Errori validazione JSON: ${errors}` };
      }
      
      const data = validationResult.data;
      
      // Verifica se la TR esiste già (include organizationId per multi-org)
      const existingRequests = await storage.getSapTransportRequests(userId);
      const existingRequest = existingRequests.find(
        (r) => r.requestNumber === data.request_number && r.organizationId === organizationId
      );
      
      if (existingRequest) {
        console.log(`[SAP-TR] Transport Request ${data.request_number} già esistente, skip`);
        return { 
          success: true, 
          requestId: existingRequest.id,
          error: "Transport Request già presente nel sistema" 
        };
      }
      
      // Crea la Transport Request (data.release_date già validata da Zod)
      const requestData: InsertSapTransportRequest = {
        userId,
        organizationId,
        projectId: data.project_id,
        requestNumber: data.request_number,
        description: data.description,
        status: data.status || "modifiable",
        owner: data.owner,
        targetSystem: data.target_system || null,
        releasedDate: data.release_date ? new Date(data.release_date) : null
      };
      
      const newRequest = await storage.createSapTransportRequest(requestData);
      console.log(`[SAP-TR] Created Transport Request ${newRequest.requestNumber} (${newRequest.id})`);
      
      // Processa Tasks se presenti (già validati da Zod)
      if (data.tasks && data.tasks.length > 0) {
        for (const task of data.tasks) {
          const taskData: InsertSapTransportTask = {
            requestId: newRequest.id,
            taskNumber: task.task_number,
            description: task.description || null,
            owner: task.user,
            status: task.status || "modifiable",
            taskType: "development" // Default
          };
          
          await storage.createSapTransportTask(taskData);
        }
        console.log(`[SAP-TR] Created ${data.tasks.length} tasks for ${newRequest.requestNumber}`);
      }
      
      // Processa Objects se presenti (già validati da Zod)
      if (data.objects && data.objects.length > 0) {
        for (const obj of data.objects) {
          const objectData: InsertSapTransportObject = {
            requestId: newRequest.id,
            objectName: obj.object_name,
            objectType: obj.object_type || "other",
            lockStatus: obj.lock_status || null
          };
          
          const newObject = await storage.createSapTransportObject(objectData);
          
          // Processa Content se presente
          if (obj.content && obj.content.length > 0) {
            for (const contentLine of obj.content) {
              const contentData: InsertSapObjectContent = {
                objectId: newObject.id,
                contentType: "source", // Default type
                content: contentLine.content,
                lineNumber: contentLine.line_number
              };
              
              await storage.createSapObjectContent(contentData);
            }
          }
        }
        console.log(`[SAP-TR] Created ${data.objects.length} objects for ${newRequest.requestNumber}`);
      }
      
      return { 
        success: true, 
        requestId: newRequest.id 
      };
      
    } catch (error) {
      console.error("[SAP-TR] Error processing Transport Request JSON:", error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : "Errore sconosciuto" 
      };
    }
  }
  
  /**
   * Verifica se un file è un JSON valido di Transport Request
   */
  static isTransportRequestJson(filename: string, content: Buffer): boolean {
    // Controlla estensione
    if (!filename.toLowerCase().endsWith('.json')) {
      return false;
    }
    
    try {
      // Tenta il parse
      const data = JSON.parse(content.toString('utf-8'));
      
      // Verifica che contenga almeno request_number
      return typeof data === 'object' && 
             data !== null && 
             'request_number' in data;
    } catch {
      return false;
    }
  }
}
