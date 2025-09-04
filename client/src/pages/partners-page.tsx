import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, getQueryFn } from "@/lib/queryClient";
import { useTableLayout } from "@/lib/user-preferences";
import { useOrganization } from "@/hooks/use-organization";
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
import { TableConfiguration } from "@/components/ui/table-configuration";
import ImageContainer from "@/components/ui/image-container";
import { Building, Mail, Phone, MapPin, MoreHorizontal, Grid3X3, List, Edit, Trash2, History } from "lucide-react";
import { Partner } from "@shared/schema";
import AdvancedPartnerForm from "@/components/forms/advanced-partner-form";
import SimplePartnerForm from "@/components/forms/simple-partner-form";
import AuditHistory from "@/components/ui/audit-history";
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
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [selectedPartner, setSelectedPartner] = useState<Partner | null>(null);
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
  const viewMode = layout.viewMode;

  const { data: partners, isLoading } = useQuery<Partner[]>({
    queryKey: ["/api/partners"],
    queryFn: getQueryFn({ on401: "throw" }),
    enabled: !!currentOrganizationId,
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
          onNewClick={() => setShowCreateDialog(true)}
        />
        
        <div className="p-6">
          {/* Layout Management and View Toggle */}
          <div className="flex justify-between items-center mb-4">
            {/* Layout Manager */}
            <div className="flex items-center gap-4">
              <LayoutManager
                currentLayoutName={currentLayoutName}
                savedLayouts={savedLayouts}
                onLoadLayout={loadLayout}
                onRenameLayout={renameLayout}
                onDeleteLayout={deleteLayout}
              />
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => setShowConfigDialog(true)}
                data-testid="button-configure-columns"
              >
                <Edit className="h-4 w-4 mr-2" />
                Configura
              </Button>
            </div>

          </div>
          {isLoading ? (
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
              {partners?.map((partner) => (
                <Card key={partner.id} className="hover:shadow-lg transition-shadow" data-testid={`card-partner-${partner.id}`}>
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div className="flex items-center space-x-3">
                        {partner.logoUrl ? (
                          <ImageContainer
                            src={partner.logoUrl}
                            alt={`${partner.name} logo`}
                            fallbackType="logo"
                            size="md"
                            data-testid={`img-partner-logo-${partner.id}`}
                          />
                        ) : (
                          <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
                            <Building className="h-5 w-5 text-primary" />
                          </div>
                        )}
                        <div>
                          <CardTitle className="text-lg" data-testid={`text-partner-name-${partner.id}`}>
                            {partner.name}
                          </CardTitle>
                          <Badge 
                            className={typeColors[partner.type]}
                            data-testid={`badge-partner-type-${partner.id}`}
                          >
                            {typeLabels[partner.type]}
                          </Badge>
                        </div>
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" data-testid={`button-partner-menu-card-${partner.id}`}>
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem 
                            onClick={() => handleEdit(partner)}
                            data-testid={`menu-edit-partner-card-${partner.id}`}
                          >
                            <Edit className="mr-2 h-4 w-4" />
                            Modifica
                          </DropdownMenuItem>
                          <DropdownMenuItem 
                            onClick={() => handleDelete(partner)}
                            className="text-destructive"
                            data-testid={`menu-delete-partner-card-${partner.id}`}
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Elimina
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </CardHeader>
                  
                  <CardContent className="space-y-3">
                    {partner.company && (
                      <div className="flex items-center space-x-2 text-sm text-muted-foreground">
                        <Building className="h-4 w-4" />
                        <span data-testid={`text-partner-company-${partner.id}`}>{partner.company}</span>
                      </div>
                    )}
                    
                    {partner.position && (
                      <p className="text-sm text-muted-foreground" data-testid={`text-partner-position-${partner.id}`}>
                        {partner.position}
                      </p>
                    )}
                    
                    <div className="space-y-2">
                      {partner.email && (
                        <div className="flex items-center space-x-2 text-sm">
                          <Mail className="h-4 w-4 text-muted-foreground" />
                          <a 
                            href={`mailto:${partner.email}`}
                            className="text-primary hover:underline"
                            data-testid={`link-partner-email-${partner.id}`}
                          >
                            {partner.email}
                          </a>
                        </div>
                      )}
                      
                      {partner.phone && (
                        <div className="flex items-center space-x-2 text-sm">
                          <Phone className="h-4 w-4 text-muted-foreground" />
                          <a 
                            href={`tel:${partner.phone}`}
                            className="text-primary hover:underline"
                            data-testid={`link-partner-phone-${partner.id}`}
                          >
                            {partner.phone}
                          </a>
                        </div>
                      )}
                      
                      {partner.address && (
                        <div className="flex items-start space-x-2 text-sm text-muted-foreground">
                          <MapPin className="h-4 w-4 mt-0.5" />
                          <span data-testid={`text-partner-address-${partner.id}`}>{partner.address}</span>
                        </div>
                      )}
                    </div>
                    
                    {partner.fiscalCode && (
                      <div className="text-xs text-muted-foreground">
                        <span>CF: {partner.fiscalCode}</span>
                        {partner.vatNumber && <span className="ml-3">P.IVA: {partner.vatNumber}</span>}
                      </div>
                    )}
                    
                    {partner.notes && (
                      <div className="pt-2 border-t border-border">
                        <p className="text-xs text-muted-foreground line-clamp-2" data-testid={`text-partner-notes-${partner.id}`}>
                          {partner.notes}
                        </p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </main>
      
      {/* Create Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Crea Nuovo Partner</DialogTitle>
          </DialogHeader>
          <AdvancedPartnerForm onSuccess={() => setShowCreateDialog(false)} />
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Modifica Partner</DialogTitle>
            <DialogDescription>Aggiorna informazioni del partner</DialogDescription>
          </DialogHeader>
          
          {selectedPartner && (
            <Tabs defaultValue="details" className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="details" className="flex items-center space-x-2">
                  <Edit className="h-4 w-4" />
                  <span>Dettagli</span>
                </TabsTrigger>
                <TabsTrigger value="history" className="flex items-center space-x-2">
                  <History className="h-4 w-4" />
                  <span>Storico Modifiche</span>
                </TabsTrigger>
              </TabsList>
              
              <TabsContent value="details" className="mt-6">
                <AdvancedPartnerForm 
                  existingPartner={selectedPartner}
                  onSuccess={() => {
                    setShowEditDialog(false);
                    setSelectedPartner(null);
                  }} 
                />
              </TabsContent>
              
              <TabsContent value="history" className="mt-6">
                <AuditHistory 
                  tableName="partners" 
                  recordId={selectedPartner.id}
                  title="Storico Modifiche Partner"
                />
              </TabsContent>
            </Tabs>
          )}
        </DialogContent>
      </Dialog>

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
