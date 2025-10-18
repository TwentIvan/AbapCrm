/**
 * CustomMetadataService - Manages entity schemas with custom fields
 * 
 * Provides dynamic schema resolution, validation, and caching for entities
 * extended with user-defined custom fields.
 */

import { z } from "zod";
import { db } from "./db";
import { customEntities, customFields, type CustomEntity, type CustomField } from "@shared/schema";
import { eq, and } from "drizzle-orm";

// ========================================
// Types
// ========================================

export interface FieldDefinition {
  fieldKey: string;
  label: string;
  description?: string;
  fieldType: "text" | "number" | "date" | "boolean" | "select" | "relation";
  isRequired: boolean;
  isUnique: boolean;
  isSystem: boolean; // True for core schema fields, false for custom fields
  defaultValue?: any;
  validationRules?: Record<string, any>;
  options?: Array<{ value: string; label: string }>; // For select type
  relationTargetEntityId?: string; // For relation type
  uiSchema?: Record<string, any>;
}

export interface EntitySchema {
  entityKey: string;
  name: string;
  description?: string;
  isSystem: boolean;
  icon?: string;
  color?: string;
  fields: FieldDefinition[];
  customFields: FieldDefinition[]; // Subset of fields that are custom
}

// Cache structure
interface CacheEntry {
  schema: EntitySchema;
  timestamp: number;
  etag: string;
}

// ========================================
// CustomMetadataService Class
// ========================================

class CustomMetadataServiceClass {
  private cache: Map<string, CacheEntry> = new Map();
  private cacheTTL = 5 * 60 * 1000; // 5 minutes
  
  /**
   * Get complete entity schema (core + custom fields)
   */
  async getEntitySchema(
    organizationId: string,
    entityKey: string
  ): Promise<EntitySchema | null> {
    // Check cache first
    const cacheKey = `${organizationId}:${entityKey}`;
    const cached = this.cache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
      console.log(`[Metadata] Cache hit for ${entityKey} (org: ${organizationId})`);
      return cached.schema;
    }
    
    console.log(`[Metadata] Loading schema for ${entityKey} (org: ${organizationId})`);
    
    // Load entity definition
    const [entity] = await db
      .select()
      .from(customEntities)
      .where(
        and(
          eq(customEntities.organizationId, organizationId),
          eq(customEntities.slug, entityKey)
        )
      )
      .limit(1);
    
    if (!entity) {
      // Entity not found (not yet registered as custom entity)
      console.log(`[Metadata] Entity ${entityKey} not found in custom_entities`);
      return null;
    }
    
    // Load custom fields for this entity
    const fields = await db
      .select()
      .from(customFields)
      .where(
        and(
          eq(customFields.entityId, entity.id),
          eq(customFields.organizationId, organizationId),
          eq(customFields.status, "active")
        )
      );
    
    console.log(`[Metadata] Found ${fields.length} custom fields for ${entityKey}`);
    
    // Build schema
    const schema: EntitySchema = {
      entityKey: entity.slug,
      name: entity.name,
      description: entity.description || undefined,
      isSystem: entity.isSystem,
      icon: entity.icon || undefined,
      color: entity.color || undefined,
      fields: [],
      customFields: [],
    };
    
    // Add custom fields
    for (const field of fields) {
      const fieldDef: FieldDefinition = {
        fieldKey: field.fieldKey,
        label: field.label,
        description: field.description || undefined,
        fieldType: field.fieldType,
        isRequired: field.isRequired,
        isUnique: field.isUnique,
        isSystem: false,
        defaultValue: field.defaultValue || undefined,
        validationRules: (field.validationRules as Record<string, any>) || undefined,
        options: (field.options as Array<{ value: string; label: string }>) || undefined,
        relationTargetEntityId: field.relationTargetEntityId || undefined,
        uiSchema: (field.uiSchema as Record<string, any>) || undefined,
      };
      
      schema.fields.push(fieldDef);
      schema.customFields.push(fieldDef);
    }
    
    // Generate etag
    const etag = this.generateEtag(schema);
    
    // Cache it
    this.cache.set(cacheKey, {
      schema,
      timestamp: Date.now(),
      etag,
    });
    
