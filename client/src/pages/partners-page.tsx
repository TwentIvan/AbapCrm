import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, getQueryFn } from "@/lib/queryClient";
import { useTableLayout } from "@/lib/user-preferences";
import { useOrganization } from "@/contexts/organization-context";
import Sidebar from "@/components/layout/sidebar";
import Header from "@/components/layout/header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { DataTable, createImageColumn, createBadgeColumn, createTextColumn } from "@/components/ui/data-table";
import { LayoutManager } from "@/components/ui/layout-manager";
import { ListViewToolbar } from "@/components/ui/list-view-toolbar";
import { TableConfiguration } from "@/components/ui/table-configuration";
import ImageContainer from "@/components/ui/image-container";
import { Building, Mail, Phone, MapPin, MoreHorizontal, Grid3X3, List, Edit, Trash2, History, MessageSquare } from "lucide-react";
import { Partner } from "@shared/schema";
import AdvancedPartnerForm from "@/components/forms/advanced-partner-form";
import PartnerFormContainer from "@/components/forms/partner-form-container";
import SimplePartnerForm from "@/components/forms/simple-partner-form";
import AuditHistory from "@/components/ui/audit-history";
import { MessageHistory } from "@/components/ui/message-history";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const typeColors = {
  client: "bg-blue-100 text-blue-800",
  vendor: "bg-green-100 text-green-800",
  consultant: "bg-purple-100 text-purple-800",
  other: "bg-gray-100 text-gray-800",
};

const typeLabels = {
  client: "Client",
  vendor: "Vendor", 
  consultant: "Consultant",
  other: "Other",
};

