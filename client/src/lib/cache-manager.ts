import { useQueryClient } from "@tanstack/react-query";

/**
 * Sistema unificato di gestione cache per tutte le aree CRUD
 * Garantisce comportamento omogeneo e lineare per operazioni CREATE/UPDATE/DELETE
 */
export function useCacheManager() {
  const queryClient = useQueryClient();

  /**
   * Invalida la cache per una specifica area e le sue relazioni
   * @param area - Nome dell'area (es: "organizations", "projects", "tasks", "deals", "partners")
   * @param relatedAreas - Aree correlate da invalidare
   */
  const invalidateArea = async (area: string, relatedAreas: string[] = []) => {
    const areasToInvalidate = [area, ...relatedAreas];
    
    // Invalida tutte le query delle aree specificate
    for (const areaName of areasToInvalidate) {
      await queryClient.invalidateQueries({ 
        queryKey: [`/api/${areaName}`],
        exact: false // Invalida anche query con parametri aggiuntivi
      });
    }
    
    // Force refetch per assicurare aggiornamento immediato
    for (const areaName of areasToInvalidate) {
      await queryClient.refetchQueries({ 
        queryKey: [`/api/${areaName}`],
        exact: false
      });
    }
  };

  /**
   * Invalida cache dopo operazioni CRUD standardizzate
   */
  const afterCreate = (area: string, relatedAreas?: string[]) => 
    invalidateArea(area, relatedAreas);
    
  const afterUpdate = (area: string, relatedAreas?: string[]) => 
    invalidateArea(area, relatedAreas);
    
  const afterDelete = (area: string, relatedAreas?: string[]) => 
    invalidateArea(area, relatedAreas);

  /**
   * Reset completo cache per situazioni di emergenza
   */
  const resetAll = () => {
    queryClient.clear();
  };

  return {
    invalidateArea,
    afterCreate,
    afterUpdate,
    afterDelete,
    resetAll
  };
}

/**
 * Configurazione delle relazioni tra aree
 * Quando si modifica un'area, vengono automaticamente invalidate le aree correlate
 */
export const AREA_RELATIONS: Record<string, string[]> = {
  organizations: ["projects", "tasks", "deals", "partners"], // Org cambia -> invalida tutto
  projects: ["tasks", "deals"], // Progetto cambia -> invalida task e deal correlati
  partners: ["deals", "organizations"], // Partner cambia -> invalida deal e org correlate
  deals: [], // Deal è foglia
  tasks: [], // Task è foglia
};

/**
 * Hook per pattern CRUD standardizzato con gestione cache automatica
 */
export function useStandardCrud(area: string) {
  const cacheManager = useCacheManager();
  const relatedAreas = AREA_RELATIONS[area] || [];

  return {
    onCreateSuccess: () => cacheManager.afterCreate(area, relatedAreas),
    onUpdateSuccess: () => cacheManager.afterUpdate(area, relatedAreas),
    onDeleteSuccess: () => cacheManager.afterDelete(area, relatedAreas),
    cacheManager
  };
}