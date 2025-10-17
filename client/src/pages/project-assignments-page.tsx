import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTableLayout } from "@/lib/user-preferences";
import Sidebar from "@/components/layout/sidebar";
import Header from "@/components/layout/header";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { ListViewToolbar } from "@/components/ui/list-view-toolbar";
import { TableConfiguration } from "@/components/ui/table-configuration";
import { UniversalTable, createStandardColumns } from "@/components/ui/universal-table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, getQueryFn } from "@/lib/queryClient";
import { Users, MoreHorizontal, Edit, Trash2 } from "lucide-react";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { ProjectAssignment, Project, HumanResource } from "@shared/schema";
import ProjectAssignmentForm from "@/components/forms/project-assignment-form";

export default function ProjectAssignmentsPage() {
  const [selectedAssignments, setSelectedAssignments] = useState<ProjectAssignment[]>([]);
  const [editingAssignment, setEditingAssignment] = useState<ProjectAssignment | undefined>(undefined);
  const [showForm, setShowForm] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showBulkDeleteDialog, setShowBulkDeleteDialog] = useState(false);
  const [showConfigDialog, setShowConfigDialog] = useState(false);
  const [editingLayout, setEditingLayout] = useState<any>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const {
    layout, currentLayoutName, savedLayouts, updateLayout, 
    saveLayoutAs, loadLayout, renameLayout, deleteLayout, updateExistingLayout
  } = useTableLayout('project-assignments');

  const { data: assignments = [], isLoading } = useQuery<ProjectAssignment[]>({
    queryKey: ["/api/project-assignments"],
    queryFn: getQueryFn({ on401: "throw" }),
    staleTime: 5 * 60 * 1000,
  });

  const { data: projects = [] } = useQuery<Project[]>({ 
    queryKey: ["/api/projects"],
    queryFn: getQueryFn({ on401: "throw" }),
    staleTime: 5 * 60 * 1000,
  });

  const { data: resources = [] } = useQuery<HumanResource[]>({ 
    queryKey: ["/api/human-resources"],
    queryFn: getQueryFn({ on401: "throw" }),
    staleTime: 5 * 60 * 1000,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/project-assignments/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/project-assignments"] });
      setShowDeleteDialog(false);
      setEditingAssignment(undefined);
      toast({ title: "Eliminato", description: "Assegnazione eliminata con successo" });
    }
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: async (assignments: ProjectAssignment[]) => {
      for (const assignment of assignments) {
        await apiRequest("DELETE", `/api/project-assignments/${assignment.id}`);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/project-assignments"] });
      setSelectedAssignments([]);
      setShowBulkDeleteDialog(false);
      toast({ title: "Eliminati", description: "Assegnazioni eliminate con successo" });
    }
  });

  const handleEdit = (assignment: ProjectAssignment) => {
    setEditingAssignment(assignment);
    setShowForm(true);
  };

  const handleAdd = () => {
    setEditingAssignment(undefined);
    setShowForm(true);
  };

  const handleSingleDelete = (assignment: ProjectAssignment) => {
    setEditingAssignment(assignment);
    setShowDeleteDialog(true);
  };

  const handleDelete = (assignments: ProjectAssignment[]) => {
    if (assignments.length === 0) return;
    setSelectedAssignments(assignments);
    setShowBulkDeleteDialog(true);
  };

  const confirmDelete = () => {
    if (editingAssignment) {
      deleteMutation.mutate(editingAssignment.id);
    }
  };

  const confirmBulkDelete = () => {
    bulkDeleteMutation.mutate(selectedAssignments);
  };

  const statusColors = {
    assigned: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300",
    active: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300",
    completed: "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300",
    cancelled: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300"
  };

  const statusLabels = {
    assigned: "Assegnato",
    active: "Attivo",
    completed: "Completato",
    cancelled: "Annullato"
  };

  const engagementTypeLabels = {
    fixed: "Importo Fisso",
    hourly: "Tariffa Oraria"
  };

  const columns = [
    createStandardColumns.text("title", "Titolo"),
    {
      key: "resource",
      label: "Risorsa", 
      sortable: true,
      searchable: true,
      render: (assignment: ProjectAssignment) => {
        const resource = resources.find(r => r.id === assignment.resourceId);
        return resource?.name || "-";
      }
    },
    {
      key: "project",
      label: "Progetto", 
      sortable: true,
      searchable: true,
      render: (assignment: ProjectAssignment) => {
        const project = projects.find(p => p.id === assignment.projectId);
        return project?.name || "-";
      }
    },
    {
      key: "engagementType",
      label: "Tipo", 
      sortable: true,
      searchable: false,
      render: (assignment: ProjectAssignment) => 
        assignment.engagementType ? engagementTypeLabels[assignment.engagementType] : "-"
    },
    {
      key: "amount",
      label: "Importo/Tariffa", 
      sortable: true,
      searchable: false,
      render: (assignment: ProjectAssignment) => {
        if (assignment.engagementType === 'fixed') {
          return `${assignment.fixedAmount || '0'} ${assignment.currency || 'EUR'}`;
        }
        if (assignment.engagementType === 'hourly') {
          return `${assignment.hourlyRate || '0'}/h (${assignment.estimatedHours || 0}h est.)`;
        }
        return "-";
      }
    },
    {
      key: "status",
      label: "Stato", 
      sortable: true,
      searchable: false,
      render: (assignment: ProjectAssignment) => (
        <Badge className={statusColors[assignment.status || 'assigned']}>
          {statusLabels[assignment.status || 'assigned']}
        </Badge>
      )
    },
    {
      key: "dates",
      label: "Date", 
      sortable: true,
      searchable: false,
      render: (assignment: ProjectAssignment) => {
        if (!assignment.startDate && !assignment.endDate) return "-";
        const start = assignment.startDate ? format(new Date(assignment.startDate), "dd/MM/yyyy", { locale: it }) : "-";
        const end = assignment.endDate ? format(new Date(assignment.endDate), "dd/MM/yyyy", { locale: it }) : "-";
        return `${start} - ${end}`;
      }
    },
    {
      key: "actions",
      label: "Azioni", 
      sortable: false,
      searchable: false,
      render: (assignment: ProjectAssignment) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" data-testid={`button-assignment-menu-${assignment.id}`}>
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem 
              onClick={() => handleEdit(assignment)}
              data-testid={`menu-edit-assignment-${assignment.id}`}
            >
              <Edit className="mr-2 h-4 w-4" />
              Modifica
            </DropdownMenuItem>
            <DropdownMenuItem 
              onClick={() => handleSingleDelete(assignment)}
              className="text-destructive"
              data-testid={`menu-delete-assignment-${assignment.id}`}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Elimina
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )
    },
  ];

  return (
    <div className="flex h-screen">
      <Sidebar />
      <div className="flex-1 overflow-hidden">
        <Header 
          title="Assegnazioni Progetto"
          subtitle="Gestisci le assegnazioni delle risorse ai progetti"
          onNewClick={handleAdd}
        />
        <main className="p-6 space-y-6">
          <ListViewToolbar
            currentLayoutName={currentLayoutName}
            savedLayouts={savedLayouts}
            onLoadLayout={loadLayout}
            onRenameLayout={renameLayout}
            onDeleteLayout={deleteLayout}
            onConfigureTable={() => setShowConfigDialog(true)}
            onCreateNew={handleAdd}
            onCopySelected={() => {/* TODO: implement copy */}}
            onBulkEdit={() => {/* TODO: implement bulk edit */}}
            onDeleteSelected={() => handleDelete(selectedAssignments)}
            hasSelection={selectedAssignments.length > 0}
          />

          <UniversalTable
            data={assignments}
            columns={columns}
            enableSelection={true}
            onSelectionChange={(rows) => setSelectedAssignments(rows as ProjectAssignment[])}
            onRowClick={handleEdit}
            bulkActions={[
              {
                label: "Elimina Selezionati",
                icon: Trash2,
                variant: "destructive",
                onClick: () => handleDelete(selectedAssignments)
              }
            ]}
          />

          {/* Create/Edit Dialog */}
          <Dialog open={showForm} onOpenChange={setShowForm}>
            <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>
                  {editingAssignment ? "Modifica Assegnazione" : "Nuova Assegnazione"}
                </DialogTitle>
                <DialogDescription>
                  {editingAssignment ? "Aggiorna" : "Crea"} un'assegnazione di progetto
                </DialogDescription>
              </DialogHeader>
              <ProjectAssignmentForm
                assignment={editingAssignment}
                onSuccess={() => {
                  setShowForm(false);
                  setEditingAssignment(undefined);
                  queryClient.invalidateQueries({ queryKey: ["/api/project-assignments"] });
                }}
              />
            </DialogContent>
          </Dialog>

          {/* Table Configuration Dialog */}
          <TableConfiguration
            isOpen={showConfigDialog}
            onOpenChange={setShowConfigDialog}
            tableId="project-assignments"
            availableColumns={[
              { id: 'title', label: 'Titolo' },
              { id: 'resource', label: 'Risorsa' },
              { id: 'project', label: 'Progetto' },
              { id: 'engagementType', label: 'Tipo' },
              { id: 'amount', label: 'Importo/Tariffa' },
              { id: 'status', label: 'Stato' },
              { id: 'dates', label: 'Date' },
            ]}
            editingLayout={editingLayout}
            onSave={(layoutData) => {
              updateLayout(layoutData);
              setShowConfigDialog(false);
            }}
            onCancel={() => setShowConfigDialog(false)}
          />

          {/* Single Delete Dialog */}
          <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Elimina Assegnazione</AlertDialogTitle>
                <AlertDialogDescription>
                  Sei sicuro di voler eliminare l'assegnazione "{editingAssignment?.title}"? 
                  Questa azione non può essere annullata.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Annulla</AlertDialogCancel>
                <AlertDialogAction onClick={confirmDelete}>Elimina</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          {/* Bulk Delete Dialog */}
          <AlertDialog open={showBulkDeleteDialog} onOpenChange={setShowBulkDeleteDialog}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Conferma Eliminazione Multipla</AlertDialogTitle>
                <AlertDialogDescription>
                  Sei sicuro di voler eliminare {selectedAssignments.length} assegnazioni selezionate? 
                  Questa azione non può essere annullata.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Annulla</AlertDialogCancel>
                <AlertDialogAction onClick={confirmBulkDelete}>
                  Elimina {selectedAssignments.length} Assegnazioni
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </main>
      </div>
    </div>
  );
}
