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
import { ListViewToolbar } from "@/components/ui/list-view-toolbar";
import { TableConfiguration } from "@/components/ui/table-configuration";
import ImageContainer from "@/components/ui/image-container";
import { BulkEditDialog, BulkEditField } from "@/components/dialogs/bulk-edit-dialog";
import { BulkCopyDialog } from "@/components/dialogs/bulk-copy-dialog";
import { Building, Mail, Phone, MapPin, MoreHorizontal, Grid3X3, List, Edit, Trash2, History, MessageSquare } from "lucide-react";
import { Partner } from "@shared/schema";
import AdvancedPartnerForm from "@/components/forms/advanced-partner-form";
import PartnerFormContainer from "@/components/forms/partner-form-container";
import SimplePartnerForm from "@/components/forms/simple-partner-form";
import AuditHistory from "@/components/ui/audit-history";
import { MessageHistory } from "@/components/ui/message-history";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RelationshipBadge } from "@/components/ui/relationship-badge";
import { RelationshipPreviewProvider } from "@/components/ui/relationship-preview-context";
import { useEntityRelationships } from "@/hooks/use-entity-relationships";

// Component to display Projects count for a partner
function PartnerProjectsCount({ partnerId, currentOrganizationId }: { partnerId: string; currentOrganizationId: string | null }) {
  const { data: relationships, isLoading } = useEntityRelationships("partners", partnerId);
  
  if (!currentOrganizationId || isLoading) {
    return <span className="text-sm text-muted-foreground">...</span>;
  }

  const count = relationships?.projects?.count || 0;
  if (count === 0) {
    return <span className="text-sm text-muted-foreground">-</span>;
  }

  return (
    <RelationshipBadge
      count={count}
      label="Progetti"
      items={relationships?.projects?.items || []}
      targetPath="/projects"
      filterParam="clientId"
      sourceId={partnerId}
    />
  );
}

// Component to display Contacts count for a partner
function PartnerContactsCount({ partnerId, currentOrganizationId }: { partnerId: string; currentOrganizationId: string | null }) {
  const { data: relationships, isLoading } = useEntityRelationships("partners", partnerId);
  
  if (!currentOrganizationId || isLoading) {
    return <span className="text-sm text-muted-foreground">...</span>;
  }

  const count = relationships?.contacts?.count || 0;
  if (count === 0) {
    return <span className="text-sm text-muted-foreground">-</span>;
  }

  return (
    <RelationshipBadge
      count={count}
      label="Contatti"
      items={relationships?.contacts?.items || []}
      targetPath="/contacts"
      filterParam="partnerId"
      sourceId={partnerId}
    />
  );
}

// Component to display Deals count for a partner
function PartnerDealsCount({ partnerId, currentOrganizationId }: { partnerId: string; currentOrganizationId: string | null }) {
  const { data: relationships, isLoading } = useEntityRelationships("partners", partnerId);
  
  if (!currentOrganizationId || isLoading) {
    return <span className="text-sm text-muted-foreground">...</span>;
  }

  const count = relationships?.deals?.count || 0;
  if (count === 0) {
    return <span className="text-sm text-muted-foreground">-</span>;
  }

  return (
    <RelationshipBadge
      count={count}
      label="Deals"
      items={relationships?.deals?.items || []}
      targetPath="/deals"
      filterParam="partnerId"
      sourceId={partnerId}
    />
  );
}

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

interface RelatedData {
  contacts: number;
  projects: number;
  deals: number;
  childPartners: number;
  hasRelations: boolean;
}

