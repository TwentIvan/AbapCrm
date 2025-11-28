import { useState, useCallback } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

export interface RelatedDataItem {
  count: number;
  items: Array<{ id: string; name?: string }>;
}

export interface CascadeRelatedData {
  [key: string]: RelatedDataItem;
}

export interface RelationConfig {
  key: string;
  label: string;
}

export interface CascadeDeleteConfig {
  entityName: string;
  entityNamePlural: string;
  apiBasePath: string;
  queryKey: string;
  relationConfigs: RelationConfig[];
  getEntityName: (entity: any) => string;
}

export interface AggregatedRelatedData {
  relations: CascadeRelatedData;
  hasRelations: boolean;
  totalCount: number;
}

export function useCascadeDelete<T extends { id: string }>(config: CascadeDeleteConfig) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showCascadeDialog, setShowCascadeDialog] = useState(false);
  const [selectedItems, setSelectedItems] = useState<T[]>([]);
  const [aggregatedData, setAggregatedData] = useState<AggregatedRelatedData | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const fetchRelatedData = useCallback(async (id: string): Promise<CascadeRelatedData> => {
    try {
      const response = await apiRequest("GET", `${config.apiBasePath}/${id}/related-data`);
      return await response.json();
    } catch {
      return {};
    }
  }, [config.apiBasePath]);

  const aggregateRelatedData = useCallback((dataArray: CascadeRelatedData[]): AggregatedRelatedData => {
    const aggregated: CascadeRelatedData = {};
    
    for (const data of dataArray) {
      for (const [key, value] of Object.entries(data)) {
        if (!aggregated[key]) {
          aggregated[key] = { count: 0, items: [] };
        }
        aggregated[key].count += value.count;
        aggregated[key].items.push(...value.items);
      }
    }
    
    const totalCount = Object.values(aggregated).reduce((sum, rel) => sum + rel.count, 0);
    const hasRelations = totalCount > 0;
    
    return { relations: aggregated, hasRelations, totalCount };
  }, []);

  const deleteMutation = useMutation({
    mutationFn: async (items: T[]) => {
      for (const item of items) {
        await apiRequest("DELETE", `${config.apiBasePath}/${item.id}/cascade`);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [config.queryKey] });
      setShowDeleteDialog(false);
      setShowCascadeDialog(false);
      setSelectedItems([]);
      setAggregatedData(null);
      
      const count = selectedItems.length;
      toast({
        title: count === 1 ? `${config.entityName} eliminato` : `${config.entityNamePlural} eliminati`,
        description: count === 1 
          ? `${config.entityName} eliminato con successo.`
          : `${count} ${config.entityNamePlural.toLowerCase()} eliminati con successo.`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Errore",
        description: error?.message || `Errore durante l'eliminazione.`,
        variant: "destructive",
      });
    },
  });

  const handleDelete = useCallback(async (items: T[]) => {
    if (items.length === 0) return;
    
    setSelectedItems(items);
    setIsLoading(true);
    
    try {
      const relatedDataPromises = items.map(item => fetchRelatedData(item.id));
      const allRelatedData = await Promise.all(relatedDataPromises);
      const aggregated = aggregateRelatedData(allRelatedData);
      
      setAggregatedData(aggregated);
      
      if (aggregated.hasRelations) {
        setShowCascadeDialog(true);
      } else {
        setShowDeleteDialog(true);
      }
    } catch {
      setShowDeleteDialog(true);
    } finally {
      setIsLoading(false);
    }
  }, [fetchRelatedData, aggregateRelatedData]);

  const confirmDelete = useCallback(() => {
    deleteMutation.mutate(selectedItems);
  }, [deleteMutation, selectedItems]);

  const cancelDelete = useCallback(() => {
    setShowDeleteDialog(false);
    setShowCascadeDialog(false);
    setSelectedItems([]);
    setAggregatedData(null);
  }, []);

  const getRelationLabels = useCallback(() => {
    if (!aggregatedData) return [];
    
    return config.relationConfigs
      .filter(rel => aggregatedData.relations[rel.key]?.count > 0)
      .map(rel => ({
        label: rel.label,
        count: aggregatedData.relations[rel.key].count,
      }));
  }, [config.relationConfigs, aggregatedData]);

  return {
    showDeleteDialog,
    setShowDeleteDialog,
    showCascadeDialog,
    setShowCascadeDialog,
    selectedItems,
    aggregatedData,
    isLoading,
    isDeleting: deleteMutation.isPending,
    handleDelete,
    confirmDelete,
    cancelDelete,
    getRelationLabels,
    getEntityName: config.getEntityName,
    entityName: config.entityName,
    entityNamePlural: config.entityNamePlural,
  };
}
