import { useQuery } from "@tanstack/react-query";
import { useOrganization } from "@/contexts/organization-context";

interface RelationshipData {
  count: number;
  items: Array<{ id: string; name: string }>;
}

/**
 * Hook generico per caricare le relazioni di un'entità
 * @param entityType - Tipo di entità (es: "partners", "projects", "tasks")
 * @param entityId - ID dell'entità
 * @param enabled - Se abilitare la query (default: true se entityId è presente)
 */
export function useEntityRelationships<T = Record<string, RelationshipData>>(
  entityType: string,
  entityId: string | undefined,
  enabled: boolean = true
) {
  const { currentOrganizationId } = useOrganization();

  return useQuery<T>({
    queryKey: [`/api/${entityType}/${entityId}/relationships`, entityId],
    queryFn: async () => {
      const headers: Record<string, string> = {};
      if (currentOrganizationId) {
        headers["X-Organization-Id"] = currentOrganizationId;
      }
      const res = await fetch(`/api/${entityType}/${entityId}/relationships`, {
        credentials: "include",
        headers,
      });
      if (!res.ok) throw new Error(`${res.status}: ${res.statusText}`);
      return res.json();
    },
    enabled: !!currentOrganizationId && !!entityId && enabled,
  });
}
