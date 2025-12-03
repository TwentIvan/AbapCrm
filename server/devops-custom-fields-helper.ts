/**
 * DevOps Custom Fields Helper
 * 
 * Gestisce l'integrazione tra i campi DevOps e il sistema custom fields esistente.
 * I campi non mappati direttamente vengono salvati come entity_custom_values.
 */

import { db } from "./db";
import { devopsFieldMappings, customEntities, customFields, entityCustomValues } from "@shared/schema";
import { eq, and, sql } from "drizzle-orm";

export interface DevOpsFieldMapping {
  devopsFieldName: string;
  targetEntity: string;
  targetField: string;
}

export interface UnmappedField {
  fieldName: string;
  fieldValue: any;
  fieldType: 'text' | 'number' | 'date' | 'boolean' | 'select';
}

export class DevOpsCustomFieldsHelper {
  
  /**
   * Recupera i mapping dei campi DevOps per un'organizzazione
   */
  static async getFieldMappings(organizationId: string): Promise<DevOpsFieldMapping[]> {
    const mappings = await db
      .select()
      .from(devopsFieldMappings)
      .where(eq(devopsFieldMappings.organizationId, organizationId));
    
    return mappings.map(m => ({
      devopsFieldName: m.devopsField,
      targetEntity: m.targetEntity,
      targetField: m.targetField
    }));
  }
  
  /**
   * Identifica quali campi sono mappati e quali non lo sono
   */
  static async categorizeFields(
    organizationId: string,
    devopsFields: Record<string, any>
  ): Promise<{
    mappedFields: Record<string, { targetEntity: string; targetField: string; value: any }>;
    unmappedFields: UnmappedField[];
  }> {
    const mappings = await this.getFieldMappings(organizationId);
    const mappingLookup = new Map(mappings.map(m => [m.devopsFieldName, m]));
    
    const mappedFields: Record<string, { targetEntity: string; targetField: string; value: any }> = {};
    const unmappedFields: UnmappedField[] = [];
    
    for (const [fieldName, fieldValue] of Object.entries(devopsFields)) {
      const mapping = mappingLookup.get(fieldName);
      
      if (mapping) {
        mappedFields[fieldName] = {
          targetEntity: mapping.targetEntity,
          targetField: mapping.targetField,
          value: fieldValue
        };
      } else {
        const fieldType = this.inferFieldType(fieldValue);
        unmappedFields.push({
          fieldName,
          fieldValue,
          fieldType
        });
      }
    }
    
    return { mappedFields, unmappedFields };
  }
  
  /**
   * Inferisce il tipo di campo dal valore
   */
  static inferFieldType(value: any): 'text' | 'number' | 'date' | 'boolean' | 'select' {
    if (typeof value === 'boolean') return 'boolean';
    if (typeof value === 'number') return 'number';
    if (value instanceof Date) return 'date';
    if (typeof value === 'string') {
      // Check if it's a date string
      if (/^\d{4}-\d{2}-\d{2}/.test(value)) return 'date';
    }
    return 'text';
  }
  
