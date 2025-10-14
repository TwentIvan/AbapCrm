import { storage } from "./storage";
import { nanoid } from "nanoid";
import type { 
  InsertSapTransportRequest, 
  InsertSapTransportTask,
  InsertSapTransportObject,
  InsertSapObjectContent 
} from "@shared/schema";

interface TransportRequestJson {
  request_number: string;
  description?: string;
  status?: string;
  owner?: string;
  target_system?: string;
  release_date?: string;
  project_id?: string;
  tasks?: Array<{
    task_number: string;
    description?: string;
    user?: string;
    status?: string;
  }>;
  objects?: Array<{
    object_name: string;
    object_type?: string;
    description?: string;
    lock_status?: string;
    content?: Array<{
      line_number: number;
      content: string;
    }>;
  }>;
}

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
      const data: TransportRequestJson = JSON.parse(jsonContent);
      
      // Validazione campi obbligatori
      if (!data.request_number) {
        return { success: false, error: "Campo 'request_number' mancante nel JSON" };
      }
      if (!data.description) {
        return { success: false, error: "Campo 'description' mancante nel JSON" };
      }
      if (!data.owner) {
        return { success: false, error: "Campo 'owner' mancante nel JSON" };
      }
      if (!data.project_id) {
        return { success: false, error: "Campo 'project_id' mancante nel JSON" };
      }
      
      // Verifica se la TR esiste già
      const existingRequests = await storage.getSapTransportRequests(userId);
      const existingRequest = existingRequests.find(
        (r) => r.requestNumber === data.request_number
      );
      
      if (existingRequest) {
        console.log(`[SAP-TR] Transport Request ${data.request_number} già esistente, skip`);
        return { 
          success: true, 
          requestId: existingRequest.id,
          error: "Transport Request già presente nel sistema" 
        };
      }
      
      // Crea la Transport Request
      const requestData: InsertSapTransportRequest = {
        userId,
        organizationId,
        projectId: data.project_id,
        requestNumber: data.request_number,
        description: data.description,
        status: (data.status as "modifiable" | "released" | "imported" | "error") || "modifiable",
        owner: data.owner,
        targetSystem: data.target_system || null,
        releasedDate: data.release_date ? new Date(data.release_date) : null
      };
      
      const newRequest = await storage.createSapTransportRequest(requestData);
      console.log(`[SAP-TR] Created Transport Request ${newRequest.requestNumber} (${newRequest.id})`);
      
      // Processa Tasks se presenti
      if (data.tasks && data.tasks.length > 0) {
        for (const task of data.tasks) {
          if (!task.user) {
            console.warn(`[SAP-TR] Task ${task.task_number} skipped - missing 'user' field`);
            continue;
          }
          
          const taskData: InsertSapTransportTask = {
            requestId: newRequest.id,
            taskNumber: task.task_number,
            description: task.description || null,
            owner: task.user,
            status: (task.status as "modifiable" | "released" | "imported" | "error") || "modifiable",
            taskType: "development" // Default
          };
          
          await storage.createSapTransportTask(taskData);
        }
        console.log(`[SAP-TR] Created ${data.tasks.length} tasks for ${newRequest.requestNumber}`);
      }
      
      // Processa Objects se presenti
      if (data.objects && data.objects.length > 0) {
        for (const obj of data.objects) {
          const objectData: InsertSapTransportObject = {
            requestId: newRequest.id,
            objectName: obj.object_name,
            objectType: (obj.object_type as "program" | "class" | "function" | "table" | "view" | "report" | "screen" | "smartform" | "webdynpro" | "other") || "other",
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
