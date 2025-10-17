import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useTableLayout } from "@/lib/user-preferences";
import Sidebar from "@/components/layout/sidebar";
import Header from "@/components/layout/header";
import { DataTable, createBadgeColumn, createTextColumn } from "@/components/ui/data-table";
import { LayoutManager } from "@/components/ui/layout-manager";
import { ListViewToolbar } from "@/components/ui/list-view-toolbar";
import { TableConfiguration } from "@/components/ui/table-configuration";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Trash2, Clock, Calendar, Eye, MoreHorizontal, Grid3X3, List, Edit } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { it } from "date-fns/locale";
import type { Timesheet, Project, Deal, Partner } from "@shared/schema";
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
  const [selectedTimesheetForView, setSelectedTimesheetForView] = useState<Timesheet | null>(null);
  const [showViewDialog, setShowViewDialog] = useState(false);
  const [convertingToSalesOrder, setConvertingToSalesOrder] = useState<string | null>(null);
  
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

  const updateTimesheetMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) =>
      apiRequest("PUT", `/api/timesheets/${id}`, data),
    onSuccess: (data, variables) => {
      // Only invalidate, don't force refetch to avoid loops
      queryClient.invalidateQueries({ queryKey: ["/api/timesheets"] });
      queryClient.invalidateQueries({ queryKey: ["/api/timesheets", variables.id] });
      
      toast({
        title: "✓ Timesheet aggiornato",
        description: "I totali sono stati aggiornati con successo.",
      });
    },
    onError: () => {
      toast({
        title: "Errore",
        description: "Impossibile aggiornare il timesheet.",
        variant: "destructive",
      });
    },
  });

  const handleDelete = (timesheet: Timesheet) => {
    setSelectedTimesheet(timesheet);
    setShowDeleteDialog(true);
  };

  // Function to convert timesheet to sales order
  const handleConvertToSalesOrder = async (timesheet: Timesheet) => {
    if (convertingToSalesOrder === timesheet.id) return; // Prevent double clicks
    
    setConvertingToSalesOrder(timesheet.id);
    try {
      // Check if timesheet is in correct status for conversion
      if (timesheet.status !== "to_send") {
        toast({
          title: "Stato non valido",
          description: "Il timesheet deve essere in stato 'Da inviare' per poter essere convertito",
          variant: "destructive",
        });
        return;
      }

      // Parse grouped data from timesheet
      const groupedData = timesheet.groupedData ? JSON.parse(timesheet.groupedData) : {};
      
      if (!groupedData || Object.keys(groupedData).length === 0) {
        toast({
          title: "Nessun dato da convertire",
          description: "Il timesheet non contiene gruppi di ore da convertire",
          variant: "destructive",
        });
        return;
      }

      // Calculate totals from grouped data
      let totalDuration = 0;
      let allTimeEntryIds: string[] = [];
      let firstProjectId: string | null = null;
      
      // Extract time entry IDs and calculate total duration from grouped data
      Object.values(groupedData).forEach((groupEntries: any) => {
        if (Array.isArray(groupEntries)) {
          groupEntries.forEach((entry: any) => {
            if (entry.id) {
              allTimeEntryIds.push(entry.id);
            }
            if (entry.duration) {
              totalDuration += entry.duration;
            }
            // Get first task ID for partner identification
            if (!firstProjectId && entry.taskId) {
              firstProjectId = entry.taskId;
            }
          });
        }
      });

      if (allTimeEntryIds.length === 0) {
        toast({
          title: "Nessuna voce di tempo",
          description: "Il timesheet non contiene time entries valide",
          variant: "destructive",
        });
        return;
      }

      // Find the project and client for partner identification
      if (!firstProjectId) {
        toast({
          title: "Task non trovato",
          description: "Non è stato possibile identificare il task per questo timesheet",
          variant: "destructive",
        });
        return;
      }

      const tasksResponse = await fetch('/api/tasks', { credentials: 'include' });
      const tasks = await tasksResponse.json();
      const task = tasks.find((t: any) => t.id === firstProjectId);
      
      if (!task || !task.projectId) {
        toast({
          title: "Progetto non trovato",
          description: "Non è stato possibile identificare il progetto per questo timesheet",
          variant: "destructive",
        });
        return;
      }

      const projectsResponse = await fetch('/api/projects', { credentials: 'include' });
      const projects = await projectsResponse.json();
      const project = projects.find((p: any) => p.id === task.projectId);
      
      if (!project || !project.clientId) {
        toast({
          title: "Cliente non trovato", 
          description: "Il progetto non ha un cliente associato",
          variant: "destructive",
        });
        return;
      }

      // Convert to sales order using the API endpoint
      const salesOrderResponse = await fetch('/api/sales-orders/from-timesheet', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          timeEntryIds: allTimeEntryIds,
          partnerId: project.clientId,
          description: `Ordine generato da Timesheet: ${timesheet.name}`,
          hourlyRate: "50" // Default rate
        })
      });

      if (!salesOrderResponse.ok) {
        const error = await salesOrderResponse.json();
        throw new Error(error.error || 'Failed to create sales order');
      }

      const salesOrder = await salesOrderResponse.json();
      
      // Invalidate sales orders cache
      queryClient.invalidateQueries({ queryKey: ["/api/sales-orders"] });
      
      // Update timesheet status to "sent" after successful conversion
      await updateTimesheetMutation.mutateAsync({
        id: timesheet.id,
        data: { status: "sent" }
      });

      toast({
        title: "✓ Ordine di vendita creato",
        description: `Ordine ${salesOrder.orderNumber} creato con successo`,
      });

    } catch (error) {
      console.error('Error creating sales order:', error);
      toast({
        title: "Errore",
        description: error instanceof Error ? error.message : "Errore nel creare l'ordine di vendita",
        variant: "destructive"
      });
    } finally {
      setConvertingToSalesOrder(null);
    }
  };

  const handleView = (timesheet: Timesheet) => {
    setSelectedTimesheetForView(timesheet);
    setShowViewDialog(true);
  };

  // Column definitions for configurable table
  const tableColumns = [
    {
      accessorKey: "name",
      header: "Nome",
      cell: ({ row }: { row: any }) => (
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-blue-500" />
          <span className="font-medium">{row.getValue("name")}</span>
        </div>
      ),
    },
    {
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
    },
    {
      accessorKey: "totalEntries",
      header: "Voci",
      cell: ({ row }: { row: any }) => (
        <span className="text-sm">
          {row.getValue("totalEntries")} entry
        </span>
      ),
    },
    {
      accessorKey: "totalDuration",
      header: "Durata Totale", 
      cell: ({ row }: { row: any }) => {
        const duration = row.getValue("totalDuration") as number;
        const hours = Math.floor(duration / 60);
        const minutes = duration % 60;
        return (
          <span className="text-sm">
            {hours}h {minutes}m
          </span>
        );
      },
    },
    {
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
    },
    {
      accessorKey: "status",
      header: "Stato",
      cell: ({ row }: { row: any }) => {
        const status = row.getValue("status") as string;
        const statusLabels = {
          draft: "Bozza",
          to_send: "Da inviare", 
          sent: "Inviato",
          invoiced: "Fatturato"
        };
        const statusColors = {
          draft: "bg-gray-100 text-gray-800",
          to_send: "bg-yellow-100 text-yellow-800",
          sent: "bg-blue-100 text-blue-800", 
          invoiced: "bg-green-100 text-green-800"
        };
        return (
          <Badge 
            className={`text-xs ${statusColors[status as keyof typeof statusColors] || "bg-gray-100 text-gray-800"}`}
            variant="secondary"
          >
            {statusLabels[status as keyof typeof statusLabels] || status}
          </Badge>
        );
      },
    },
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
                onClick={async () => {
                  await handleConvertToSalesOrder(timesheet);
                }}
                disabled={convertingToSalesOrder === timesheet.id || timesheet.status !== "to_send"}
                data-testid={`menu-convert-timesheet-${timesheet.id}`}
              >
                <svg className="mr-2 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                Crea Ordine Vendita
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
      onClick: () => setShowBulkDeleteDialog(true),
      icon: Trash2,
      variant: "destructive" as const,
      requiresSelection: true,
    },
    {
      label: "Crea Ordine Vendita",
      onClick: async (selectedTimesheets: Timesheet[]) => {
        if (selectedTimesheets.length === 0) {
          toast({
            title: "Nessun timesheet selezionato",
            description: "Seleziona almeno un timesheet per creare l'ordine",
            variant: "destructive"
          });
          return;
        }

        // Process each selected timesheet
        for (const timesheet of selectedTimesheets) {
          try {
            await handleConvertToSalesOrder(timesheet);
          } catch (error) {
            console.error(`Error converting timesheet ${timesheet.name}:`, error);
            toast({
              title: "Errore conversione",
              description: `Errore nel convertire il timesheet "${timesheet.name}"`,
              variant: "destructive"
            });
          }
        }
      },
      icon: ({ className }: { className?: string }) => (
        <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      ),
      variant: "default" as const,
      requiresSelection: true,
    },
  ];

  const filterColumns = [
    {
      id: "name",
      label: "Nome",
      type: "text" as const,
    },
    {
      id: "totalEntries", 
      label: "Numero Voci",
      type: "number" as const,
    },
    {
      id: "totalDuration",
      label: "Durata Totale",
      type: "number" as const,
    },
    {
      id: "createdAt",
      label: "Data Creazione",
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
            onNewClick={() => {}}
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
          <ListViewToolbar
            currentLayoutName={currentLayoutName}
            savedLayouts={savedLayouts}
            onLoadLayout={loadLayout}
            onRenameLayout={renameLayout}
            onDeleteLayout={deleteLayout}
            onConfigureTable={() => setShowConfigDialog(true)}
            onCreateNew={() => {/* TODO: implement create */}}
            onCopySelected={() => {/* TODO: implement copy */}}
            onBulkEdit={() => {/* TODO: implement bulk edit */}}
            onDeleteSelected={() => setShowBulkDeleteDialog(true)}
            hasSelection={selectedTimesheets.length > 0}
            viewToggle={
              <div className="flex border rounded-lg">
                <Button 
                  variant={viewMode === 'list' ? 'default' : 'ghost'} 
                  size="sm" 
                  onClick={() => updateLayout({ viewMode: 'list' })}
                  className="rounded-r-none"
                  data-testid="button-view-list"
                >
                  <List className="h-4 w-4" />
                </Button>
                <Button 
                  variant={viewMode === 'cards' ? 'default' : 'ghost'} 
                  size="sm" 
                  onClick={() => updateLayout({ viewMode: 'cards' })}
                  className="rounded-l-none"
                  data-testid="button-view-cards"
                >
                  <Grid3X3 className="h-4 w-4" />
                </Button>
              </div>
            }
          />

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
              configurableColumns={false}
              enableAdvancedFilters={false}
              enableColumnReordering={false}
              enableClipboardCopy={false}
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
          isOpen={showConfigDialog}
          onOpenChange={setShowConfigDialog}
          tableId="timesheets"
          availableColumns={tableColumns.map(col => ({
            id: 'id' in col ? col.id! : col.accessorKey!,
            label: col.header as string
          }))}
          editingLayout={editingLayout}
          onSave={(layoutData) => {
            updateLayout(layoutData);
            setShowConfigDialog(false);
          }}
          onCancel={() => setShowConfigDialog(false)}
        />

        {/* Timesheet Detail Dialog */}
        <TimesheetDetailDialog
          timesheetId={selectedTimesheetForView?.id || ""}
          open={showViewDialog && !!selectedTimesheetForView}
          onOpenChange={setShowViewDialog}
          onTimesheetUpdate={() => {
            queryClient.invalidateQueries({ queryKey: ["/api/timesheets"] });
          }}
          updateTimesheetMutation={updateTimesheetMutation}
          onConvertToSalesOrder={handleConvertToSalesOrder}
          convertingToSalesOrder={convertingToSalesOrder}
        />
      </main>
    </div>
  );
}

