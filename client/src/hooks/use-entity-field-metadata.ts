import { useQuery } from "@tanstack/react-query";
import { getQueryFn } from "@/lib/queryClient";

export interface EntityFieldMetadata {
  id: string;
  entity: string;
  fieldKey: string;
  label: string;
  fieldType: string;
  defaultVisible: boolean;
  sortable: boolean;
  filterable: boolean;
  searchable: boolean;
  displayOrder: number;
  width: number | null;
  minWidth: number | null;
  relationEntity: string | null;
  relationDisplayField: string | null;
  selectOptions: any;
  formatPattern: string | null;
  description: string | null;
  isSystemField: boolean;
}

export function useEntityFieldMetadata(entity: string) {
  return useQuery<EntityFieldMetadata[]>({
    queryKey: ['/api/metadata', entity],
    queryFn: getQueryFn({ on401: "throw" }),
    staleTime: 1000 * 60 * 5, // Cache for 5 minutes - metadata doesn't change often
    enabled: !!entity,
  });
}

export function metadataToAvailableColumns(metadata: EntityFieldMetadata[]) {
  return metadata.map(field => ({
    id: field.fieldKey,
    label: field.label,
    defaultVisible: field.defaultVisible,
    sortable: field.sortable,
    filterable: field.filterable,
    searchable: field.searchable,
    fieldType: field.fieldType,
    width: field.width,
    minWidth: field.minWidth,
  }));
}

export function getVisibleColumnsByDefault(metadata: EntityFieldMetadata[]) {
  return metadata
    .filter(field => field.defaultVisible)
    .map(field => field.fieldKey);
}
