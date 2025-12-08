import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTableLayout } from "@/lib/user-preferences";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Clock, Bot } from "lucide-react";
import type { Task, Project } from "@shared/schema";
import { apiRequest, getQueryFn } from "@/lib/queryClient";
import { useOrganization } from "@/contexts/organization-context";
import TaskFormContainer from "@/components/forms/task-form-container";
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
import { tasksDescriptor } from "@/lib/entities/tasks-descriptor";
import type { ColumnHelpers } from "@/lib/entity-registry";

interface EmbeddedTasksListProps {
  layoutKey?: string;
  showToolbar?: boolean;
  showLayoutManager?: boolean;
  filterStatus?: string[];
  compact?: boolean;
}

export function EmbeddedTasksList({
  layoutKey = "dashboard_tasks",
  showToolbar = true,
  showLayoutManager = true,
  filterStatus,
  compact = false,
}: EmbeddedTasksListProps) {
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [selectedTasks, setSelectedTasks] = useState<Task[]>([]);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showBulkDeleteDialog, setShowBulkDeleteDialog] = useState(false);
  const [showBulkEditDialog, setShowBulkEditDialog] = useState(false);
  const [showBulkCopyDialog, setShowBulkCopyDialog] = useState(false);
  const [showThuAiDialog, setShowThuAiDialog] = useState(false);
  
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

  const { data: tasks, isLoading } = useQuery<Task[]>({
    queryKey: ["/api/tasks"],
    queryFn: getQueryFn({ on401: "throw" }),
    enabled: !!currentOrganizationId,
  });

  const { data: projects = [] } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
    queryFn: getQueryFn({ on401: "throw" }),
    enabled: !!currentOrganizationId,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/tasks/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      setShowDeleteDialog(false);
      setEditingTask(null);
      toast({ title: "Task eliminato" });
    }
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: async (tasksToDelete: Task[]) => {
      for (const task of tasksToDelete) {
        await apiRequest("DELETE", `/api/tasks/${task.id}`);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      setSelectedTasks([]);
      setShowBulkDeleteDialog(false);
      toast({ title: "Tasks eliminati" });
    }
  });

  const bulkEditMutation = useMutation({
    mutationFn: async ({ tasksToEdit, updates }: { tasksToEdit: Task[], updates: Record<string, any> }) => {
      await Promise.all(tasksToEdit.map(task => apiRequest("PUT", `/api/tasks/${task.id}`, updates)));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      // Invalidate project-related queries to refresh ETC calculations
      queryClient.invalidateQueries({ queryKey: ["/api/projects/batch-end-to-complete"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      setSelectedTasks([]);
      setShowBulkEditDialog(false);
      toast({ title: "Tasks modificati" });
    }
  });

  const bulkCopyMutation = useMutation({
    mutationFn: async ({ tasksToCopy, addSuffix, suffix }: { tasksToCopy: Task[], addSuffix: boolean, suffix: string }) => {
      await Promise.all(
        tasksToCopy.map(task => {
          const { id, createdAt, updatedAt, userId, organizationId, ...taskData } = task;
          return apiRequest("POST", "/api/tasks", {
            ...taskData,
            title: addSuffix ? `${task.title}${suffix}` : task.title,
          });
        })
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      setSelectedTasks([]);
      setShowBulkCopyDialog(false);
      toast({ title: "Tasks copiati" });
    },
  });

  const handleEdit = (task: Task) => {
    setEditingTask(task);
    setShowEditDialog(true);
  };

  const handleAdd = () => {
    setEditingTask(null);
    setShowCreateDialog(true);
  };

  const handleSingleDelete = (task: Task) => {
    setEditingTask(task);
    setShowDeleteDialog(true);
  };

  const columnHelpers: ColumnHelpers = {
    onEdit: handleEdit,
    onDelete: handleSingleDelete,
    projects,
  };

  const tableColumns = tasksDescriptor.getColumns(columnHelpers);
  const bulkEditFields = tasksDescriptor.getBulkEditFields({ projects });

  const visibleColumns = useMemo(() => {
    const actionsColumn = tableColumns.find(c => c.key === 'actions');
    
    if (!layout.columns || Object.keys(layout.columns).length === 0) {
      return tableColumns;
    }
    
    const configuredColumns = tableColumns
      .filter(col => {
        if (col.key === 'actions') return false;
        const config = layout.columns[col.key];
        // If column is not in saved layout, treat it as visible (new column)
        // Only hide if explicitly set to visible: false
        if (config === undefined) return true;
        return config.visible !== false;
      })
      .sort((a, b) => {
        const posA = layout.columns[a.key]?.position ?? 999;
        const posB = layout.columns[b.key]?.position ?? 999;
        return posA - posB;
      });
    
    if (actionsColumn) configuredColumns.push(actionsColumn);
    return configuredColumns;
  }, [tableColumns, layout.columns]);

  const filteredTasks = useMemo(() => {
    let result = tasks || [];
    if (filterStatus && filterStatus.length > 0) {
      result = result.filter(t => filterStatus.includes(t.status));
    }
    return result;
  }, [tasks, filterStatus]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        <Clock className="h-6 w-6 animate-spin mr-2" />
        Caricamento...
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {showToolbar && (
        <div className="flex-shrink-0 border-b p-2">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2 flex-wrap">
              <Button size="sm" onClick={handleAdd} data-testid="button-add-task">
                + Nuovo Task
              </Button>
              {selectedTasks.length > 0 && (
                <>
                  <Button size="sm" variant="outline" onClick={() => setShowBulkEditDialog(true)}>
                    Modifica ({selectedTasks.length})
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setShowBulkCopyDialog(true)}>
                    Copia
                  </Button>
                  <Button size="sm" variant="destructive" onClick={() => setShowBulkDeleteDialog(true)}>
                    Elimina
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setShowThuAiDialog(true)}>
                    <Bot className="h-4 w-4 mr-1" />
                    AI
                  </Button>
                </>
              )}
            </div>
            {showLayoutManager && (
              <LayoutManager
                currentLayoutName={currentLayoutName}
                savedLayouts={savedLayouts}
                onLoadLayout={loadLayout}
                onRenameLayout={renameLayout}
                onDeleteLayout={deleteLayout}
              />
            )}
          </div>
        </div>
      )}

      <ScrollArea className="flex-1 min-h-0">
        <UniversalTable
          data={filteredTasks}
          columns={visibleColumns}
          enableSelection={true}
          onSelectionChange={(items) => setSelectedTasks(items as Task[])}
          onRowClick={handleEdit}
        />
      </ScrollArea>

      {/* Create Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nuovo Task</DialogTitle>
          </DialogHeader>
          <TaskFormContainer
            open={showCreateDialog}
            onOpenChange={setShowCreateDialog}
            editingTask={null}
            onSuccess={() => {
              setShowCreateDialog(false);
              queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
            }}
          />
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Modifica Task</DialogTitle>
          </DialogHeader>
          {editingTask && (
            <Tabs defaultValue="details">
              <TabsList>
                <TabsTrigger value="details">Dettagli</TabsTrigger>
                <TabsTrigger value="messages">Messaggi</TabsTrigger>
                <TabsTrigger value="history">Cronologia</TabsTrigger>
              </TabsList>
              <TabsContent value="details">
                <TaskFormContainer
                  open={showEditDialog}
                  onOpenChange={setShowEditDialog}
                  editingTask={editingTask}
                  onSuccess={() => {
                    setShowEditDialog(false);
                    setEditingTask(null);
                    queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
                  }}
                />
              </TabsContent>
              <TabsContent value="messages">
                <MessageHistory tableName="tasks" recordId={editingTask.id} />
              </TabsContent>
              <TabsContent value="history">
                <AuditHistory tableName="tasks" recordId={editingTask.id} />
              </TabsContent>
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
              Sei sicuro di voler eliminare il task "{editingTask?.title}"?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction onClick={() => editingTask && deleteMutation.mutate(editingTask.id)}>
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
              Sei sicuro di voler eliminare {selectedTasks.length} task selezionati?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction onClick={() => bulkDeleteMutation.mutate(selectedTasks)}>
              Elimina tutti
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk Edit/Copy Dialogs */}
      <BulkEditDialog
        open={showBulkEditDialog}
        onOpenChange={setShowBulkEditDialog}
        title="Modifica Task Selezionati"
        description={`Stai modificando ${selectedTasks.length} task. I campi non modificati rimarranno invariati.`}
        fields={bulkEditFields}
        selectedCount={selectedTasks.length}
        onSave={(updates) => bulkEditMutation.mutate({ tasksToEdit: selectedTasks, updates })}
        isPending={bulkEditMutation.isPending}
      />

      <BulkCopyDialog
        open={showBulkCopyDialog}
        onOpenChange={setShowBulkCopyDialog}
        title="Copia Task Selezionati"
        description={`Stai copiando ${selectedTasks.length} task.`}
        selectedCount={selectedTasks.length}
        onCopy={({ addSuffix, suffix }) => bulkCopyMutation.mutate({ tasksToCopy: selectedTasks, addSuffix, suffix })}
        isPending={bulkCopyMutation.isPending}
      />

      {/* AI Dialog */}
      {selectedTasks.length > 0 && (
        <ThuAiDialog
          open={showThuAiDialog}
          onOpenChange={setShowThuAiDialog}
          selectedTasks={selectedTasks}
        />
      )}
    </div>
  );
}