function TimesheetDetailDialog({ 
  timesheetId, 
  open, 
  onOpenChange,
  onTimesheetUpdate,
  updateTimesheetMutation,
  onConvertToSalesOrder,
  convertingToSalesOrder
}: { 
  timesheetId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onTimesheetUpdate: () => void;
  updateTimesheetMutation: any;
  onConvertToSalesOrder: (timesheet: Timesheet) => Promise<void>;
  convertingToSalesOrder: string | null;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  // Always declare hooks - enabled condition controls when they run
  const { data: timesheet, isLoading: isLoadingTimesheet } = useQuery({
    queryKey: ["/api/timesheets", timesheetId],
    queryFn: async () => {
      const res = await fetch(`/api/timesheets/${timesheetId}`, { credentials: "include" });
      if (!res.ok) throw new Error('Failed to fetch timesheet');
      return res.json();
    },
    enabled: open && !!timesheetId,
  });

  // Fetch time entries for editing
  const { data: timeEntries } = useQuery({
    queryKey: ["/api/time-entries"],
    queryFn: async () => {
      const res = await fetch("/api/time-entries", { credentials: "include" });
      if (!res.ok) throw new Error('Failed to fetch time entries');
      return res.json();
    },
    enabled: open,
  });

  const deleteEntryMutation = useMutation({
    mutationFn: async (entryId: string) => {
      await apiRequest("DELETE", `/api/time-entries/${entryId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/time-entries"] });
      onTimesheetUpdate();
      toast({ title: "✓ Time entry eliminata dal timesheet" });
    },
    onError: () => {
      toast({
        title: "Errore nell'eliminazione della time entry",
        variant: "destructive",
      });
    },
  });

  const updateEntryMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      await apiRequest("PUT", `/api/time-entries/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/time-entries"] });
      onTimesheetUpdate();
      toast({ title: "✓ Time entry aggiornata" });
    },
    onError: () => {
      toast({
        title: "Errore nell'aggiornamento della time entry",
        variant: "destructive",
      });
    },
  });

  // Conversion helper functions
  const { data: projects } = useQuery({
    queryKey: ["/api/projects"],
    enabled: open,
  });

  const { data: deals } = useQuery({
    queryKey: ["/api/deals"],
    enabled: open,
  });

  const { data: partners } = useQuery({
    queryKey: ["/api/partners"],
    enabled: open,
  });

  const createSalesOrderMutation = useMutation({
    mutationFn: async (salesOrderData: any) => {
      const response = await apiRequest("POST", "/api/sales-orders", salesOrderData);
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sales-orders"] });
      toast({ title: "✓ Ordine di vendita creato con successo" });
    },
    onError: () => {
      toast({
        title: "Errore nella creazione dell'ordine di vendita",
        variant: "destructive",
      });
    },
  });

  const createSalesOrderItemMutation = useMutation({
    mutationFn: async (itemData: any) => {
      return await apiRequest("POST", "/api/sales-order-items", itemData);
    },
  });

  const handleConvertToInvoice = async (timesheet: Timesheet) => {
    toast({
      title: "Funzionalità in sviluppo",
      description: "La conversione in fattura sarà disponibile presto",
    });
  };

  // Don't render dialog content if not open
  if (!open) {
    return null;
  }

  // Show loading state while data is being fetched
  if (isLoadingTimesheet || !timesheet) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Caricamento Timesheet</DialogTitle>
            <DialogDescription>
              Caricamento dei dettagli del timesheet in corso...
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center justify-center py-8">
            <div className="text-sm text-muted-foreground">Caricamento...</div>
          </div>
        </DialogContent>
      </Dialog>
    );
  }
  
  // Parse grouped data from timesheet 
  let groupedData: Record<string, any[]> = {};
  
  try {
    groupedData = JSON.parse(timesheet.groupedData || '{}');
  } catch (e) {
    console.error('Error parsing timesheet grouped data:', e);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-blue-500" />
            {timesheet.name || 'Timesheet'}
          </DialogTitle>
          <DialogDescription>
            {timesheet.description || 'Dettagli del timesheet e delle time entries associate'}
          </DialogDescription>
        </DialogHeader>

        {/* Timesheet Summary */}
        <div className="grid grid-cols-3 gap-4 p-4 bg-muted/30 rounded-lg mb-6">
          <div className="text-center">
            <div className="text-2xl font-bold text-blue-600">{timesheet.totalEntries || 0}</div>
            <div className="text-sm text-muted-foreground">Voci totali</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-green-600">
              {Math.floor((timesheet.totalDuration || 0) / 60)}h {(timesheet.totalDuration || 0) % 60}m
            </div>
            <div className="text-sm text-muted-foreground">Durata totale</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-purple-600">{Object.keys(groupedData || {}).length}</div>
            <div className="text-sm text-muted-foreground">Gruppi</div>
          </div>
        </div>

        {/* Status Management */}
        <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg mb-6">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-sm font-medium text-gray-900 mb-1">Stato Timesheet</h4>
              <p className="text-xs text-gray-600">Il timesheet può essere convertito solo quando è "Da inviare"</p>
            </div>
            <div className="flex items-center gap-2">
              <Select 
                value={timesheet.status || "draft"}
                onValueChange={(value) => {
                  updateTimesheetMutation.mutate({
                    id: timesheet.id,
                    data: { status: value }
                  });
                }}
              >
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">Bozza</SelectItem>
                  <SelectItem value="to_send">Da inviare</SelectItem>
                  <SelectItem value="sent">Inviato</SelectItem>
                  <SelectItem value="invoiced">Fatturato</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        {/* Conversion Actions */}
        <div className="flex justify-end gap-3 mb-6 p-4 bg-gradient-to-r from-blue-50 to-green-50 border border-blue-200 rounded-lg">
          <div className="flex-1">
            <h4 className="text-sm font-medium text-gray-900 mb-1">Conversione Documenti</h4>
            <p className="text-xs text-gray-600">Trasforma le ore registrate in documenti commerciali</p>
          </div>
          <div className="flex gap-2">
            <Button 
              onClick={() => onConvertToSalesOrder(timesheet)}
              disabled={convertingToSalesOrder === timesheet.id || timesheet.status !== "to_send"}
              className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
              data-testid="button-convert-sales-order"
            >
              {convertingToSalesOrder === timesheet.id ? "⏳ Creando..." : "📋 Ordine di Vendita"}
            </Button>
            <Button 
              onClick={() => handleConvertToInvoice(timesheet)}
              className="bg-green-600 hover:bg-green-700"
              data-testid="button-convert-invoice"
            >
              🧾 Fattura
            </Button>
          </div>
        </div>

        {/* Grouped Time Entries - Aggregated View */}
        <div className="space-y-4">
          <h3 className="text-lg font-semibold">Raggruppamenti Timesheet</h3>
          
          <div className="border rounded-lg overflow-hidden">
            <div className="bg-muted/30 px-4 py-3 border-b">
              <div className="grid grid-cols-12 gap-4 text-sm font-medium text-muted-foreground">
                <div className="col-span-6">Gruppo</div>
                <div className="col-span-2 text-center">Voci</div>
                <div className="col-span-2 text-center">Durata Totale</div>
                <div className="col-span-2 text-center">Azioni</div>
              </div>
            </div>
            
            <div className="divide-y">
              {Object.entries(groupedData || {}).map(([groupKey, entries]) => {
                // Calculate total duration for this group
                const groupDuration = Array.isArray(entries) ? entries.reduce((sum, entry) => sum + (entry.duration || 0), 0) : 0;
                
                return (
                  <TimesheetGroupRow
                    key={groupKey}
                    groupKey={groupKey}
                    entries={entries || []}
                    totalDuration={groupDuration}
                    onEntryDelete={(entryId) => deleteEntryMutation.mutate(entryId)}
                    onEntryUpdate={(entryId, data) => updateEntryMutation.mutate({ id: entryId, data })}
                    onGroupTotalUpdate={(newTotal) => {
                      // Update the grouped data and recalculate timesheet total
                      const updatedGroupedData = { ...(groupedData || {}) };
                      if (updatedGroupedData[groupKey]) {
                        // Update the duration for entries in this group
                        // This is a simplified approach - in reality you'd want to distribute the duration
                        updatedGroupedData[groupKey] = entries;
                      }
                      
                      // Calculate new total timesheet duration
                      const newTimesheetTotal = Object.values(updatedGroupedData).flat().reduce((sum: number, entry: any) => sum + (entry.duration || 0), 0);
                      
                      updateTimesheetMutation.mutate({
                        id: timesheet.id,
                        data: { 
                          totalDuration: newTimesheetTotal,
                          groupedData: JSON.stringify(updatedGroupedData)
                        }
                      });
                    }}
                  />
                );
              })}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function TimesheetGroupRow({
  groupKey,
  entries,
  totalDuration,
  onEntryDelete,
  onEntryUpdate,
  onGroupTotalUpdate
}: {
  groupKey: string;
  entries: any[];
  totalDuration: number;
  onEntryDelete: (entryId: string) => void;
  onEntryUpdate: (entryId: string, data: any) => void;
  onGroupTotalUpdate?: (newTotal: number) => void;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isEditingTotal, setIsEditingTotal] = useState(false);
  const [editedTotal, setEditedTotal] = useState(totalDuration);
  const [displayDuration, setDisplayDuration] = useState(totalDuration);
  
  // Update display duration when prop changes
  useEffect(() => {
    setDisplayDuration(totalDuration);
  }, [totalDuration]);
  
  // Function to normalize duration to 15-minute increments
  const normalizeDuration = (minutes: number) => {
    return Math.round(minutes / 15) * 15;
  };
  
  const formatDuration = (minutes: number) => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours}h ${mins}m`;
  };

  // Parse group info from groupKey
  const groupInfo = groupKey.split(' | ').reduce((acc, part) => {
    const [key, value] = part.split(': ');
    acc[key] = value;
    return acc;
  }, {} as Record<string, string>);

  return (
    <>
      <div className="px-4 py-3 hover:bg-muted/20 transition-colors">
        <div className="grid grid-cols-12 gap-4 items-center">
          {/* Group Info */}
          <div className="col-span-6">
            <div className="space-y-1">
              <div className="font-medium text-sm">
                {groupInfo.Task || 'Task sconosciuto'}
              </div>
              <div className="text-xs text-muted-foreground space-y-0.5">
                {groupInfo.Project && (
                  <div>🏗️ {groupInfo.Project}</div>
                )}
                {groupInfo.Date && (
                  <div>📅 {groupInfo.Date}</div>
                )}
                {groupInfo.description && groupInfo.description !== 'Unknown' && (
                  <div>📝 {groupInfo.description}</div>
                )}
              </div>
            </div>
          </div>

          {/* Entry Count */}
          <div className="col-span-2 text-center">
            <Badge variant="secondary" className="text-xs">
              {entries.length} voci
            </Badge>
          </div>

          {/* Total Duration */}
          <div className="col-span-2 text-center">
            {isEditingTotal ? (
              <div className="flex items-center justify-center gap-1">
                <input
                  type="number"
                  value={Math.round(editedTotal)}
                  onChange={(e) => {
                    const value = parseInt(e.target.value) || 0;
                    // Allow manual input without auto-normalization
                    setEditedTotal(value);
                  }}
                  className="w-16 px-1 py-0.5 border rounded text-xs text-center"
                  min="0"
                  step="15"
                />
                <span className="text-xs text-muted-foreground">min</span>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    // Use the exact value entered by user (no normalization)
                    setDisplayDuration(editedTotal);
                    onGroupTotalUpdate?.(editedTotal);
                    setIsEditingTotal(false);
                  }}
                  className="h-5 w-5 p-0 text-green-600"
                >
                  ✓
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setEditedTotal(displayDuration);
                    setIsEditingTotal(false);
                  }}
                  className="h-5 w-5 p-0 text-gray-600"
                >
                  ✕
                </Button>
              </div>
            ) : (
              <div 
                className="font-medium text-green-600 cursor-pointer hover:bg-green-50 px-2 py-1 rounded"
                onClick={() => {
                  // Start editing with current raw value
                  setEditedTotal(displayDuration);
                  setIsEditingTotal(true);
                }}
                title="Clicca per modificare il totale"
              >
                {formatDuration(displayDuration)}
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="col-span-2 text-center">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsExpanded(!isExpanded)}
              className="h-8"
            >
              {isExpanded ? '▼ Chiudi' : '▶ Espandi'}
            </Button>
          </div>
        </div>
      </div>

      {/* Expanded Entry Details */}
      {isExpanded && (
        <div className="px-8 py-4 bg-muted/10 border-t">
          <div className="space-y-3">
            <h5 className="text-sm font-medium text-muted-foreground">Dettagli Entry:</h5>
            <div className="grid gap-3">
              {entries.map((entry, index) => (
                <TimesheetEntryCard
                  key={entry.id || index}
                  entry={entry}
                  onDelete={() => onEntryDelete(entry.id)}
                  onUpdate={(data) => onEntryUpdate(entry.id, data)}
                />
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function TimesheetEntryCard({ 
  entry, 
  onDelete, 
  onUpdate 
}: { 
  entry: any;
  onDelete: () => void;
  onUpdate: (data: any) => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  // Calculate duration from entry data
  const calculateEntryDuration = (entry: any) => {
    if (entry.durationMinutes || entry.duration) {
      return entry.durationMinutes || entry.duration;
    }
    
    if (entry.startTime && entry.endTime) {
      const start = new Date(entry.startTime);
      const end = new Date(entry.endTime);
      return Math.max(0, (end.getTime() - start.getTime()) / (1000 * 60));
    }
    
    return 0;
  };

  const [editedDuration, setEditedDuration] = useState(() => calculateEntryDuration(entry));
  const [editedDescription, setEditedDescription] = useState(entry.description || '');

  const handleSave = () => {
    onUpdate({
      durationMinutes: editedDuration,
      description: editedDescription,
    });
    setIsEditing(false);
  };

  const formatTime = (date: string) => {
    return new Date(date).toLocaleTimeString('it-IT', { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  };

  const formatDuration = (minutes: number) => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours}h ${mins}m`;
  };

  return (
    <div className="bg-white border rounded-lg p-3 text-sm">
      <div className="flex items-start justify-between">
        <div className="flex-1 space-y-2">
          <div className="flex items-center gap-2">
            <span className="font-medium">{entry.taskTitle || 'Task sconosciuto'}</span>
            <Badge variant="outline" className="text-xs">
              {entry.projectName || 'No Project'}
            </Badge>
          </div>
          
          <div className="text-xs text-muted-foreground">
            ⏰ {formatTime(entry.startTime)} - {formatTime(entry.endTime)}
          </div>

          {isEditing ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <label className="text-xs font-medium">Durata (min):</label>
                <input
                  type="number"
                  value={editedDuration}
                  onChange={(e) => setEditedDuration(parseInt(e.target.value) || 0)}
                  className="w-16 px-1 py-0.5 border rounded text-xs"
                  min="0"
                />
              </div>
              <div>
                <label className="text-xs font-medium">Descrizione:</label>
                <input
                  type="text"
                  value={editedDescription}
                  onChange={(e) => setEditedDescription(e.target.value)}
                  className="w-full px-2 py-1 border rounded text-xs mt-1"
                  placeholder="Aggiungi descrizione..."
                />
              </div>
            </div>
          ) : (
            <div className="space-y-1">
              <div className="text-xs bg-blue-50 px-2 py-1 rounded w-fit">
                ⏱️ {formatDuration(calculateEntryDuration(entry))}
              </div>
              {entry.description && (
                <div className="text-xs text-muted-foreground">
                  📝 {entry.description}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center gap-1">
          {isEditing ? (
            <>
              <Button 
                size="sm" 
                variant="ghost"
                onClick={handleSave}
                className="h-6 w-6 p-0 text-green-600"
              >
                ✓
              </Button>
              <Button 
                size="sm" 
                variant="ghost"
                onClick={() => setIsEditing(false)}
                className="h-6 w-6 p-0 text-gray-600"
              >
                ✕
              </Button>
            </>
          ) : (
            <>
              <Button 
                size="sm" 
                variant="ghost"
                onClick={() => setIsEditing(true)}
                className="h-6 w-6 p-0"
                data-testid={`button-edit-entry-${entry.id}`}
              >
                <Edit className="h-3 w-3" />
              </Button>
              <Button 
                size="sm" 
                variant="ghost"
                onClick={onDelete}
                className="h-6 w-6 p-0 text-red-500 hover:text-red-700"
                data-testid={`button-delete-entry-${entry.id}`}
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}