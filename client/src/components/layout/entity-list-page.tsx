import { useState, useMemo, type ReactNode } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, getQueryFn } from "@/lib/queryClient";
import { useOrganization } from "@/contexts/organization-context";
import { useTableLayout, type SavedLayout } from "@/lib/user-preferences";
import Sidebar from "@/components/layout/sidebar";
import Header from "@/components/layout/header";
import { DataTable } from "@/components/ui/data-table";
import type { ColumnDef } from "@tanstack/react-table";
import { ListViewToolbar } from "@/components/ui/list-view-toolbar";
import { RelationshipPreviewProvider } from "@/components/ui/relationship-preview-context";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { BulkEditDialog, type BulkEditField } from "@/components/dialogs/bulk-edit-dialog";
import { BulkCopyDialog } from "@/components/dialogs/bulk-copy-dialog";
import type { LucideIcon } from "lucide-react";

export interface EntityListPageConfig<T> {
  entityType: string;
  tableId: string;
  apiPath: string;

  // Header
  title: string;
  subtitle: string;
  emptyIcon: LucideIcon;
  emptyMessage: string;

  // Columns
  columns: ColumnDef<T, any>[];

  // Row actions
  onRowClick?: (item: T) => void;

  // Bulk edit fields (omit to disable bulk edit)
  bulkEditFields?: BulkEditField[];
  bulkEditApiPath?: string;

  // Bulk copy (omit to disable)
  enableBulkCopy?: boolean;
  bulkCopyNameField?: string;

  // Custom toolbar actions
  customToolbarActions?: ReactNode;

  // Form component for create/edit
  renderForm?: (props: {
    isOpen: boolean;
    onClose: () => void;
    editingItem: T | null;
    onSaved: () => void;
  }) => ReactNode;
}