  /**
   * Salva i campi non mappati come custom values per un'entità
   */
  static async saveUnmappedFieldsAsCustomValues(
    organizationId: string,
    entityKey: string,
    recordId: string,
    unmappedFields: UnmappedField[]
  ): Promise<void> {
    // Cerca l'entità custom per 'transport_requests' o crea se non esiste
    let [customEntity] = await db
      .select()
      .from(customEntities)
      .where(and(
        eq(customEntities.organizationId, organizationId),
        eq(customEntities.slug, entityKey)
      ))
      .limit(1);
    
    // Se non esiste l'entità custom, creala
    if (!customEntity) {
      const [newEntity] = await db
        .insert(customEntities)
        .values({
          organizationId,
          name: this.getEntityDisplayName(entityKey),
          slug: entityKey,
          description: `Entità per ${entityKey} con campi DevOps`,
          baseTable: entityKey,
          isSystem: false,
          icon: 'Database',
          color: '#f97316' // Orange for DevOps
        })
        .returning();
      customEntity = newEntity;
    }
    
    // Per ogni campo non mappato, crea o trova il custom field e salva il valore
    for (const field of unmappedFields) {
      // Cerca il custom field per questo nome
      let [customField] = await db
        .select()
        .from(customFields)
        .where(and(
          eq(customFields.organizationId, organizationId),
          eq(customFields.entityId, customEntity.id),
          eq(customFields.fieldKey, this.normalizeFieldKey(field.fieldName))
        ))
        .limit(1);
      
      // Se non esiste, crealo
      if (!customField) {
        const [newField] = await db
          .insert(customFields)
          .values({
            organizationId,
            entityId: customEntity.id,
            fieldKey: this.normalizeFieldKey(field.fieldName),
            label: this.getFieldLabel(field.fieldName),
            description: `Campo DevOps: ${field.fieldName}`,
            fieldType: field.fieldType,
            isRequired: false,
            isUnique: false,
            uiSchema: {
              helpText: 'Campo importato automaticamente da Azure DevOps',
              section: 'DevOps Fields'
            }
          })
          .returning();
        customField = newField;
      }
      
      // Controlla se esiste già un valore per questo record/campo
      const [existingValue] = await db
        .select()
        .from(entityCustomValues)
        .where(and(
          eq(entityCustomValues.organizationId, organizationId),
          eq(entityCustomValues.entityKey, entityKey),
          eq(entityCustomValues.recordId, recordId),
          eq(entityCustomValues.fieldId, customField.id)
        ))
        .limit(1);
      
      if (existingValue) {
        // Aggiorna il valore esistente
        await db
          .update(entityCustomValues)
          .set({
            value: { value: field.fieldValue, display: String(field.fieldValue) },
            updatedAt: new Date()
          })
          .where(eq(entityCustomValues.id, existingValue.id));
      } else {
        // Inserisci nuovo valore
        await db
          .insert(entityCustomValues)
          .values({
            organizationId,
            entityKey,
            recordId,
            fieldId: customField.id,
            fieldKey: this.normalizeFieldKey(field.fieldName),
            value: { value: field.fieldValue, display: String(field.fieldValue) }
          });
      }
    }
  }
  
  /**
   * Normalizza il nome del campo in un field key valido
   */
  static normalizeFieldKey(fieldName: string): string {
    return fieldName
      .toLowerCase()
      .replace(/\s+/g, '_')
      .replace(/[^a-z0-9_]/g, '')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '');
  }
  
  /**
   * Genera una label leggibile dal nome del campo
   */
  static getFieldLabel(fieldName: string): string {
    return fieldName
      .replace(/([A-Z])/g, ' $1')
      .replace(/_/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  }
  
  /**
   * Restituisce il nome display per un'entità
   */
  static getEntityDisplayName(entityKey: string): string {
    const names: Record<string, string> = {
      'transport_requests': 'Transport Requests',
      'projects': 'Projects',
      'tasks': 'Tasks',
      'messages': 'Messages'
    };
    return names[entityKey] || this.getFieldLabel(entityKey);
  }
  
  /**
   * Recupera tutti i campi DevOps non mappati salvati per un record
   */
  static async getDevOpsCustomValues(
    organizationId: string,
    entityKey: string,
    recordId: string
  ): Promise<Record<string, any>> {
    const values = await db
      .select({
        fieldKey: entityCustomValues.fieldKey,
        value: entityCustomValues.value
      })
      .from(entityCustomValues)
      .where(and(
        eq(entityCustomValues.organizationId, organizationId),
        eq(entityCustomValues.entityKey, entityKey),
        eq(entityCustomValues.recordId, recordId)
      ));
    
    const result: Record<string, any> = {};
    for (const v of values) {
      const valueData = v.value as { value: any; display?: string } | null;
      result[v.fieldKey] = valueData?.value ?? valueData;
    }
    return result;
  }
  
  /**
   * Suggerisce mapping AI per campi DevOps comuni
   */
  static suggestFieldMappings(fieldName: string): { targetEntity: string; targetField: string } | null {
    const suggestions: Record<string, { targetEntity: string; targetField: string }> = {
      'title': { targetEntity: 'projects', targetField: 'name' },
      'work_item_title': { targetEntity: 'tasks', targetField: 'title' },
      'description': { targetEntity: 'projects', targetField: 'description' },
      'assigned_to': { targetEntity: 'tasks', targetField: 'assignedToId' },
      'state': { targetEntity: 'tasks', targetField: 'status' },
      'priority': { targetEntity: 'tasks', targetField: 'priority' },
      'effort': { targetEntity: 'tasks', targetField: 'estimatedEffort' },
      'iteration_path': { targetEntity: 'projects', targetField: 'name' },
      'area_path': { targetEntity: 'projects', targetField: 'description' },
      'created_date': { targetEntity: 'tasks', targetField: 'createdAt' },
      'changed_date': { targetEntity: 'tasks', targetField: 'updatedAt' },
    };
    
    const normalizedKey = this.normalizeFieldKey(fieldName);
    return suggestions[normalizedKey] || null;
  }
}