    return schema;
  }
  
  /**
   * Build Zod schema for runtime validation
   */
  buildZodSchema(entitySchema: EntitySchema): z.ZodObject<any> {
    const shape: Record<string, z.ZodTypeAny> = {};
    
    for (const field of entitySchema.fields) {
      let zodField: z.ZodTypeAny;
      
      // Base type
      switch (field.fieldType) {
        case "text":
          zodField = z.string();
          if (field.validationRules?.minLength) {
            zodField = zodField.min(field.validationRules.minLength);
          }
          if (field.validationRules?.maxLength) {
            zodField = zodField.max(field.validationRules.maxLength);
          }
          if (field.validationRules?.pattern) {
            zodField = zodField.regex(new RegExp(field.validationRules.pattern));
          }
          break;
          
        case "number":
          zodField = z.number();
          if (field.validationRules?.min !== undefined) {
            zodField = zodField.min(field.validationRules.min);
          }
          if (field.validationRules?.max !== undefined) {
            zodField = zodField.max(field.validationRules.max);
          }
          break;
          
        case "date":
          zodField = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
          break;
          
        case "boolean":
          zodField = z.boolean();
          break;
          
        case "select":
          if (field.options && field.options.length > 0) {
            const values = field.options.map(opt => opt.value) as [string, ...string[]];
            zodField = z.enum(values);
          } else {
            zodField = z.string();
          }
          break;
          
        case "relation":
          zodField = z.string().uuid(); // Relation is a UUID reference
          break;
          
        default:
          zodField = z.any();
      }
      
      // Make optional if not required
      if (!field.isRequired) {
        zodField = zodField.optional();
      }
      
      // Add default value
      if (field.defaultValue !== undefined) {
        zodField = zodField.default(field.defaultValue);
      }
      
      shape[field.fieldKey] = zodField;
    }
    
    return z.object(shape);
  }
  
  /**
   * Validate custom field values
   */
  validateFieldValue(
    field: FieldDefinition,
    value: any
  ): { valid: boolean; error?: string } {
    try {
      // Build Zod schema for single field
      let zodField: z.ZodTypeAny;
      
      switch (field.fieldType) {
        case "text":
          zodField = z.string();
          if (field.validationRules?.minLength) {
            zodField = zodField.min(field.validationRules.minLength);
          }
          if (field.validationRules?.maxLength) {
            zodField = zodField.max(field.validationRules.maxLength);
          }
          if (field.validationRules?.pattern) {
            zodField = zodField.regex(new RegExp(field.validationRules.pattern));
          }
          break;
          
        case "number":
          zodField = z.number();
          if (field.validationRules?.min !== undefined) {
            zodField = zodField.min(field.validationRules.min);
          }
          if (field.validationRules?.max !== undefined) {
            zodField = zodField.max(field.validationRules.max);
          }
          break;
          
        case "date":
          zodField = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
          break;
          
        case "boolean":
          zodField = z.boolean();
          break;
          
        case "select":
          if (field.options && field.options.length > 0) {
            const values = field.options.map(opt => opt.value) as [string, ...string[]];
            zodField = z.enum(values);
          } else {
            zodField = z.string();
          }
          break;
          
        case "relation":
          zodField = z.string().uuid();
          break;
          
        default:
          zodField = z.any();
      }
      
      if (!field.isRequired) {
        zodField = zodField.optional();
      }
      
      // Validate
      zodField.parse(value);
      return { valid: true };
    } catch (error) {
      if (error instanceof z.ZodError) {
        return { valid: false, error: error.errors[0]?.message || "Validation failed" };
      }
      return { valid: false, error: String(error) };
    }
  }
  
  /**
   * Get field definition by key
   */
  getFieldDefinition(entitySchema: EntitySchema, fieldKey: string): FieldDefinition | null {
    return entitySchema.fields.find(f => f.fieldKey === fieldKey) || null;
  }
  
  /**
   * Check if field is required
   */
  isFieldRequired(entitySchema: EntitySchema, fieldKey: string): boolean {
    const field = this.getFieldDefinition(entitySchema, fieldKey);
    return field?.isRequired || false;
  }
  
  /**
   * Get field type
   */
  getFieldType(entitySchema: EntitySchema, fieldKey: string): FieldDefinition["fieldType"] | null {
    const field = this.getFieldDefinition(entitySchema, fieldKey);
    return field?.fieldType || null;
  }
  
  /**
   * Invalidate cache for an entity
   */
  invalidateEntitySchema(organizationId: string, entityKey: string): void {
    const cacheKey = `${organizationId}:${entityKey}`;
    this.cache.delete(cacheKey);
    console.log(`[Metadata] Cache invalidated for ${entityKey} (org: ${organizationId})`);
  }
  
  /**
   * Invalidate all cache for an organization
   */
  invalidateOrganizationCache(organizationId: string): void {
    const keysToDelete: string[] = [];
    for (const [key] of this.cache) {
      if (key.startsWith(`${organizationId}:`)) {
        keysToDelete.push(key);
      }
    }
    keysToDelete.forEach(key => this.cache.delete(key));
    console.log(`[Metadata] Cache invalidated for organization ${organizationId} (${keysToDelete.length} entries)`);
  }
  
  /**
   * Clear all cache
   */
  clearCache(): void {
    this.cache.clear();
    console.log("[Metadata] All cache cleared");
  }
  
  /**
   * Generate etag for schema
   */
  private generateEtag(schema: EntitySchema): string {
    const hash = JSON.stringify({
      entityKey: schema.entityKey,
      fields: schema.fields.map(f => ({
        key: f.fieldKey,
        type: f.fieldType,
        required: f.isRequired,
      })),
    });
    
    // Simple hash function
    let etag = 0;
    for (let i = 0; i < hash.length; i++) {
      etag = ((etag << 5) - etag) + hash.charCodeAt(i);
      etag = etag & etag; // Convert to 32-bit integer
    }
    return Math.abs(etag).toString(36);
  }
}

// ========================================
// Singleton Instance
// ========================================

export const CustomMetadataService = new CustomMetadataServiceClass();
