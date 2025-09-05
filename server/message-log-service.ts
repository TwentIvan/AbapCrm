import { db } from "./db";
import { messageLinks, messages, type InsertMessageLink, type MessageLink } from "@shared/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import type { Request } from "express";

interface MessageLinkContext {
  userId: string;
  organizationId: string;
  userAgent?: string;
  ipAddress?: string;
}

export class MessageLogService {
  /**
   * Create a link between a message and any entity in the system
   */
  static async linkMessage(
    messageId: string,
    linkedTableName: string,
    linkedRecordId: string,
    context: MessageLinkContext,
    options: {
      linkType?: "discussion" | "attachment" | "reference" | "notification";
      isAutomatic?: boolean;
      notes?: string;
    } = {}
  ): Promise<MessageLink> {
    try {
      const linkData = {
        messageId,
        linkedTableName,
        linkedRecordId,
        linkType: options.linkType || "discussion",
        isAutomatic: options.isAutomatic || false,
        userId: context.userId,
        organizationId: context.organizationId,
        notes: options.notes || null,
      };

      const [link] = await db
        .insert(messageLinks)
        .values(linkData)
        .returning();

      console.log(`[MESSAGE-LOG] ✅ LINKED message ${messageId} to ${linkedTableName}:${linkedRecordId} (${options.linkType || 'discussion'}) by user:${context.userId}`);
      
      return link;
    } catch (error) {
      console.error(`[MESSAGE-LOG] ❌ Failed to link message ${messageId} to ${linkedTableName}:${linkedRecordId}:`, error);
      throw error;
    }
  }

  /**
   * Get all messages linked to a specific entity
   */
  static async getLinkedMessages(
    tableName: string,
    recordId: string,
    organizationId: string
  ): Promise<Array<MessageLink & { message: any }>> {
    try {
      const links = await db.query.messageLinks.findMany({
        where: and(
          eq(messageLinks.linkedTableName, tableName),
          eq(messageLinks.linkedRecordId, recordId),
          eq(messageLinks.organizationId, organizationId)
        ),
        with: {
          message: {
            with: {
              user: {
                columns: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  email: true,
                }
              }
            }
          },
          user: {
            columns: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            }
          }
        },
        orderBy: desc(messageLinks.createdAt),
      });

      return links;
    } catch (error) {
      console.error(`[MESSAGE-LOG] ❌ Failed to get linked messages for ${tableName}:${recordId}:`, error);
      throw error;
    }
  }

  /**
   * Remove a message link
   */
  static async unlinkMessage(linkId: string, userId: string): Promise<boolean> {
    try {
      const result = await db
        .delete(messageLinks)
        .where(eq(messageLinks.id, linkId))
        .returning();

      if (result.length > 0) {
        console.log(`[MESSAGE-LOG] ✅ UNLINKED message link ${linkId} by user:${userId}`);
        return true;
      }

      return false;
    } catch (error) {
      console.error(`[MESSAGE-LOG] ❌ Failed to unlink message ${linkId}:`, error);
      throw error;
    }
  }

  /**
   * Get all links for a specific message
   */
  static async getMessageLinks(messageId: string): Promise<MessageLink[]> {
    try {
      return await db.query.messageLinks.findMany({
        where: eq(messageLinks.messageId, messageId),
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
        orderBy: desc(messageLinks.createdAt),
      });
    } catch (error) {
      console.error(`[MESSAGE-LOG] ❌ Failed to get links for message ${messageId}:`, error);
      throw error;
    }
  }

  /**
   * Update link notes or type
   */
  static async updateLink(
    linkId: string,
    updates: { notes?: string; linkType?: "discussion" | "attachment" | "reference" | "notification" },
    userId: string
  ): Promise<MessageLink | null> {
    try {
      const [updated] = await db
        .update(messageLinks)
        .set(updates)
        .where(eq(messageLinks.id, linkId))
        .returning();

      if (updated) {
        console.log(`[MESSAGE-LOG] ✅ UPDATED message link ${linkId} by user:${userId}`);
      }

      return updated || null;
    } catch (error) {
      console.error(`[MESSAGE-LOG] ❌ Failed to update message link ${linkId}:`, error);
      throw error;
    }
  }

  /**
   * Create context from Express request (similar to AuditService)
   */
  static createContext(req: Request): MessageLinkContext {
    const user = req.user as any;
    
    // Use the same getOrganizationId function as the routes
    const getOrganizationId = (r: any): string => {
      const organizationId = r.headers['x-organization-id'] as string;
      // Return default organization if header not present
      return organizationId || '4ca22699-5fd4-4030-8bb5-4e7cef9ce8be';
    };
    
    return {
      userId: user?.id,
      organizationId: getOrganizationId(req),
      userAgent: req.get('User-Agent'),
      ipAddress: req.ip || req.connection.remoteAddress,
    };
  }

  /**
   * Bulk link a message to multiple entities
   */
  static async linkMessageBulk(
    messageId: string,
    links: Array<{
      tableName: string;
      recordId: string;
      linkType?: "discussion" | "attachment" | "reference" | "notification";
      notes?: string;
    }>,
    context: MessageLinkContext,
    isAutomatic: boolean = false
  ): Promise<MessageLink[]> {
    try {
      const linkData = links.map(link => ({
        messageId,
        linkedTableName: link.tableName,
        linkedRecordId: link.recordId,
        linkType: link.linkType || "discussion",
        isAutomatic,
        userId: context.userId,
        organizationId: context.organizationId,
        notes: link.notes || null,
      }));

      const results = await db
        .insert(messageLinks)
        .values(linkData)
        .returning();

      console.log(`[MESSAGE-LOG] ✅ BULK LINKED message ${messageId} to ${links.length} entities by user:${context.userId}`);
      
      return results;
    } catch (error) {
      console.error(`[MESSAGE-LOG] ❌ Failed to bulk link message ${messageId}:`, error);
      throw error;
    }
  }
}