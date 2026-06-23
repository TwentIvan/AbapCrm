import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTableLayout } from "@/lib/user-preferences";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { apiRequest, getQueryFn } from "@/lib/queryClient";
import { useOrganization } from "@/contexts/organization-context";
import AuditHistory from "@/components/ui/audit-history";
import { MessageHistory } from "@/components/ui/message-history";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { UniversalTable } from "@/components/ui/universal-table";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { ListViewToolbar } from "@/components/ui/list-view-toolbar";
import { BulkEditDialog } from "@/components/dialogs/bulk-edit-dialog";
import { BulkCopyDialog } from "@/components/dialogs/bulk-copy-dialog";
import { ThuAiDialog } from "@/components/dialogs/thu-ai-dialog";
import { TableConfiguration } from "@/components/ui/table-configuration";
import { getEntityDescriptor, TableColumn } from "@/lib/entity-registry";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface EmbeddedEntityListProps {
  entityKey: string;
  layoutKey?: string;
  filterField?: string;
  filterValues?: string[];
  showTitle?: boolean;
  compact?: boolean;
  className?: string;
}

export function EmbeddedEntityList({
  entityKey,
  layoutKey,
  filterField,
  filterValues,
  showTitle = false,
  compact = false,
  className = "",
}: EmbeddedEntityListProps) {
  const descriptor = getEntityDescriptor(entityKey);
  const { currentOrganizationId } = useOrganization();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const effectiveLayoutKey = layoutKey || `embedded_${entityKey}`;

  const {
    layout,
    currentLayoutName,
    savedLayouts,
    updateLayout,
    saveLayoutAs,
    loadLayout,
    renameLayout,
    deleteLayout,
  } = useTableLayout(effectiveLayoutKey);

  const [selectedItems, setSelectedItems] = useState<any[]>([]);
  const [editingItem, setEditingItem] = useState<any>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showBulkDeleteDialog, setShowBulkDeleteDialog] = useState(false);
  const [showBulkEditDialog, setShowBulkEditDialog] = useState(false);
  const [showBulkCopyDialog, setShowBulkCopyDialog] = useState(false);
  const [showThuAiDialog, setShowThuAiDialog] = useState(false);
  const [showConfigDialog, setShowConfigDialog] = useState(false);

  const apiBase = descriptor?.apiBase || "/api/unknown";
  const computedDataEndpoint = descriptor?.computedDataEndpoint;

  const { data: items = [], isLoading } = useQuery<any[]>({
    queryKey: [apiBase],
    queryFn: getQueryFn({ on401: "throw" }),
    enabled: !!currentOrganizationId && !!descriptor,
  });

  const { data: projects = [] } = useQuery<any[]>({
    queryKey: ["/api/projects"],
    queryFn: getQueryFn({ on401: "throw" }),
    enabled: !!currentOrganizationId,
  });

  const { data: users = [] } = useQuery<any[]>({
    queryKey: ["/api/users"],
    queryFn: getQueryFn({ on401: "throw" }),
    enabled: !!currentOrganizationId,
  });

  const { data: partners = [] } = useQuery<any[]>({
    queryKey: ["/api/partners"],
    queryFn: getQueryFn({ on401: "throw" }),
    enabled: !!currentOrganizationId,
  });

  const { data: computedData = {} } = useQuery<Record<string, any>>({
    queryKey: [computedDataEndpoint || ""],
    queryFn: getQueryFn({ on401: "throw" }),
    enabled: !!currentOrganizationId && !!computedDataEndpoint,
  });

  const filteredItems = useMemo(() => {
    if (!filterField || !filterValues || filterValues.length === 0) {
      return items;
    }
    return items.filter((item) => filterValues.includes(item[filterField]));
  }, [items, filterField, filterValues]);

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `${apiBase}/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [apiBase] });
      setShowDeleteDialog(false);
      setEditingItem(null);
      toast({ title: "Eliminato", description: `${descriptor?.title || "Elemento"} eliminato con successo` });
    },
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: async (itemsToDelete: any[]) => {
      for (const item of itemsToDelete) {
        await apiRequest("DELETE", `${apiBase}/${item.id}`);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [apiBase] });
      setSelectedItems([]);
      setShowBulkDeleteDialog(false);
      toast({ title: "Eliminati", description: `${descriptor?.titlePlural || "Elementi"} eliminati con successo` });
    },
  });

  const bulkEditMutation = useMutation({
    mutationFn: async ({ itemsToEdit, updates }: { itemsToEdit: any[]; updates: Record<string, any> }) => {
      await Promise.all(
        itemsToEdit.map((item) => apiRequest("PUT", `${apiBase}/${item.id}`, updates))
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [apiBase] });
      setSelectedItems([]);
      setShowBulkEditDialog(false);
      toast({ title: "Modificati", description: `${descriptor?.titlePlural || "Elementi"} modificati con successo` });
    },
  });

  const bulkCopyMutation = useMutation({
    mutationFn: async ({ itemsToCopy, addSuffix, suffix }: { itemsToCopy: any[]; addSuffix: boolean; suffix: string }) => {
      await Promise.all(
        itemsToCopy.map((item) => {
          const copyData = descriptor?.prepareCopyData
            ? descriptor.prepareCopyData(item)
            : (() => {
                const { id, createdAt, updatedAt, userId, organizationId, ...rest } = item;
                return rest;
              })();

          const titleField = "title" in item ? "title" : "name" in item ? "name" : null;
          if (titleField && addSuffix) {
            copyData[titleField] = `${item[titleField]}${suffix}`;
          }

          return apiRequest("POST", apiBase, copyData);
        })
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [apiBase] });
      setSelectedItems([]);
      setShowBulkCopyDialog(false);
      toast({ title: "Copiati", description: `${descriptor?.titlePlural || "Elementi"} copiati con successo` });
    },
  });

  const handleEdit = (item: any) => {
    setEditingItem(item);
    setShowEditDialog(true);
  };

  const handleDelete = (item: any) => {
    setEditingItem(item);
    setShowDeleteDialog(true);
  };

  const baseColumns = useMemo(
    () =>
      descriptor?.getColumns({
        onEdit: handleEdit,
        onDelete: handleDelete,
        projects,
        users,
        partners,
        computedData,
      }) || [],
    [descriptor, projects, users, partners, computedData]
  );

  const visibleColumns = useMemo(() => {
    const getColumnKey = (col: any) => col.key;
    const actionsColumn = baseColumns.find((c) => getColumnKey(c) === "actions");
    const timerColumn = baseColumns.find((c) => getColumnKey(c) === "timer");

    if (!layout.columns || Object.keys(layout.columns).length === 0) {
      return baseColumns;
    }

    const configuredColumns = baseColumns
      .filter((col) => {
        const key = getColumnKey(col);
        if (key === "actions" || key === "timer") return false;
        const config = layout.columns[key];
        if (config === undefined) return true;
        return config.visible !== false;
      })
      .sort((a, b) => {
        const posA = layout.columns[getColumnKey(a)]?.position ?? 999;
        const posB = layout.columns[getColumnKey(b)]?.position ?? 999;
        return posA - posB;
      });

    if (timerColumn && descriptor?.supportsTimeTracking) {
      configuredColumns.push(timerColumn);
    }
    if (actionsColumn) {
      configuredColumns.push(actionsColumn);
    }

    return configuredColumns;
  }, [baseColumns, layout.columns, descriptor?.supportsTimeTracking]);

  const bulkEditFields = useMemo(
    () => descriptor?.getBulkEditFields({ projects, users, partners }) || [],
    [descriptor, projects, users, partners]
  );

  if (!descriptor) {
    return (
      <div className={`p-4 text-center text-muted-foreground ${className}`}>
        Entità "{entityKey}" non trovata nel registry
      </div>
    );
  }

  const FormComponent = descriptor.FormComponent;
  const Icon = descriptor.icon;

  if (isLoading) {
    return (
      <div className={`space-y-2 p-4 ${className}`}>
        {[...Array(compact ? 3 : 5)].map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  const renderAIButton = () => {
    if (!descriptor.supportsAI || descriptor.entityKey !== "tasks") return null;
    
    return (
      <TooltipProvider delayDuration={300}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              onClick={() => setShowThuAiDialog(true)}
              disabled={selectedItems.length === 0}
              variant="ghost"
              className={`relative flex flex-col items-center justify-center w-12 h-9 rounded-lg border-2 border-agent/30 bg-sidebar-accent shadow-sm hover:shadow-md transition-all ${
                selectedItems.length === 0 ? "opacity-40" : "opacity-100 hover:border-agent"
              }`}
              data-testid="button-ai-tasks-embedded"
            >
              <div className="relative flex flex-col items-center">
                <div className="flex items-baseline space-x-0">
                  <span className="text-xs font-black text-primary">T</span>
                  <span className="text-sm font-black text-primary">H</span>
                  <span className="text-sm font-black text-primary">U</span>
                </div>
                <span className="text-[8px] font-bold text-agent -mt-0.5">AI</span>
              </div>
              {selectedItems.length > 0 && (
                <span className="absolute -top-1 -right-1 bg-agent text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                  {selectedItems.length > 9 ? "9+" : selectedItems.length}
                </span>
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="bg-agent text-white">
            <p>
              {selectedItems.length > 0
                ? `Assistenza AI per ${selectedItems.length} task`
                : "Seleziona task per assistenza AI"}
            </p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  };

  return (
    <div className={`flex flex-col h-full ${className}`}>
      <ListViewToolbar
        currentLayoutName={currentLayoutName}
        savedLayouts={savedLayouts}
        onLoadLayout={loadLayout}
        onRenameLayout={renameLayout}
        onDeleteLayout={deleteLayout}
        onConfigureTable={() => setShowConfigDialog(true)}
        onCreateNew={FormComponent ? () => setShowCreateDialog(true) : undefined}
        onCopySelected={descriptor.supportsBulkCopy ? () => setShowBulkCopyDialog(true) : undefined}
        onBulkEdit={descriptor.supportsBulkEdit ? () => setShowBulkEditDialog(true) : undefined}
        onDeleteSelected={descriptor.supportsBulkDelete ? () => setShowBulkDeleteDialog(true) : undefined}
        hasSelection={selectedItems.length > 0}
        customActions={renderAIButton()}
      />

      <div className="flex-1 min-h-0 overflow-auto">
        {filteredItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
            <Icon className="h-12 w-12 mb-4 opacity-30" />
            <p>Nessun {descriptor.title.toLowerCase()} trovato</p>
            {FormComponent && (
              <Button
                variant="outline"
                size="sm"
                className="mt-4"
                onClick={() => setShowCreateDialog(true)}
                data-testid={`button-create-first-${entityKey}`}
              >
                Crea {descriptor.title}
              </Button>
            )}
          </div>
        ) : (
          <UniversalTable
            data={filteredItems}
            columns={visibleColumns}
            enableSelection={true}
            onSelectionChange={(rows) => setSelectedItems(rows)}
            onRowClick={handleEdit}
            computedData={computedData}
          />
        )}
      </div>

      {FormComponent && (
        <FormComponent
          open={showCreateDialog || showEditDialog}
          onOpenChange={(open) => {
            if (!open) {
              setShowCreateDialog(false);
              setShowEditDialog(false);
              setEditingItem(null);
            }
          }}
          editingItem={editingItem}
          onSuccess={() => {
            setShowCreateDialog(false);
            setShowEditDialog(false);
            setEditingItem(null);
            queryClient.invalidateQueries({ queryKey: [descriptor.apiBase] });
          }}
        />
      )}

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Elimina {descriptor.title}</AlertDialogTitle>
            <AlertDialogDescription>
              Sei sicuro di voler eliminare questo {descriptor.title.toLowerCase()}? Questa azione non può essere annullata.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction onClick={() => editingItem && deleteMutation.mutate(editingItem.id)}>
              Elimina
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showBulkDeleteDialog} onOpenChange={setShowBulkDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Elimina {descriptor.titlePlural} Selezionati</AlertDialogTitle>
            <AlertDialogDescription>
              Sei sicuro di voler eliminare i {selectedItems.length} {descriptor.titlePlural.toLowerCase()} selezionati?
              Questa azione non può essere annullata.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction onClick={() => bulkDeleteMutation.mutate(selectedItems)}>
              Elimina {selectedItems.length} {descriptor.titlePlural}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <BulkEditDialog
        open={showBulkEditDialog}
        onOpenChange={setShowBulkEditDialog}
        title={`Modifica ${descriptor.titlePlural} Selezionati`}
        description={`Stai modificando ${selectedItems.length} ${descriptor.titlePlural.toLowerCase()}. I campi non modificati rimarranno invariati.`}
        fields={bulkEditFields}
        selectedCount={selectedItems.length}
        onSave={(updates) => bulkEditMutation.mutate({ itemsToEdit: selectedItems, updates })}
        isPending={bulkEditMutation.isPending}
      />

      <BulkCopyDialog
        open={showBulkCopyDialog}
        onOpenChange={setShowBulkCopyDialog}
        title={`Copia ${descriptor.titlePlural} Selezionati`}
        description={`Stai copiando ${selectedItems.length} ${descriptor.titlePlural.toLowerCase()}.`}
        selectedCount={selectedItems.length}
        onCopy={({ addSuffix, suffix }) => bulkCopyMutation.mutate({ itemsToCopy: selectedItems, addSuffix, suffix })}
        isPending={bulkCopyMutation.isPending}
      />

      {descriptor.supportsAI && descriptor.entityKey === "tasks" && (
        <ThuAiDialog
          open={showThuAiDialog}
          onOpenChange={setShowThuAiDialog}
          selectedTasks={selectedItems}
        />
      )}

      <TableConfiguration
        tableId={effectiveLayoutKey}
        availableColumns={baseColumns
          .filter((c) => c.key !== "actions" && c.key !== "timer")
          .map((c) => ({ id: c.key, label: c.label }))}
        isOpen={showConfigDialog}
        onOpenChange={setShowConfigDialog}
        onSave={(config) => {
          if (config?.columns) {
            const newColumns: Record<string, { visible: boolean; position: number }> = {};
            config.columns.forEach((col: any, idx: number) => {
              newColumns[col.id] = { visible: col.visible !== false, position: idx };
            });
            updateLayout({ columns: newColumns });
          }
          setShowConfigDialog(false);
        }}
        onCancel={() => setShowConfigDialog(false)}
      />
    </div>
  );
}
