import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useTableLayout } from "@/lib/user-preferences";
import Sidebar from "@/components/layout/sidebar";
import Header from "@/components/layout/header";
import { DataTable, createBadgeColumn, createTextColumn } from "@/components/ui/data-table";
import { LayoutManager } from "@/components/ui/layout-manager";
import { TableConfiguration } from "@/components/ui/table-configuration";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Trash2, Clock, Calendar, Eye, MoreHorizontal, Grid3X3, List, Edit } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { it } from "date-fns/locale";
import type { Timesheet } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export default function TimesheetsPage() {
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [selectedTimesheet, setSelectedTimesheet] = useState<Timesheet | null>(null);
  const [selectedTimesheets, setSelectedTimesheets] = useState<Timesheet[]>([]);
  const [showBulkDeleteDialog, setShowBulkDeleteDialog] = useState(false);
  const [editingLayout, setEditingLayout] = useState<any>(null);
  const [showConfigDialog, setShowConfigDialog] = useState(false);
  
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Use the table layout hook for persistent preferences
  const { 
    layout, 
    currentLayoutName,
    savedLayouts,
    updateLayout, 
    saveLayoutAs,
    loadLayout,
    renameLayout,
    deleteLayout,
    updateExistingLayout,
  } = useTableLayout('timesheets');
  const viewMode = layout.viewMode;

  const { data: timesheets, isLoading } = useQuery<Timesheet[]>({
    queryKey: ["/api/timesheets"],
    queryFn: async () => {
      const res = await fetch("/api/timesheets", { credentials: "include" });
      if (!res.ok) throw new Error('Failed to fetch timesheets');
      return res.json();
    },
  });

  const deleteTimesheet = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/timesheets/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/timesheets"] });
      toast({ title: "✓ Timesheet eliminato con successo" });
      setShowDeleteDialog(false);
      setSelectedTimesheet(null);
    },
    onError: () => {
      toast({
        title: "Errore nell'eliminazione del timesheet",
        variant: "destructive",
      });
    },
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      await Promise.all(ids.map(id => apiRequest("DELETE", `/api/timesheets/${id}`)));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/timesheets"] });
      toast({ title: `✓ ${selectedTimesheets.length} timesheets eliminati con successo` });
      setShowBulkDeleteDialog(false);
      setSelectedTimesheets([]);
    },
    onError: () => {
      toast({
        title: "Errore nell'eliminazione dei timesheets",
        variant: "destructive",
      });
    },
  });

  const handleDelete = (timesheet: Timesheet) => {
    setSelectedTimesheet(timesheet);
    setShowDeleteDialog(true);
  };

  const handleView = (timesheet: Timesheet) => {
    // TODO: Navigate to timesheet detail view
    console.log("View timesheet:", timesheet);
  };

  // Column definitions for configurable table
  const tableColumns = [
    createTextColumn({
      accessorKey: "name",
      header: "Nome",
      cell: ({ row }: { row: any }) => (
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-blue-500" />
          <span className="font-medium">{row.getValue("name")}</span>
        </div>
      ),
    }),
    createBadgeColumn({
      accessorKey: "groupingFields",
      header: "Raggruppamento",
      cell: ({ row }: { row: any }) => {
        const fields = row.getValue("groupingFields") as string[];
        return (
          <div className="flex gap-1 flex-wrap">
            {fields.map((field, i) => (
              <Badge key={i} variant="secondary" className="text-xs">
                {field === "taskId" ? "Task" : 
                 field === "projectId" ? "Progetto" :
                 field === "date" ? "Data" : field}
              </Badge>
            ))}
          </div>
        );
      },
    }),
    createTextColumn({
      accessorKey: "totalEntries",
      header: "Voci",
      cell: ({ row }: { row: any }) => (
        <span className="text-sm font-mono">
          {row.getValue("totalEntries")} entry
        </span>
      ),
    }),
    createTextColumn({
      accessorKey: "totalDuration",
      header: "Durata Totale", 
      cell: ({ row }: { row: any }) => {
        const duration = row.getValue("totalDuration") as number;
        const hours = Math.floor(duration / 60);
        const minutes = duration % 60;
        return (
          <span className="text-sm font-mono">
            {hours}h {minutes}m
          </span>
        );
      },
    }),
    createTextColumn({
      accessorKey: "createdAt",
      header: "Creato",
      cell: ({ row }: { row: any }) => {
        const date = new Date(row.getValue("createdAt"));
        return (
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm">
              {formatDistanceToNow(date, {
                addSuffix: true,
                locale: it,
              })}
            </span>
          </div>
        );
      },
    }),
    {
      id: "actions",
      header: "Azioni",
      cell: ({ row }: { row: any }) => {
        const timesheet = row.original;
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" data-testid={`button-timesheet-menu-${timesheet.id}`}>
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem 
                onClick={() => handleView(timesheet)}
                data-testid={`menu-view-timesheet-${timesheet.id}`}
              >
                <Eye className="mr-2 h-4 w-4" />
                Visualizza
              </DropdownMenuItem>
              <DropdownMenuItem 
                onClick={() => handleDelete(timesheet)}
                className="text-destructive"
                data-testid={`menu-delete-timesheet-${timesheet.id}`}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Elimina
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
    },
  ];

  const bulkActions = [
    {
      label: "Elimina selezionati",
      action: () => setShowBulkDeleteDialog(true),
      icon: Trash2,
      variant: "destructive" as const,
      requiresSelection: true,
    },
  ];

  const filterColumns = [
    {
      accessorKey: "name",
      title: "Nome",
      type: "text" as const,
    },
    {
      accessorKey: "totalEntries", 
      title: "Numero Voci",
      type: "number" as const,
    },
    {
      accessorKey: "totalDuration",
      title: "Durata Totale",
      type: "number" as const,
    },
    {
      accessorKey: "createdAt",
      title: "Data Creazione",
      type: "date" as const,
    },
  ];

  if (isLoading) {
    return (
      <div className="flex h-screen overflow-hidden">
        <Sidebar />
        <main className="flex-1 overflow-auto">
          <Header 
            title="Timesheets" 
            subtitle="Gestisci i tuoi timesheet salvati"
          />
          <div className="p-6 space-y-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-auto">
        <Header 
          title="Timesheets" 
          subtitle="Gestisci i tuoi timesheet salvati"
        />
        
        <div className="p-6 space-y-6">
          <div className="flex items-center justify-between">
            <LayoutManager
              layout={layout}
              onLayoutChange={updateLayout}
              onConfigureColumns={() => setShowConfigDialog(true)}
              onSaveLayout={saveLayoutAs}
              onLoadLayout={loadLayout}
              onRenameLayout={renameLayout}
              onDeleteLayout={deleteLayout}
              savedLayouts={savedLayouts}
              currentLayoutName={currentLayoutName}
              className="flex-1"
            />
          </div>

          {timesheets?.length === 0 ? (
            <div className="text-center py-12">
              <Clock className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium text-foreground mb-2">Nessun timesheet ancora</h3>
              <p className="text-muted-foreground mb-4">Crea il tuo primo timesheet dalla pagina Time Entries</p>
            </div>
          ) : viewMode === 'list' ? (
            <DataTable
              key={`timesheets-table-${currentLayoutName}-${JSON.stringify(layout.columns)}`}
              columns={tableColumns}
              data={timesheets || []}
              searchPlaceholder="Cerca timesheets..."
              enableSelection={true}
              onSelectionChange={setSelectedTimesheets}
              bulkActions={bulkActions}
              tableId="timesheets"
              configurableColumns={true}
              enableAdvancedFilters={true}
              filterColumns={filterColumns}
              enableColumnReordering={true}
              enableClipboardCopy={true}
              editingLayout={editingLayout}
            />
          ) : (
            <div className="text-center py-12">
              <p className="text-muted-foreground">Vista grid non ancora implementata per i timesheets</p>
            </div>
          )}
        </div>

        {/* Delete confirmation dialog */}
        <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Elimina Timesheet</AlertDialogTitle>
              <AlertDialogDescription>
                Sei sicuro di voler eliminare questo timesheet? Questa azione non può essere annullata.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Annulla</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => selectedTimesheet && deleteTimesheet.mutate(selectedTimesheet.id)}
                className="bg-red-600 hover:bg-red-700"
              >
                Elimina
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Bulk delete confirmation dialog */}
        <AlertDialog open={showBulkDeleteDialog} onOpenChange={setShowBulkDeleteDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Elimina Timesheets</AlertDialogTitle>
              <AlertDialogDescription>
                Sei sicuro di voler eliminare {selectedTimesheets.length} timesheets? Questa azione non può essere annullata.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Annulla</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => bulkDeleteMutation.mutate(selectedTimesheets.map(t => t.id))}
                className="bg-red-600 hover:bg-red-700"
              >
                Elimina Tutti
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Table Configuration Dialog */}
        <TableConfiguration
          open={showConfigDialog}
          onOpenChange={setShowConfigDialog}
          layout={layout}
          onLayoutChange={updateLayout}
          availableColumns={tableColumns}
          tableId="timesheets"
          editingLayout={editingLayout}
          onEditingLayoutChange={setEditingLayout}
          onSaveLayout={updateExistingLayout}
        />
      </main>
    </div>
  );
}