export default function PartnersPage() {
  const [location] = useLocation();
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showCascadeDialog, setShowCascadeDialog] = useState(false);
  const [cascadeRelatedData, setCascadeRelatedData] = useState<RelatedData | null>(null);
  const [selectedPartner, setSelectedPartner] = useState<Partner | null>(null);
  const [showLocationEditDialog, setShowLocationEditDialog] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState<Partner | null>(null);
  
  // Route detection for full-page mode
  const isFullPageMode = location.startsWith("/partners/");
  const isCreateMode = location === "/partners/new";
  const isEditMode = location.includes("/edit");
  const [selectedPartners, setSelectedPartners] = useState<Partner[]>([]);
  const [showBulkDeleteDialog, setShowBulkDeleteDialog] = useState(false);
  const [showBulkCascadeDialog, setShowBulkCascadeDialog] = useState(false);
  const [bulkCascadeData, setBulkCascadeData] = useState<{partnersWithRelations: Partner[], totalRelations: RelatedData}>({ partnersWithRelations: [], totalRelations: { contacts: 0, projects: 0, deals: 0, childPartners: 0, hasRelations: false }});
  const [showBulkEditDialog, setShowBulkEditDialog] = useState(false);
  const [showBulkCopyDialog, setShowBulkCopyDialog] = useState(false);
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
      await apiRequest("DELETE", `/api/partners/${partnerId}`);
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
    onError: async (error: any, partnerId: string) => {
      if (error?.message?.includes('409') || error?.message?.includes('needsCascade')) {
        setShowDeleteDialog(false);
        try {
          const response = await apiRequest("GET", `/api/partners/${partnerId}/related-data`);
          const relatedData = await response.json() as RelatedData;
          setCascadeRelatedData(relatedData);
          setShowCascadeDialog(true);
        } catch {
          toast({
            title: "Errore",
            description: "Non è stato possibile recuperare i dati collegati.",
            variant: "destructive",
          });
        }
      } else {
        toast({
          title: "Errore",
          description: "Non è stato possibile eliminare il partner.",
          variant: "destructive",
        });
      }
    },
  });

  const cascadeDeleteMutation = useMutation({
    mutationFn: async (partnerId: string) => {
      await apiRequest("DELETE", `/api/partners/${partnerId}?cascade=true`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/partners"] });
      toast({
        title: "Partner eliminato",
        description: "Il partner e tutti i dati collegati sono stati eliminati.",
      });
      setShowCascadeDialog(false);
      setSelectedPartner(null);
      setCascadeRelatedData(null);
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
      const results = await Promise.allSettled(
        partnerIds.map(id => apiRequest("DELETE", `/api/partners/${id}`))
      );
      const failures = results.filter(r => r.status === 'rejected');
      if (failures.length > 0) {
        throw { failures, partnerIds };
      }
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
    onError: async (error: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/partners"] });
      setShowBulkDeleteDialog(false);
      
      if (error?.failures?.length > 0) {
        const failedIds = error.partnerIds;
        const relatedDataPromises = failedIds.map((id: string) => 
          apiRequest("GET", `/api/partners/${id}/related-data`).catch(() => null)
        );
        const relatedDataResults = await Promise.all(relatedDataPromises);
        
        const totalRelations: RelatedData = { contacts: 0, projects: 0, deals: 0, childPartners: 0, hasRelations: false };
        const partnersWithRelations: Partner[] = [];
        
        relatedDataResults.forEach((data: RelatedData | null, idx: number) => {
          if (data?.hasRelations) {
            const partner = selectedPartners.find(p => p.id === failedIds[idx]);
            if (partner) partnersWithRelations.push(partner);
            totalRelations.contacts += data.contacts;
            totalRelations.projects += data.projects;
            totalRelations.deals += data.deals;
            totalRelations.childPartners += data.childPartners;
            totalRelations.hasRelations = true;
          }
        });
        
        if (totalRelations.hasRelations) {
          setBulkCascadeData({ partnersWithRelations, totalRelations });
          setShowBulkCascadeDialog(true);
        } else {
          toast({
            title: "Errore",
            description: "Non è stato possibile eliminare alcuni partner.",
            variant: "destructive",
          });
        }
      } else {
        toast({
          title: "Errore",
          description: "Non è stato possibile eliminare i partner.",
          variant: "destructive",
        });
      }
    },
  });

  const bulkCascadeDeleteMutation = useMutation({
    mutationFn: async (partnerIds: string[]) => {
      await Promise.all(
        partnerIds.map(id => apiRequest("DELETE", `/api/partners/${id}?cascade=true`))
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/partners"] });
      toast({
        title: "Partners eliminati",
        description: "Tutti i partner e i dati collegati sono stati eliminati.",
      });
      setSelectedPartners([]);
      setShowBulkCascadeDialog(false);
      setBulkCascadeData({ partnersWithRelations: [], totalRelations: { contacts: 0, projects: 0, deals: 0, childPartners: 0, hasRelations: false }});
    },
    onError: () => {
      toast({
        title: "Errore",
        description: "Non è stato possibile eliminare i partner.",
        variant: "destructive",
      });
    },
  });

  const bulkEditMutation = useMutation({
    mutationFn: async ({ partners, updates }: { partners: Partner[], updates: Record<string, any> }) => {
      await Promise.all(
        partners.map(partner => apiRequest("PUT", `/api/partners/${partner.id}`, updates))
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/partners"] });
      setSelectedPartners([]);
      setShowBulkEditDialog(false);
      toast({ title: "Modificati", description: "Partners modificati con successo" });
    }
  });

  const bulkCopyMutation = useMutation({
    mutationFn: async ({ partners, addSuffix, suffix }: { partners: Partner[], addSuffix: boolean, suffix: string }) => {
      await Promise.all(
        partners.map(partner => {
          const { id, createdAt, updatedAt, userId, organizationId, ...partnerData } = partner;
          const newPartner = {
            ...partnerData,
            name: addSuffix ? `${partner.name}${suffix}` : partner.name,
          };
          return apiRequest("POST", "/api/partners", newPartner);
        })
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/partners"] });
      setSelectedPartners([]);
      setShowBulkCopyDialog(false);
      toast({
        title: "Partner copiati",
        description: "I partner selezionati sono stati copiati con successo.",
      });
    },
  });

  const bulkEditFields: BulkEditField[] = [
    {
      key: "type",
      label: "Tipo",
      type: "select",
      options: [
        { value: "client", label: "Client" },
        { value: "vendor", label: "Vendor" },
        { value: "consultant", label: "Consultant" },
        { value: "other", label: "Other" },
      ],
    },
    {
      key: "company",
      label: "Azienda",
      type: "text",
      placeholder: "Nome azienda",
    },
    {
      key: "position",
      label: "Posizione",
      type: "text",
      placeholder: "Es: CEO, Manager",
    },
    {
      key: "country",
      label: "Paese",
      type: "text",
      placeholder: "Es: IT, US",
    },
  ];

  const handleBulkEditSave = (updates: Record<string, any>) => {
    bulkEditMutation.mutate({ partners: selectedPartners, updates });
  };

  const handleBulkCopy = ({ addSuffix, suffix }: { addSuffix: boolean; suffix: string }) => {
    bulkCopyMutation.mutate({ partners: selectedPartners, addSuffix, suffix });
  };

  const handleEdit = (partner: Partner) => {
    setSelectedPartner(partner);
    setShowEditDialog(true);
  };

  const handleEditLocation = (locationPartner: Partner) => {
    setSelectedLocation(locationPartner);
    setShowLocationEditDialog(true);
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
        onEditLocation={handleEditLocation}
      />
    );
  }

  const handleDelete = async (partner: Partner) => {
    setSelectedPartner(partner);
    try {
      const relatedData = await apiRequest("GET", `/api/partners/${partner.id}/related-data`);
      const data = await relatedData.json() as RelatedData;
      if (data.hasRelations) {
        setCascadeRelatedData(data);
        setShowCascadeDialog(true);
      } else {
        setShowDeleteDialog(true);
      }
    } catch {
      setShowDeleteDialog(true);
    }
  };

  const confirmDelete = () => {
    if (selectedPartner) {
      deleteMutation.mutate(selectedPartner.id);
    }
  };

  const handleBulkDelete = async () => {
    try {
      const relatedDataPromises = selectedPartners.map(p => 
        apiRequest("GET", `/api/partners/${p.id}/related-data`)
          .then(res => res.json())
          .catch(() => ({ contacts: 0, projects: 0, deals: 0, childPartners: 0, hasRelations: false }))
      );
      const relatedDataResults = await Promise.all(relatedDataPromises) as RelatedData[];
      
      const totalRelations: RelatedData = { contacts: 0, projects: 0, deals: 0, childPartners: 0, hasRelations: false };
      const partnersWithRelations: Partner[] = [];
      
      relatedDataResults.forEach((data, idx) => {
        if (data?.hasRelations) {
          partnersWithRelations.push(selectedPartners[idx]);
          totalRelations.contacts += data.contacts;
          totalRelations.projects += data.projects;
          totalRelations.deals += data.deals;
          totalRelations.childPartners += data.childPartners;
          totalRelations.hasRelations = true;
        }
      });
      
      if (totalRelations.hasRelations) {
        setBulkCascadeData({ partnersWithRelations, totalRelations });
        setShowBulkCascadeDialog(true);
      } else {
        setShowBulkDeleteDialog(true);
      }
    } catch {
      setShowBulkDeleteDialog(true);
    }
  };

  const confirmBulkDelete = () => {
    const partnerIds = selectedPartners.map(p => p.id);
    bulkDeleteMutation.mutate(partnerIds);
  };

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
        <button 
          type="button"
          className="font-medium text-primary hover:underline cursor-pointer bg-transparent border-none p-0 text-left" 
          data-testid={`text-partner-name-${row.original.id}`}
          onMouseUp={(e) => {
            console.log('[PartnersPage] Name mouseup:', row.original.name);
            e.stopPropagation();
            e.preventDefault();
            handleEdit(row.original);
          }}
        >
          {row.original.name}
        </button>
      ),
    },
    createBadgeColumn('type', 'Type', {
      client: 'default',
      vendor: 'secondary', 
      consultant: 'outline',
      other: 'destructive'
    }),
    {
      accessorKey: 'projects',
      header: 'Progetti',
      cell: ({ row }: any) => (
        <PartnerProjectsCount 
          partnerId={row.original.id} 
          currentOrganizationId={currentOrganizationId} 
        />
      ),
    },
    {
      accessorKey: 'contacts',
      header: 'Contatti',
      cell: ({ row }: any) => (
        <PartnerContactsCount 
          partnerId={row.original.id} 
          currentOrganizationId={currentOrganizationId} 
        />
      ),
    },
    {
      accessorKey: 'deals',
      header: 'Deals',
      cell: ({ row }: any) => (
        <PartnerDealsCount 
          partnerId={row.original.id} 
          currentOrganizationId={currentOrganizationId} 
        />
      ),
    },
    createTextColumn('company', 'Company', 30),
    createTextColumn('email', 'Email', 25),
    createTextColumn('phone', 'Phone', 15),
    createTextColumn('address', 'Address', 40),
    createTextColumn('fiscalCode', 'CF', 16),
    createTextColumn('vatNumber', 'P.IVA', 16),
    {
      id: 'actions',
      header: 'Azioni',
      cell: ({ row }: any) => {
        const partner = row.original;
        return (
          <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8" data-testid={`button-partner-menu-${partner.id}`}>
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
          </div>
        );
      },
    },
  ];

  return (
    <RelationshipPreviewProvider>
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-auto">
        <Header 
          title="Partners" 
          subtitle="Manage your clients, vendors and business contacts"
        />
        
        <div 
          className="p-6 rounded-t-lg min-h-full"
          style={{ 
            borderTop: '2px solid rgba(30, 64, 175, 0.3)',
            borderLeft: '2px solid rgba(30, 64, 175, 0.3)',
            borderRight: '2px solid rgba(30, 64, 175, 0.3)'
          }}
        >
          <ListViewToolbar
            currentLayoutName={currentLayoutName}
            savedLayouts={savedLayouts}
            onLoadLayout={loadLayout}
            onRenameLayout={renameLayout}
            onDeleteLayout={deleteLayout}
            onConfigureTable={() => setShowConfigDialog(true)}
            onCreateNew={() => setShowCreateDialog(true)}
            onCopySelected={() => setShowBulkCopyDialog(true)}
            onBulkEdit={() => setShowBulkEditDialog(true)}
            onDeleteSelected={handleBulkDelete}
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
              onRowClick={handleEdit}
              enableSelection={true}
              onSelectionChange={setSelectedPartners}
              tableId="partners"
              configurableColumns={false}
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
        onEditLocation={handleEditLocation}
      />

      {/* Operative Location Edit Dialog */}
      <PartnerFormContainer
        open={showLocationEditDialog}
        onOpenChange={(open) => {
          if (!open) {
            setShowLocationEditDialog(false);
            setSelectedLocation(null);
          }
        }}
        editingPartner={selectedLocation}
        onSuccess={() => {
          setShowLocationEditDialog(false);
          setSelectedLocation(null);
          queryClient.invalidateQueries({ queryKey: ["/api/partners"] });
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

      {/* Single Partner Cascade Delete Dialog */}
      <AlertDialog open={showCascadeDialog} onOpenChange={setShowCascadeDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-destructive">Attenzione: Dati Collegati</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>Il partner <strong>{selectedPartner?.name}</strong> ha i seguenti dati collegati:</p>
                <ul className="list-disc list-inside space-y-1 text-sm">
                  {cascadeRelatedData?.contacts ? <li><strong>{cascadeRelatedData.contacts}</strong> contatti</li> : null}
                  {cascadeRelatedData?.projects ? <li><strong>{cascadeRelatedData.projects}</strong> progetti (verranno scollegati)</li> : null}
                  {cascadeRelatedData?.deals ? <li><strong>{cascadeRelatedData.deals}</strong> trattative (verranno scollegate)</li> : null}
                  {cascadeRelatedData?.childPartners ? <li><strong>{cascadeRelatedData.childPartners}</strong> sedi operative</li> : null}
                </ul>
                <p className="text-destructive font-medium">
                  Procedere con l'eliminazione cancellerà anche tutti i dati collegati.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => { setShowCascadeDialog(false); setCascadeRelatedData(null); }} data-testid="button-cancel-cascade">
              Annulla
            </AlertDialogCancel>
            <AlertDialogAction 
              onClick={() => selectedPartner && cascadeDeleteMutation.mutate(selectedPartner.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={cascadeDeleteMutation.isPending}
              data-testid="button-confirm-cascade"
            >
              {cascadeDeleteMutation.isPending ? "Eliminando..." : "Elimina Tutto"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk Cascade Delete Dialog */}
      <AlertDialog open={showBulkCascadeDialog} onOpenChange={setShowBulkCascadeDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-destructive">Attenzione: Dati Collegati</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p><strong>{bulkCascadeData.partnersWithRelations.length}</strong> partner hanno dati collegati:</p>
                <ul className="list-disc list-inside space-y-1 text-sm">
                  {bulkCascadeData.totalRelations.contacts ? <li><strong>{bulkCascadeData.totalRelations.contacts}</strong> contatti totali</li> : null}
                  {bulkCascadeData.totalRelations.projects ? <li><strong>{bulkCascadeData.totalRelations.projects}</strong> progetti (verranno scollegati)</li> : null}
                  {bulkCascadeData.totalRelations.deals ? <li><strong>{bulkCascadeData.totalRelations.deals}</strong> trattative (verranno scollegate)</li> : null}
                  {bulkCascadeData.totalRelations.childPartners ? <li><strong>{bulkCascadeData.totalRelations.childPartners}</strong> sedi operative</li> : null}
                </ul>
                <p className="text-destructive font-medium">
                  Procedere con l'eliminazione cancellerà anche tutti i dati collegati.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => { setShowBulkCascadeDialog(false); setBulkCascadeData({ partnersWithRelations: [], totalRelations: { contacts: 0, projects: 0, deals: 0, childPartners: 0, hasRelations: false }}); }} data-testid="button-cancel-bulk-cascade">
              Annulla
            </AlertDialogCancel>
            <AlertDialogAction 
              onClick={() => bulkCascadeDeleteMutation.mutate(bulkCascadeData.partnersWithRelations.map(p => p.id))}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={bulkCascadeDeleteMutation.isPending}
              data-testid="button-confirm-bulk-cascade"
            >
              {bulkCascadeDeleteMutation.isPending ? "Eliminando..." : `Elimina ${bulkCascadeData.partnersWithRelations.length} Partner e Dati`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk Copy Dialog */}
      <BulkCopyDialog
        open={showBulkCopyDialog}
        onOpenChange={setShowBulkCopyDialog}
        title="Copia Partner"
        description="Crea copie dei partner"
        selectedCount={selectedPartners.length}
        onCopy={handleBulkCopy}
        isPending={bulkCopyMutation.isPending}
      />

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

      {/* Bulk Edit Dialog */}
      <BulkEditDialog
        open={showBulkEditDialog}
        onOpenChange={setShowBulkEditDialog}
        title="Modifica Massiva Partners"
        description="Seleziona i campi da modificare e imposta i nuovi valori per"
        fields={bulkEditFields}
        selectedCount={selectedPartners.length}
        onSave={handleBulkEditSave}
        isPending={bulkEditMutation.isPending}
      />
    </div>
    </RelationshipPreviewProvider>
  );
}