export function EntityListPage<T extends { id: string; name?: string }>({
  config,
}: {
  config: EntityListPageConfig<T>;
}) {
  const { currentOrganizationId } = useOrganization();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Layout
  const {
    currentLayoutName,
    savedLayouts,
    loadLayout,
    renameLayout,
    deleteLayout,
  } = useTableLayout(config.tableId);

  // Data
  const { data: items = [], isLoading } = useQuery<T[]>({
    queryKey: [config.apiPath],
    queryFn: getQueryFn({ on401: "throw" }),
    enabled: !!currentOrganizationId,
  });

  // State
  const [selectedItems, setSelectedItems] = useState<T[]>([]);
  const [editingItem, setEditingItem] = useState<T | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<T | null>(null);
  const [bulkDeleteTargets, setBulkDeleteTargets] = useState<T[]>([]);
  const [showBulkEdit, setShowBulkEdit] = useState(false);
  const [showBulkCopy, setShowBulkCopy] = useState(false);

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `${config.apiPath}/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [config.apiPath] });
      toast({ title: "Eliminato con successo" });
      setDeleteTarget(null);
    },
    onError: () => {
      toast({ title: "Errore", description: "Impossibile eliminare", variant: "destructive" });
    },
  });

  // Bulk delete
  const handleBulkDelete = async () => {
    for (const item of bulkDeleteTargets) {
      await apiRequest("DELETE", `${config.apiPath}/${item.id}`);
    }
    queryClient.invalidateQueries({ queryKey: [config.apiPath] });
    toast({ title: `${bulkDeleteTargets.length} elementi eliminati` });
    setBulkDeleteTargets([]);
    setSelectedItems([]);
  };

  // Handlers
  const handleCreate = () => {
    setEditingItem(null);
    setIsFormOpen(true);
  };

  const handleEdit = (item: T) => {
    if (config.onRowClick) {
      config.onRowClick(item);
    } else {
      setEditingItem(item);
      setIsFormOpen(true);
    }
  };

  const handleFormClose = () => {
    setIsFormOpen(false);
    setEditingItem(null);
  };

  const handleSaved = () => {
    queryClient.invalidateQueries({ queryKey: [config.apiPath] });
    handleFormClose();
  };

  const EmptyIcon = config.emptyIcon;

  return (
    <RelationshipPreviewProvider>
      <div className="flex h-screen overflow-hidden">
        <Sidebar />
        <main className="flex-1 overflow-auto">
          <Header title={config.title} subtitle={config.subtitle} />

          <div
            className="p-6 rounded-t-lg min-h-full"
            style={{
              borderTop: '2px solid hsl(var(--brand) / 0.3)',
              borderLeft: '2px solid hsl(var(--brand) / 0.3)',
              borderRight: '2px solid hsl(var(--brand) / 0.3)'
            }}
          >
            <ListViewToolbar
              currentLayoutName={currentLayoutName}
              savedLayouts={savedLayouts}
              onLoadLayout={loadLayout}
              onRenameLayout={renameLayout}
              onDeleteLayout={deleteLayout}
              customActions={config.customToolbarActions}
              onCreateNew={config.renderForm ? handleCreate : undefined}
              onCopySelected={config.enableBulkCopy ? () => setShowBulkCopy(true) : undefined}
              onBulkEdit={config.bulkEditFields ? () => setShowBulkEdit(true) : undefined}
              onDeleteSelected={() => setBulkDeleteTargets(selectedItems)}
              hasSelection={selectedItems.length > 0}
            />

            {isLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : items.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
                <EmptyIcon className="h-12 w-12 mb-4 opacity-50" />
                <p className="text-lg font-medium">{config.emptyMessage}</p>
              </div>
            ) : (
              <DataTable
                columns={config.columns}
                data={items}
                tableId={config.tableId}
                searchPlaceholder={`Cerca ${config.title.toLowerCase()}...`}
                onRowClick={handleEdit}
                enableSelection
                onSelectionChange={setSelectedItems}
                enableColumnReordering
                enableClipboardCopy
              />
            )}
          </div>
        </main>

        {/* Form dialog */}
        {config.renderForm?.({
          isOpen: isFormOpen,
          onClose: handleFormClose,
          editingItem,
          onSaved: handleSaved,
        })}

        {/* Single delete */}
        <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Conferma eliminazione</AlertDialogTitle>
              <AlertDialogDescription>
                Sei sicuro di voler eliminare "{(deleteTarget as any)?.name}"? L'azione non è reversibile.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Annulla</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Elimina
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Bulk delete */}
        <AlertDialog open={bulkDeleteTargets.length > 0} onOpenChange={() => setBulkDeleteTargets([])}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Elimina {bulkDeleteTargets.length} elementi</AlertDialogTitle>
              <AlertDialogDescription>
                Sei sicuro di voler eliminare {bulkDeleteTargets.length} elementi selezionati?
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Annulla</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleBulkDelete}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Elimina tutti
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Bulk edit */}
        {config.bulkEditFields && (
          <BulkEditDialog
            isOpen={showBulkEdit}
            onClose={() => setShowBulkEdit(false)}
            selectedItems={selectedItems}
            fields={config.bulkEditFields}
            apiPath={config.bulkEditApiPath || config.apiPath}
            onSuccess={() => {
              queryClient.invalidateQueries({ queryKey: [config.apiPath] });
              setShowBulkEdit(false);
              setSelectedItems([]);
            }}
          />
        )}

        {/* Bulk copy */}
        {config.enableBulkCopy && (
          <BulkCopyDialog
            isOpen={showBulkCopy}
            onClose={() => setShowBulkCopy(false)}
            selectedItems={selectedItems}
            apiPath={config.apiPath}
            nameField={config.bulkCopyNameField || "name"}
            onSuccess={() => {
              queryClient.invalidateQueries({ queryKey: [config.apiPath] });
              setShowBulkCopy(false);
              setSelectedItems([]);
            }}
          />
        )}
      </div>
    </RelationshipPreviewProvider>
  );
}
