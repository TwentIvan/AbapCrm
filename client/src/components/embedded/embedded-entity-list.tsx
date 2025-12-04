import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTableLayout } from "@/lib/user-preferences";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Clock, Plus, Bot, Settings, Copy, Trash2, Edit, Play, Square } from "lucide-react";
import { apiRequest, getQueryFn } from "@/lib/queryClient";
import { useOrganization } from "@/contexts/organization-context";
import AuditHistory from "@/components/ui/audit-history";
import { MessageHistory } from "@/components/ui/message-history";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { UniversalTable } from "@/components/ui/universal-table";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { LayoutManager } from "@/components/ui/layout-manager";
import { BulkEditDialog } from "@/components/dialogs/bulk-edit-dialog";
import { BulkCopyDialog } from "@/components/dialogs/bulk-copy-dialog";
import { ThuAiDialog } from "@/components/dialogs/thu-ai-dialog";
import { TableConfiguration } from "@/components/ui/table-configuration";
import { getEntityDescriptor, EntityListDescriptor, TableColumn } from "@/lib/entity-registry";
import { CompletionDialog } from "@/components/timesheet/completion-dialog";
import type { TimeEntry } from "@shared/schema";

interface EmbeddedEntityListProps {
  entityKey: string;
  layoutKey?: string;
  filterField?: string;
  filterValues?: string[];
  showTitle?: boolean;
  compact?: boolean;
  className?: string;
}

