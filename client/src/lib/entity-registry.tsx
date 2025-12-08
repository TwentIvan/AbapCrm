import { ReactNode } from "react";

export type ColumnGroup = "direct" | "relation" | "computed" | "linked";

export interface TableColumn {
  key: string;
  label: string;
  sortable?: boolean;
  searchable?: boolean;
  group?: ColumnGroup;
  render?: (item: any, computedData?: Record<string, any>) => ReactNode;
}

export interface BulkEditField {
  key: string;
  label: string;
  type: "text" | "select" | "date" | "number";
  options?: { value: string; label: string }[];
}

export interface FilterColumn {
  id: string;
  label: string;
  type: "text" | "select" | "date" | "number" | "relation";
  options?: { value: string; label: string }[];
  relationEntity?: string;
}

export interface EntityListDescriptor {
  entityKey: string;
  title: string;
  titlePlural: string;
  apiBase: string;
  icon: React.ComponentType<{ className?: string }>;
  
  getColumns: (helpers: ColumnHelpers) => TableColumn[];
  getFilterColumns: () => FilterColumn[];
  getBulkEditFields: (relatedData: any) => BulkEditField[];
  
  FormComponent?: React.ComponentType<FormComponentProps>;
  
  supportsAI?: boolean;
  supportsTimeTracking?: boolean;
  supportsAudit?: boolean;
  supportsMessages?: boolean;
  supportsBulkEdit?: boolean;
  supportsBulkCopy?: boolean;
  supportsBulkDelete?: boolean;
  
  getRowActions?: (item: any, handlers: RowActionHandlers) => ReactNode;
  
  prepareCreateData?: (data: any) => any;
  prepareCopyData?: (item: any) => any;
  
  relatedDataQueries?: string[];
  
  computedDataEndpoint?: string;
}

export interface ColumnHelpers {
  onEdit: (item: any) => void;
  onDelete: (item: any) => void;
  projects?: any[];
  users?: any[];
  partners?: any[];
  organizations?: any[];
  computedData?: Record<string, any>;
}

export interface FormComponentProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingItem: any | null;
  onSuccess: () => void;
}

export interface RowActionHandlers {
  onEdit: (item: any) => void;
  onDelete: (item: any) => void;
  onLaunch?: (item: any) => void;
}

const entityRegistry = new Map<string, EntityListDescriptor>();

export function registerEntity(descriptor: EntityListDescriptor) {
  entityRegistry.set(descriptor.entityKey, descriptor);
}

export function getEntityDescriptor(entityKey: string): EntityListDescriptor | undefined {
  return entityRegistry.get(entityKey);
}

export function getAllEntityKeys(): string[] {
  return Array.from(entityRegistry.keys());
}

export function getAllEntities(): EntityListDescriptor[] {
  return Array.from(entityRegistry.values());
}
