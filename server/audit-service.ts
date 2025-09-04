import { db } from "./db";
import { auditLogs, type InsertAuditLog } from "@shared/schema";
import { eq, and, inArray, lt, desc } from "drizzle-orm";
import type { Request } from "express";

type AuditableData = Record<string, any>;

interface AuditContext {
  userId: string;
  organizationId?: string;
  userAgent?: string;
  ipAddress?: string;
}

export class AuditService {
  /**
   * Log a change to any entity
   */
  static async logChange(
    tableName: string,
    recordId: string,
    action: "CREATE" | "UPDATE" | "DELETE",
    context: AuditContext,
    oldValues?: AuditableData,
    newValues?: AuditableData
  ) {
    try {
      const changedFields: string[] = [];
      
      // Calculate changed fields for UPDATE operations
      if (action === "UPDATE" && oldValues && newValues) {
        for (const [key, newValue] of Object.entries(newValues)) {
          const oldValue = oldValues[key];
          if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
            changedFields.push(key);
          }
        }
      }

      // Helper function to create clean object for JSONB storage
      const safeSerialize = (obj: any): any => {
        if (!obj) return null;
        
        try {
          // Create a clean object for JSONB
          const cleanObj: any = {};
          
          for (const [key, value] of Object.entries(obj)) {
            // Skip problematic keys
            if (key.includes('$') || key.includes('.')) {
              continue;
            }
            
            if (value === null || value === undefined) {
              cleanObj[key] = null;
            } else if (value instanceof Date) {
              cleanObj[key] = value.toISOString();
            } else if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
              cleanObj[key] = value;
            } else if (Array.isArray(value)) {
              cleanObj[key] = value.filter(v => v !== null && v !== undefined);
            } else {
              // For complex objects, convert to string
              cleanObj[key] = String(value);
            }
          }
          
          return cleanObj; // Return object directly for JSONB
        } catch (err) {
          console.error("[AUDIT] Object serialization failed:", err);
          
          return {
            record_id: String(obj?.id || 'unknown'),
            audit_error: 'Failed to serialize data'
          };
        }
      };

      const auditEntry: InsertAuditLog = {
        tableName,
        recordId,
        action,
        oldValues: oldValues ? safeSerialize(oldValues) : null,
        newValues: newValues ? safeSerialize(newValues) : null,
        changedFields: changedFields.length > 0 ? changedFields : null,
        userId: context.userId,
        organizationId: context.organizationId || null,
        userAgent: context.userAgent || null,
        ipAddress: context.ipAddress || null,
      };

      console.log("[AUDIT] Attempting to save:", JSON.stringify(auditEntry, null, 2));
      await db.insert(auditLogs).values(auditEntry);
      
      console.log(`[AUDIT] ${action} ${tableName}:${recordId} by user:${context.userId}`);
    } catch (error) {
      console.error("[AUDIT] Failed to log change:", error);
      // Don't throw - audit failure shouldn't break the main operation
    }
  }

  /**
   * Create audit context from Express request
   */
  static createContext(req: Request): AuditContext {
    const user = req.user as any;
    return {
      userId: user?.id,
      organizationId: user?.organizationId,
      userAgent: req.get('User-Agent'),
      ipAddress: req.ip || req.connection.remoteAddress,
    };
  }

  /**
   * Helper for CREATE operations
   */
  static async logCreate(
    tableName: string,
    recordId: string,
    newValues: AuditableData,
    context: AuditContext
  ) {
    return this.logChange(tableName, recordId, "CREATE", context, undefined, newValues);
  }

  /**
   * Helper for UPDATE operations
   */
  static async logUpdate(
    tableName: string,
    recordId: string,
    oldValues: AuditableData,
    newValues: AuditableData,
    context: AuditContext
  ) {
    return this.logChange(tableName, recordId, "UPDATE", context, oldValues, newValues);
  }

  /**
   * Helper for DELETE operations
   */
  static async logDelete(
    tableName: string,
    recordId: string,
    oldValues: AuditableData,
    context: AuditContext
  ) {
    return this.logChange(tableName, recordId, "DELETE", context, oldValues, undefined);
  }

  /**
   * Get audit history for a specific record
   */
  static async getAuditHistory(tableName: string, recordId: string) {
    return await db.query.auditLogs.findMany({
      where: and(
        eq(auditLogs.tableName, tableName),
        eq(auditLogs.recordId, recordId)
      ),
      with: {
        user: {
          columns: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          }
        }
      },
      orderBy: desc(auditLogs.createdAt),
    });
  }

  /**
   * Get audit history for multiple records (useful for bulk operations)
   */
  static async getAuditHistoryBulk(tableName: string, recordIds: string[]) {
    return await db.query.auditLogs.findMany({
      where: and(
        eq(auditLogs.tableName, tableName),
        inArray(auditLogs.recordId, recordIds)
      ),
      with: {
        user: {
          columns: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          }
        }
      },
      orderBy: desc(auditLogs.createdAt),
    });
  }

  /**
   * Clean old audit logs (for maintenance)
   */
  static async cleanOldLogs(daysToKeep: number = 365) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
    
    const result = await db.delete(auditLogs)
      .where(lt(auditLogs.createdAt, cutoffDate));
    
    console.log(`[AUDIT] Cleaned ${result.rowCount} old audit logs`);
    return result;
  }
}