export default function PartnersPage() {
  const [location] = useLocation();
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [selectedPartner, setSelectedPartner] = useState<Partner | null>(null);
  
  // Route detection for full-page mode
  const isFullPageMode = location.startsWith("/partners/");
  const isCreateMode = location === "/partners/new";
  const isEditMode = location.includes("/edit");
  const [selectedPartners, setSelectedPartners] = useState<Partner[]>([]);
  const [showBulkDeleteDialog, setShowBulkDeleteDialog] = useState(false);
  const [editingLayout, setEditingLayout] = useState<any>(null);
  const [showConfigDialog, setShowConfigDialog] = useState(false);
  
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { currentOrganizationId } = useOrganization();

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
  } = useTableLayout('partners');

  const { data: partners, isLoading } = useQuery<Partner[]>({
    queryKey: ["/api/partners"],
    queryFn: getQueryFn({ on401: "throw" }),
    enabled: !!currentOrganizationId, // Wait for organization context
    staleTime: 30 * 60 * 1000, // 30 minutes
    refetchOnMount: false, // Use cache if available
    refetchOnWindowFocus: false,
  });

  const deleteMutation = useMutation({
    mutationFn: async (partnerId: string) => {
      const response = await fetch(`/api/partners/${partnerId}`, {
        method: 'DELETE',
        credentials: 'include'
      });
      if (!response.ok) {
        throw new Error('Failed to delete partner');
      }
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/partners"] });
      toast({
        title: "Partner eliminato",
        description: "Il partner è stato eliminato con successo.",
      });
      setShowDeleteDialog(false);
      setSelectedPartner(null);
    },
    onError: () => {
      toast({
        title: "Errore",
        description: "Non è stato possibile eliminare il partner.",
        variant: "destructive",
      });
    },
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: async (partnerIds: string[]) => {
      const promises = partnerIds.map(id => 
        fetch(`/api/partners/${id}`, {
          method: 'DELETE',
          credentials: 'include'
        })
      );
      const responses = await Promise.all(promises);
      
      // Check if all deletions were successful
      const failed = responses.filter(res => !res.ok);
      if (failed.length > 0) {
        throw new Error(`Failed to delete ${failed.length} partner(s)`);
      }
      return responses;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/partners"] });
      toast({
        title: "Partners eliminati",
        description: `${selectedPartners.length} partner eliminati con successo.`,
      });
      setSelectedPartners([]);
      setShowBulkDeleteDialog(false);
    },
    onError: (error: Error) => {
      toast({
        title: "Errore",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleEdit = (partner: Partner) => {
    setSelectedPartner(partner);
    setShowEditDialog(true);
  };
  
  // Handle full-page mode: when user navigates directly to /partners/new or /partners/:id/edit
  if (isFullPageMode) {
    return (
      <PartnerFormContainer
        open={false} // Not used in full-page mode
        onOpenChange={() => {}} // Not used in full-page mode
        editingPartner={selectedPartner}
        onSuccess={() => {
          setSelectedPartner(null);
        }}
      />
    );
  }

  const handleDelete = (partner: Partner) => {
    setSelectedPartner(partner);
    setShowDeleteDialog(true);
  };

  const confirmDelete = () => {
    if (selectedPartner) {
      deleteMutation.mutate(selectedPartner.id);
    }
  };

  const handleBulkDelete = () => {
    setShowBulkDeleteDialog(true);
  };

  const confirmBulkDelete = () => {
    const partnerIds = selectedPartners.map(p => p.id);
    bulkDeleteMutation.mutate(partnerIds);
  };

  const bulkActions = [
    {
      label: 'Elimina Selezionati',
      icon: Trash2,
      onClick: handleBulkDelete,
      variant: 'destructive' as const,
    },
  ];

  // Define filter columns for advanced filtering
  const filterColumns = [
    { id: 'name', label: 'Nome', type: 'text' as const },
    { id: 'type', label: 'Tipo', type: 'select' as const, options: [
      { value: 'client', label: 'Client' },
      { value: 'vendor', label: 'Vendor' },
      { value: 'consultant', label: 'Consultant' },
      { value: 'other', label: 'Other' },
    ]},
    { id: 'company', label: 'Azienda', type: 'text' as const },
    { id: 'email', label: 'Email', type: 'text' as const },
    { id: 'phone', label: 'Telefono', type: 'text' as const },
    { id: 'address', label: 'Indirizzo', type: 'text' as const },
    { id: 'fiscalCode', label: 'Codice Fiscale', type: 'text' as const },
    { id: 'vatNumber', label: 'P.IVA', type: 'text' as const },
  ];

  // Define aggregation columns (example for counting)
  const aggregationColumns = [
    { id: 'name', type: 'count' as const, label: 'Totale Partners' },
  ];

  // Define table columns for list view
  const tableColumns = [
    createImageColumn('logoUrl', 'Logo', 'logo'),
    {
      accessorKey: 'name',
      header: 'Name',
      cell: ({ row }: any) => (
        <div className="font-medium" data-testid={`text-partner-name-${row.original.id}`}>
          {row.original.name}
        </div>
      ),
    },
    createBadgeColumn('type', 'Type', {
      client: 'default',
      vendor: 'secondary', 
      consultant: 'outline',
      other: 'destructive'
    }),
    createTextColumn('company', 'Company', 30),
    createTextColumn('email', 'Email', 25),
    createTextColumn('phone', 'Phone', 15),
    createTextColumn('address', 'Address', 40),
    createTextColumn('fiscalCode', 'CF', 16),
    createTextColumn('vatNumber', 'P.IVA', 16),
    {
      id: 'actions',
      header: 'Actions',
      cell: ({ row }: any) => {
        const partner = row.original;
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" data-testid={`button-partner-menu-${partner.id}`}>
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem 
                onClick={() => handleEdit(partner)}
                data-testid={`menu-edit-partner-${partner.id}`}
              >
                <Edit className="mr-2 h-4 w-4" />
                Modifica
              </DropdownMenuItem>
              <DropdownMenuItem 
                onClick={() => handleDelete(partner)}
                className="text-destructive"
                data-testid={`menu-delete-partner-${partner.id}`}
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

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-auto">
        <Header 
          title="Partners" 
          subtitle="Manage your clients, vendors and business contacts"
        />
        
        <div className="p-6">
          <ListViewToolbar
            currentLayoutName={currentLayoutName}
            savedLayouts={savedLayouts}
            onLoadLayout={loadLayout}
            onRenameLayout={renameLayout}
            onDeleteLayout={deleteLayout}
            onConfigureTable={() => setShowConfigDialog(true)}
            onCreateNew={() => setShowCreateDialog(true)}
            onDeleteSelected={() => setShowBulkDeleteDialog(true)}
            hasSelection={selectedPartners.length > 0}
          />
          {isLoading && (!partners || partners.length === 0) ? (
            <div className="space-y-4">
              {[...Array(6)].map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : partners?.length === 0 ? (
            <div className="text-center py-12">
              <Building className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium text-foreground mb-2">No partners yet</h3>
              <p className="text-muted-foreground mb-4">Add your first client or business contact to get started</p>
              <Button onClick={() => setShowCreateDialog(true)} data-testid="button-create-first-partner">
                Add Partner
              </Button>
            </div>
          ) : (
            <DataTable
              key={`partners-table-${currentLayoutName}-${JSON.stringify(layout.columns)}`}
              columns={tableColumns}
              data={partners || []}
              searchPlaceholder="Search partners..."
              onRowClick={handleEdit}
              enableSelection={true}
              onSelectionChange={setSelectedPartners}
              bulkActions={bulkActions}
              tableId="partners"
              configurableColumns={true}
              enableAdvancedFilters={true}
              filterColumns={filterColumns}
              enableAggregation={true}
              aggregationColumns={aggregationColumns}
              enableColumnReordering={true}
              enableClipboardCopy={true}
              editingLayout={editingLayout}
            />
          )}
        </div>
      </main>
      
      {/* Form Container - supports both dialog and full-page modes */}
      <PartnerFormContainer
        open={showCreateDialog || showEditDialog}
        onOpenChange={(open) => {
          if (!open) {
            setShowCreateDialog(false);
            setShowEditDialog(false);
            setSelectedPartner(null);
          }
        }}
        editingPartner={selectedPartner}
        onSuccess={() => {
          setShowCreateDialog(false);
          setShowEditDialog(false);
          setSelectedPartner(null);
        }}
      />

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Conferma Eliminazione</AlertDialogTitle>
            <AlertDialogDescription>
              Sei sicuro di voler eliminare "{selectedPartner?.name}"? 
              Questa azione non può essere annullata.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">
              Annulla
            </AlertDialogCancel>
            <AlertDialogAction 
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteMutation.isPending}
              data-testid="button-confirm-delete"
            >
              {deleteMutation.isPending ? "Eliminando..." : "Elimina"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk Delete Confirmation Dialog */}
      <AlertDialog open={showBulkDeleteDialog} onOpenChange={setShowBulkDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Conferma Eliminazione Multipla</AlertDialogTitle>
            <AlertDialogDescription>
              Sei sicuro di voler eliminare {selectedPartners.length} partner selezionati? 
              Questa azione non può essere annullata.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-bulk-delete">
              Annulla
            </AlertDialogCancel>
            <AlertDialogAction 
              onClick={confirmBulkDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={bulkDeleteMutation.isPending}
              data-testid="button-confirm-bulk-delete"
            >
              {bulkDeleteMutation.isPending ? "Eliminando..." : `Elimina ${selectedPartners.length} Partner`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {/* Table Configuration Dialog */}
      <TableConfiguration
        isOpen={showConfigDialog}
        onOpenChange={setShowConfigDialog}
        tableId="partners"
        availableColumns={[
          { id: 'logoUrl', label: 'Logo' },
          { id: 'name', label: 'Nome' },
          { id: 'type', label: 'Tipo' },
          { id: 'company', label: 'Azienda' },
          { id: 'email', label: 'Email' },
          { id: 'phone', label: 'Telefono' },
          { id: 'address', label: 'Indirizzo' },
          { id: 'fiscalCode', label: 'Codice Fiscale' },
          { id: 'vatNumber', label: 'Partita IVA' },
        ]}
        editingLayout={editingLayout}
        onSave={(layoutData) => {
          updateLayout(layoutData);
          setShowConfigDialog(false);
        }}
        onCancel={() => setShowConfigDialog(false)}
      />
    </div>
  );
}
