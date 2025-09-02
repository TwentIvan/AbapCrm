import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTableLayout } from "@/lib/user-preferences";
import Sidebar from "@/components/layout/sidebar";
import Header from "@/components/layout/header";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { LayoutManager } from "@/components/ui/layout-manager";
import { UniversalTable, createStandardColumns, TableColumn } from "@/components/ui/universal-table";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Building, Trash2, Globe, MapPin, Users, Mail } from "lucide-react";
import OrganizationForm from "@/components/forms/organization-form";

interface OrganizationWithDetails {
  id: string;
  name: string;
  description?: string;
  logoUrl?: string;
  website?: string;
  fiscalCode?: string;
  vatNumber?: string;
  address?: string;
  city?: string;
  postalCode?: string;
  country?: string;
  isActive: boolean;
  userRole: string;
  createdAt: string;
  updatedAt: string;
}

export default function OrganizationsPage() {
  const [selectedItems, setSelectedItems] = useState<OrganizationWithDetails[]>([]);
  const [editingItem, setEditingItem] = useState<OrganizationWithDetails | null>(null);
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
  } = useTableLayout('organizations');
  const viewMode = layout.viewMode;

  const { data: items = [], isLoading } = useQuery<OrganizationWithDetails[]>({
    queryKey: ["/api/organizations"],
    queryFn: async () => {
      const res = await fetch("/api/organizations", { credentials: "include" });
      if (!res.ok) throw new Error('Failed to fetch');
      return res.json();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/organizations/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/organizations"] });
      setShowDeleteDialog(false);
      setEditingItem(null);
      toast({ title: "Eliminato", description: "Organizzazione eliminata con successo" });
    }
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: async (items: OrganizationWithDetails[]) => {
      for (const item of items) {
        await apiRequest("DELETE", `/api/organizations/${item.id}`);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/organizations"] });
      setSelectedItems([]);
      setShowBulkDeleteDialog(false);
      toast({ title: "Eliminati", description: "Organizzazioni eliminate con successo" });
    }
  });

  const handleEdit = (item: OrganizationWithDetails) => {
    setEditingItem(item);
    setShowForm(true);
  };

  const handleAdd = () => {
    setEditingItem(null);
    setShowForm(true);
  };

  const handleSingleDelete = (item: OrganizationWithDetails) => {
    setEditingItem(item);
    setShowDeleteDialog(true);
  };

  const handleDelete = (items: OrganizationWithDetails[]) => {
    if (items.length === 0) return;
    setSelectedItems(items);
    setShowBulkDeleteDialog(true);
  };

  const confirmDelete = () => {
    if (editingItem) {
      deleteMutation.mutate(editingItem.id);
    }
  };

  const confirmBulkDelete = () => {
    bulkDeleteMutation.mutate(selectedItems);
  };

  const columns: TableColumn[] = [
    {
      key: "logoUrl",
      label: "Logo",
      sortable: false,
      searchable: false,
      render: (item: OrganizationWithDetails) => (
        <div className="w-8 h-8 flex items-center justify-center">
          {item.logoUrl ? (
            <img
              src={item.logoUrl}
              alt={`${item.name} logo`}
              className="w-8 h-8 rounded object-cover"
            />
          ) : (
            <Building className="h-5 w-5 text-muted-foreground" />
          )}
        </div>
      ),
    },
    createStandardColumns.text("name", "Nome"),
    {
      key: "description",
      label: "Descrizione",
      sortable: true,
      searchable: true,
      render: (item: OrganizationWithDetails) => (
        <div className="text-sm text-muted-foreground max-w-xs truncate">
          {item.description || "-"}
        </div>
      ),
    },
    {
      key: "website",
      label: "Website",
      sortable: true,
      searchable: true,
      render: (item: OrganizationWithDetails) => (
        item.website ? (
          <a 
            href={item.website} 
            target="_blank" 
            rel="noopener noreferrer"
            className="flex items-center text-blue-600 hover:text-blue-800"
          >
            <Globe className="h-4 w-4 mr-1" />
            <span className="text-sm truncate max-w-xs">
              {item.website.replace(/^https?:\/\//, '')}
            </span>
          </a>
        ) : (
          <span className="text-muted-foreground">-</span>
        )
      ),
    },
    {
      key: "city",
      label: "Luogo",
      sortable: true,
      searchable: true,
      render: (item: OrganizationWithDetails) => (
        <div className="flex items-center text-sm text-muted-foreground">
          <MapPin className="h-4 w-4 mr-1" />
          {item.city ? `${item.city}${item.country ? `, ${item.country}` : ''}` : '-'}
        </div>
      ),
    },
    {
      key: "userRole",
      label: "Ruolo",
      sortable: true,
      searchable: true,
      render: (item: OrganizationWithDetails) => (
        <div className="flex items-center text-sm">
          <Users className="h-4 w-4 mr-1 text-muted-foreground" />
          <span className="capitalize">{item.userRole}</span>
        </div>
      ),
    },
    {
      key: "isActive",
      label: "Stato",
      sortable: true,
      searchable: false,
      render: (item: OrganizationWithDetails) => (
        <div className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-semibold ${
          item.isActive 
            ? 'bg-green-100 text-green-800' 
            : 'bg-red-100 text-red-800'
        }`}>
          {item.isActive ? 'Attiva' : 'Inattiva'}
        </div>
      ),
    },
  ];

  return (
    <div className="flex h-screen">
      <Sidebar />
      <div className="flex-1 overflow-hidden">
        <Header 
          title="Organizzazioni"
          subtitle="Gestisci le tue organizzazioni e le relative informazioni"
          onNewClick={handleAdd}
        />
        <main className="p-6 space-y-6">
          <LayoutManager
            currentLayoutName={currentLayoutName}
            savedLayouts={savedLayouts}
            onLoadLayout={loadLayout}
            onRenameLayout={renameLayout}
            onDeleteLayout={deleteLayout}
            onEditLayout={(layoutToEdit) => {
              setEditingLayout(layoutToEdit);
              setShowConfigDialog(true);
            }}
          />

          <UniversalTable
            data={items}
            columns={columns}
            enableSelection={true}
            enableSearch={true}
            searchPlaceholder="Cerca organizzazioni..."
            onSelectionChange={(rows) => setSelectedItems(rows as OrganizationWithDetails[])}
            onRowClick={handleEdit}
            bulkActions={[
              {
                label: "Elimina Selezionate",
                icon: Trash2,
                variant: "destructive",
                onClick: () => handleDelete(selectedItems)
              }
            ]}
          />

          {/* Create/Edit Dialog */}
          <Dialog open={showForm} onOpenChange={setShowForm}>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>
                  {editingItem ? "Modifica Organizzazione" : "Nuova Organizzazione"}
                </DialogTitle>
                <DialogDescription>
                  {editingItem ? "Aggiorna" : "Aggiungi"} le informazioni dell'organizzazione
                </DialogDescription>
              </DialogHeader>
              <OrganizationForm
                organization={editingItem}
                onSuccess={() => {
                  setShowForm(false);
                  setEditingItem(null);
                  queryClient.invalidateQueries({ queryKey: ["/api/organizations"] });
                }}
                onCancel={() => {
                  setShowForm(false);
                  setEditingItem(null);
                }}
              />
            </DialogContent>
          </Dialog>

          {/* Single Delete Dialog */}
          <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Elimina Organizzazione</AlertDialogTitle>
                <AlertDialogDescription>
                  Sei sicuro di voler eliminare "{editingItem?.name}"? 
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
                  Sei sicuro di voler eliminare {selectedItems.length} organizzazioni selezionate? 
                  Questa azione non può essere annullata.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Annulla</AlertDialogCancel>
                <AlertDialogAction onClick={confirmBulkDelete}>
                  Elimina {selectedItems.length} Organizzazioni
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </main>
      </div>
    </div>
  );
}