function TaskTimerButtons({ task }: { task: any }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [currentTime, setCurrentTime] = useState(new Date());
  const [showCompletionDialog, setShowCompletionDialog] = useState(false);
  
  const { data: runningEntry } = useQuery<any>({
    queryKey: ["/api/time-entries/running"],
    queryFn: getQueryFn({ on401: "throw" }),
    refetchInterval: 1000,
  });

  const { data: timeEntries = [] } = useQuery<TimeEntry[]>({
    queryKey: ["/api/time-entries/task", task.id],
    queryFn: async () => {
      const res = await fetch(`/api/time-entries/task/${task.id}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch time entries");
      return res.json();
    },
  });

  useEffect(() => {
    const interval = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  const startTimerMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/time-entries", {
        taskId: task.id,
        startTime: new Date().toISOString(),
        isRunning: true,
      });
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/time-entries"] });
      queryClient.invalidateQueries({ queryKey: ["/api/time-entries/running"] });
    },
  });

  const stopTimerMutation = useMutation({
    mutationFn: async ({ entryId, completionData }: { entryId: string; completionData?: { completionPercentage: number } }) => {
      const res = await apiRequest("POST", `/api/time-entries/${entryId}/stop`);
      if (completionData) {
        await apiRequest("PUT", `/api/tasks/${task.id}`, {
          completionPercentage: completionData.completionPercentage,
        });
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/time-entries"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      setShowCompletionDialog(false);
      toast({ title: "Timer fermato" });
    },
  });

  const isCurrentTaskRunning = runningEntry?.taskId === task.id;
  const hasRunningTimer = !!runningEntry;

  const getElapsedTime = () => {
    if (!runningEntry || runningEntry.taskId !== task.id) return "";
    const start = new Date(runningEntry.startTime);
    const diff = currentTime.getTime() - start.getTime();
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diff % (1000 * 60)) / 1000);
    if (hours > 0) return `${hours}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  };

  const calculateSuggestedPercentage = () => {
    if (!runningEntry) return task.completionPercentage || 0;
    const sessionStartTime = new Date(runningEntry.startTime);
    const sessionDuration = (currentTime.getTime() - sessionStartTime.getTime()) / (1000 * 60);
    const currentCompletion = task.completionPercentage || 0;
    let suggestedIncrease = 0;
    if (sessionDuration >= 15) suggestedIncrease = Math.max(5, Math.min(15, sessionDuration / 4));
    else if (sessionDuration >= 5) suggestedIncrease = Math.max(2, sessionDuration / 2);
    else suggestedIncrease = 1;
    return Math.min(100, Math.round(currentCompletion + suggestedIncrease));
  };

  const handleStart = () => startTimerMutation.mutate();
  const handleStop = () => setShowCompletionDialog(true);

  const handleCompletionSubmit = (completionData: { completionPercentage: number }) => {
    if (runningEntry) {
      stopTimerMutation.mutate({ entryId: runningEntry.id, completionData });
    }
  };

  const getTotalTime = () => {
    const totalTime = timeEntries.reduce((total, entry) => total + (entry.duration || 0), 0);
    const hours = Math.floor(totalTime / 60);
    const mins = Math.round(totalTime % 60);
    if (hours > 0) return `${hours}h ${mins}m`;
    return `${mins}m`;
  };

  return (
    <>
      <div className="flex items-center gap-1">
        {isCurrentTaskRunning ? (
          <Button
            size="sm"
            variant="destructive"
            onClick={handleStop}
            disabled={stopTimerMutation.isPending}
            data-testid={`button-stop-timer-${task.id}`}
          >
            <Square className="h-3 w-3 mr-1" />
            {getElapsedTime()}
          </Button>
        ) : (
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              className="bg-blue-600 hover:bg-blue-700 text-white border-0"
              onClick={handleStart}
              disabled={startTimerMutation.isPending || hasRunningTimer}
              data-testid={`button-start-timer-${task.id}`}
            >
              <Play className="h-3 w-3 mr-1" />
              Start
            </Button>
            {timeEntries.length > 0 && (
              <span className="text-xs text-muted-foreground font-medium">{getTotalTime()}</span>
            )}
          </div>
        )}
      </div>
      
      {showCompletionDialog && (
        <CompletionDialog
          isOpen={showCompletionDialog}
          onClose={() => setShowCompletionDialog(false)}
          currentPercentage={calculateSuggestedPercentage()}
          onSubmit={handleCompletionSubmit}
          isLoading={stopTimerMutation.isPending}
        />
      )}
    </>
  );
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
  
  if (!descriptor) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        Entità "{entityKey}" non trovata
      </div>
    );
  }

  return (
    <EntityListContent
      descriptor={descriptor}
      layoutKey={layoutKey || `embedded_${entityKey}`}
      filterField={filterField}
      filterValues={filterValues}
      showTitle={showTitle}
      compact={compact}
      className={className}
    />
  );
}

function EntityListContent({
  descriptor,
  layoutKey,
  filterField,
  filterValues,
  showTitle,
  compact,
  className,
}: {
  descriptor: EntityListDescriptor;
  layoutKey: string;
  filterField?: string;
  filterValues?: string[];
  showTitle: boolean;
  compact: boolean;
  className: string;
}) {
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editingItem, setEditingItem] = useState<any | null>(null);
  const [selectedItems, setSelectedItems] = useState<any[]>([]);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showBulkDeleteDialog, setShowBulkDeleteDialog] = useState(false);
  const [showBulkEditDialog, setShowBulkEditDialog] = useState(false);
  const [showBulkCopyDialog, setShowBulkCopyDialog] = useState(false);
  const [showThuAiDialog, setShowThuAiDialog] = useState(false);
  const [showConfigDialog, setShowConfigDialog] = useState(false);
  
  const { currentOrganizationId } = useOrganization();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { 
    layout, 
    currentLayoutName,
    savedLayouts,
    updateLayout, 
    loadLayout,
    renameLayout,
    deleteLayout,
  } = useTableLayout(layoutKey);

  const { data: items = [], isLoading } = useQuery<any[]>({
    queryKey: [descriptor.apiBase],
    queryFn: getQueryFn({ on401: "throw" }),
    enabled: !!currentOrganizationId,
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

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `${descriptor.apiBase}/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [descriptor.apiBase] });
      setShowDeleteDialog(false);
      setEditingItem(null);
      toast({ title: `${descriptor.title} eliminato` });
    }
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: async (itemsToDelete: any[]) => {
      for (const item of itemsToDelete) {
        await apiRequest("DELETE", `${descriptor.apiBase}/${item.id}`);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [descriptor.apiBase] });
      setSelectedItems([]);
      setShowBulkDeleteDialog(false);
      toast({ title: `${descriptor.titlePlural} eliminati` });
    }
  });

  const bulkEditMutation = useMutation({
    mutationFn: async ({ itemsToEdit, updates }: { itemsToEdit: any[], updates: Record<string, any> }) => {
      await Promise.all(itemsToEdit.map(item => apiRequest("PUT", `${descriptor.apiBase}/${item.id}`, updates)));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [descriptor.apiBase] });
      setSelectedItems([]);
      setShowBulkEditDialog(false);
      toast({ title: `${descriptor.titlePlural} modificati` });
    }
  });

  const bulkCopyMutation = useMutation({
    mutationFn: async ({ itemsToCopy, addSuffix, suffix }: { itemsToCopy: any[], addSuffix: boolean, suffix: string }) => {
      await Promise.all(
        itemsToCopy.map(item => {
          const copyData = descriptor.prepareCopyData ? descriptor.prepareCopyData(item) : { ...item };
          delete copyData.id;
          if (copyData.title && addSuffix) {
            copyData.title = `${copyData.title}${suffix}`;
          } else if (copyData.name && addSuffix) {
            copyData.name = `${copyData.name}${suffix}`;
          }
          return apiRequest("POST", descriptor.apiBase, copyData);
        })
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [descriptor.apiBase] });
      setSelectedItems([]);
      setShowBulkCopyDialog(false);
      toast({ title: `${descriptor.titlePlural} copiati` });
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

  const handleAdd = () => {
    setEditingItem(null);
    setShowCreateDialog(true);
  };

  const columnHelpers = {
    onEdit: handleEdit,
    onDelete: handleDelete,
    projects,
    users,
  };

  const baseColumns = useMemo(() => {
    const cols = descriptor.getColumns(columnHelpers);
    if (descriptor.supportsTimer && descriptor.entityKey === "tasks") {
      const actionsIdx = cols.findIndex(c => c.key === "actions");
      if (actionsIdx > 0) {
        cols.splice(actionsIdx, 0, {
          key: "timer",
          label: "Timer",
          sortable: false,
          render: (item: any) => <TaskTimerButtons task={item} />,
        });
      }
    }
    return cols;
  }, [descriptor, columnHelpers]);

  const visibleColumns = useMemo(() => {
    const actionsColumn = baseColumns.find(c => c.key === "actions");
    
    if (!layout.columns || Object.keys(layout.columns).length === 0) {
      return baseColumns;
    }
    
    const configuredColumns = baseColumns
      .filter(col => {
        if (col.key === "actions") return false;
        const config = layout.columns[col.key];
        return config?.visible !== false;
      })
      .sort((a, b) => {
        const posA = layout.columns[a.key]?.position ?? 999;
        const posB = layout.columns[b.key]?.position ?? 999;
        return posA - posB;
      });
    
    if (actionsColumn) configuredColumns.push(actionsColumn);
    return configuredColumns;
  }, [baseColumns, layout.columns]);

  const filteredItems = useMemo(() => {
    let result = items;
    if (filterField && filterValues && filterValues.length > 0) {
      result = result.filter(item => filterValues.includes(item[filterField]));
    }
    return result;
  }, [items, filterField, filterValues]);

  const bulkEditFields = useMemo(() => 
    descriptor.getBulkEditFields({ projects, users }), 
    [descriptor, projects, users]
  );


  const FormComponent = descriptor.FormComponent;
  const Icon = descriptor.icon;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        <Clock className="h-6 w-6 animate-spin mr-2" />
        Caricamento...
      </div>
    );
  }

  return (
    <div className={`h-full flex flex-col overflow-hidden ${className}`}>
      {/* Toolbar */}
      <div className="flex-shrink-0 border-b p-2">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap">
            {showTitle && (
              <div className="flex items-center gap-2 mr-2">
                <Icon className="h-5 w-5 text-muted-foreground" />
                <span className="font-semibold">{descriptor.titlePlural}</span>
              </div>
            )}
            <Button size="sm" onClick={handleAdd} data-testid={`button-add-${descriptor.entityKey}`}>
              <Plus className="h-4 w-4 mr-1" />
              Nuovo
            </Button>
            {selectedItems.length > 0 && (
              <>
                <Button size="sm" variant="outline" onClick={() => setShowBulkEditDialog(true)}>
                  <Edit className="h-4 w-4 mr-1" />
                  Modifica ({selectedItems.length})
                </Button>
                <Button size="sm" variant="outline" onClick={() => setShowBulkCopyDialog(true)}>
                  <Copy className="h-4 w-4 mr-1" />
                  Copia
                </Button>
                <Button size="sm" variant="destructive" onClick={() => setShowBulkDeleteDialog(true)}>
                  <Trash2 className="h-4 w-4 mr-1" />
                  Elimina
                </Button>
                {descriptor.supportsAI && descriptor.entityKey === "tasks" && (
                  <Button size="sm" variant="outline" onClick={() => setShowThuAiDialog(true)}>
                    <Bot className="h-4 w-4 mr-1" />
                    AI
                  </Button>
                )}
              </>
            )}
          </div>
          <div className="flex items-center gap-2">
            <LayoutManager
              currentLayoutName={currentLayoutName}
              savedLayouts={savedLayouts}
              onLoadLayout={loadLayout}
              onRenameLayout={renameLayout}
              onDeleteLayout={deleteLayout}
              onConfigureTable={() => setShowConfigDialog(true)}
            />
          </div>
        </div>
      </div>

      {/* Table */}
      <ScrollArea className="flex-1 min-h-0">
        <UniversalTable
          data={filteredItems}
          columns={visibleColumns}
          enableSelection={true}
          onSelectionChange={(items) => setSelectedItems(items)}
          onRowClick={handleEdit}
        />
      </ScrollArea>

      {/* Create Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nuovo {descriptor.title}</DialogTitle>
          </DialogHeader>
          <FormComponent
            open={showCreateDialog}
            onOpenChange={setShowCreateDialog}
            editingItem={null}
            onSuccess={() => {
              setShowCreateDialog(false);
              queryClient.invalidateQueries({ queryKey: [descriptor.apiBase] });
            }}
          />
        </DialogContent>
      </Dialog>

      {/* Edit Dialog with Tabs */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Modifica {descriptor.title}</DialogTitle>
          </DialogHeader>
          {editingItem && (
            <Tabs defaultValue="details">
              <TabsList>
                <TabsTrigger value="details">Dettagli</TabsTrigger>
                {descriptor.supportsMessages && <TabsTrigger value="messages">Messaggi</TabsTrigger>}
                {descriptor.supportsHistory && <TabsTrigger value="history">Cronologia</TabsTrigger>}
              </TabsList>
              <TabsContent value="details">
                <FormComponent
                  open={showEditDialog}
                  onOpenChange={setShowEditDialog}
                  editingItem={editingItem}
                  onSuccess={() => {
                    setShowEditDialog(false);
                    setEditingItem(null);
                    queryClient.invalidateQueries({ queryKey: [descriptor.apiBase] });
                  }}
                />
              </TabsContent>
              {descriptor.supportsMessages && (
                <TabsContent value="messages">
                  <MessageHistory tableName={descriptor.entityKey} recordId={editingItem.id} />
                </TabsContent>
              )}
              {descriptor.supportsHistory && (
                <TabsContent value="history">
                  <AuditHistory tableName={descriptor.entityKey} recordId={editingItem.id} />
                </TabsContent>
              )}
            </Tabs>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Dialogs */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Conferma eliminazione</AlertDialogTitle>
            <AlertDialogDescription>
              Sei sicuro di voler eliminare "{editingItem?.title || editingItem?.name}"?
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
            <AlertDialogTitle>Conferma eliminazione multipla</AlertDialogTitle>
            <AlertDialogDescription>
              Sei sicuro di voler eliminare {selectedItems.length} {descriptor.titlePlural.toLowerCase()}?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction onClick={() => bulkDeleteMutation.mutate(selectedItems)}>
              Elimina tutti
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk Edit/Copy Dialogs */}
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

      {/* AI Dialog (only for tasks) */}
      {descriptor.supportsAI && descriptor.entityKey === "tasks" && selectedItems.length > 0 && (
        <ThuAiDialog
          open={showThuAiDialog}
          onOpenChange={setShowThuAiDialog}
          selectedTasks={selectedItems}
        />
      )}

      {/* Table Configuration */}
      <TableConfiguration
        tableId={layoutKey}
        availableColumns={baseColumns.filter(c => c.key !== "actions" && c.key !== "timer").map(c => ({ id: c.key, label: c.label }))}
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
