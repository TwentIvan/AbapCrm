import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Sidebar from "@/components/layout/sidebar";
import Header from "@/components/layout/header";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { getQueryFn, apiRequest } from "@/lib/queryClient";
import { useStandardCrud } from "@/lib/cache-manager";
import { Building, Trash2, Users, History, Edit, User, Network } from "lucide-react";
import { Plus } from "lucide-react";
import OrganizationForm from "@/components/forms/organization-form";
import AuditHistory from "@/components/ui/audit-history";
import BusinessScenariosManager from "@/components/business-scenarios-manager";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BulkEditDialog, BulkEditField } from "@/components/dialogs/bulk-edit-dialog";
import { BulkCopyDialog } from "@/components/dialogs/bulk-copy-dialog";

interface OrganizationWithDetails {
  id: string;
  name: string;
  isActive: boolean;
  theme: string;
  partnerId?: string | null;
  userRole: string;
  createdAt: string;
  updatedAt: string;
}

interface Partner {
  id: string;
  name: string;
  logoUrl?: string | null;
}

export default function OrganizationsPage() {
  const [selectedItems, setSelectedItems] = useState<OrganizationWithDetails[]>([]);
  const [editingItem, setEditingItem] = useState<OrganizationWithDetails | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showBulkDeleteDialog, setShowBulkDeleteDialog] = useState(false);
  const [showBulkEditDialog, setShowBulkEditDialog] = useState(false);
  const [showBulkCopyDialog, setShowBulkCopyDialog] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { onDeleteSuccess } = useStandardCrud("organizations");

  const { data: items, isLoading, isError } = useQuery<OrganizationWithDetails[]>({
    queryKey: ["/api/organizations"],
    queryFn: getQueryFn({ on401: "throw" }),
    staleTime: 5 * 60 * 1000, // Cache per 5 minuti - invalidato da operazioni CRUD
    refetchOnMount: false, // Non serve refetch automatico - gestito da cache manager
    refetchOnWindowFocus: false, // Non serve refetch automatico
  });

  // Query per caricare i dati dei partner (incluso logo)
  const { data: partners } = useQuery<Partner[]>({
    queryKey: ["/api/partners"],
    queryFn: getQueryFn({ on401: "throw" }),
    staleTime: 5 * 60 * 1000,
  });

  // Crea un lookup map per accesso veloce ai partner per id
  const partnerMap = new Map<string, Partner>();
  if (partners) {
    partners.forEach(p => partnerMap.set(p.id, p));
  }

  // Ensure items is always an array, never null
  const safeItems = items || [];


  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/organizations/${id}`),
    onSuccess: async () => {
      await onDeleteSuccess();
      setShowDeleteDialog(false);
      setEditingItem(null);
      toast({ title: "Eliminato", description: "Organizzazione eliminata con successo" });
    },
    onError: async (error: any) => {
      console.error("Delete error:", error);
      // Anche in caso di errore, sincronizza la cache
      await onDeleteSuccess();
      setShowDeleteDialog(false);
      setEditingItem(null);
      toast({ 
        title: "Lista aggiornata", 
        description: "I dati sono stati sincronizzati con il database"
      });
    }
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: async (items: OrganizationWithDetails[]) => {
      for (const item of items) {
        await apiRequest("DELETE", `/api/organizations/${item.id}`);
      }
    },
    onSuccess: async () => {
      await onDeleteSuccess();
      setSelectedItems([]);
      setShowBulkDeleteDialog(false);
      toast({ title: "Eliminati", description: "Organizzazioni eliminate con successo" });
    }
  });

  const bulkEditMutation = useMutation({
    mutationFn: async ({ items, updates }: { items: OrganizationWithDetails[], updates: Record<string, any> }) => {
      await Promise.all(
        items.map(item => apiRequest("PUT", `/api/organizations/${item.id}`, updates))
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/organizations"] });
      setSelectedItems([]);
      setShowBulkEditDialog(false);
      toast({ title: "Modificati", description: "Organizzazioni modificate con successo" });
    }
  });

  const bulkCopyMutation = useMutation({
    mutationFn: async ({ items, addSuffix, suffix }: { items: OrganizationWithDetails[], addSuffix: boolean, suffix: string }) => {
      await Promise.all(
        items.map(item => {
          const { id, createdAt, updatedAt, userRole, ...itemData } = item;
          const newItem = {
            ...itemData,
            name: addSuffix ? `${item.name}${suffix}` : item.name,
          };
          return apiRequest("POST", "/api/organizations", newItem);
        })
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/organizations"] });
      setSelectedItems([]);
      setShowBulkCopyDialog(false);
      toast({
        title: "Organizzazioni copiate",
        description: "Le organizzazioni selezionate sono state copiate con successo.",
      });
    },
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
    // Filter out Personal organizations (cannot be deleted)
    const deletableItems = items.filter(item => !isPersonalOrg(item));
    if (deletableItems.length === 0) {
      toast({ 
        title: "Impossibile eliminare", 
        description: "L'organizzazione Personal non può essere eliminata",
        variant: "destructive"
      });
      return;
    }
    setSelectedItems(deletableItems);
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

  const bulkEditFields: BulkEditField[] = [
    {
      key: "isActive",
      label: "Stato",
      type: "select",
      options: [
        { value: "true", label: "Attiva" },
        { value: "false", label: "Inattiva" },
      ],
    },
    {
      key: "theme",
      label: "Tema",
      type: "select",
      options: [
        { value: "blue", label: "Blu" },
        { value: "green", label: "Verde" },
        { value: "purple", label: "Viola" },
        { value: "orange", label: "Arancione" },
        { value: "red", label: "Rosso" },
        { value: "pink", label: "Rosa" },
        { value: "yellow", label: "Giallo" },
        { value: "teal", label: "Teal" },
        { value: "indigo", label: "Indaco" },
        { value: "gray", label: "Grigio" },
      ],
    },
  ];

  const handleBulkEditSave = (updates: Record<string, any>) => {
    const processedUpdates = { ...updates };
    if (updates.isActive !== undefined) {
      processedUpdates.isActive = updates.isActive === "true";
    }
    bulkEditMutation.mutate({ items: selectedItems, updates: processedUpdates });
  };

  const handleBulkCopy = ({ addSuffix, suffix }: { addSuffix: boolean; suffix: string }) => {
    bulkCopyMutation.mutate({ items: selectedItems, addSuffix, suffix });
  };

  // Helper functions for theme
  const getThemeColor = (theme: string) => {
    const themeColors: { [key: string]: string } = {
      blue: "hsl(221.2, 83.2%, 53.3%)",
      green: "hsl(142.1, 76.2%, 36.3%)",
      purple: "hsl(262.1, 83.3%, 57.8%)",
      orange: "hsl(24.6, 95%, 53.1%)",
      red: "hsl(0, 72.2%, 50.6%)",
      pink: "hsl(330, 81%, 60%)",
      yellow: "hsl(45, 93%, 55%)",
      teal: "hsl(178, 68%, 42%)",
      indigo: "hsl(239, 84%, 67%)",
      gray: "hsl(220, 13%, 46%)",
    };
    return themeColors[theme] || themeColors.blue;
  };

  const getThemeLabel = (theme: string) => {
    const themeLabels: { [key: string]: string } = {
      blue: "Blu",
      green: "Verde", 
      purple: "Viola",
      orange: "Arancione",
      red: "Rosso",
      pink: "Rosa",
      yellow: "Giallo",
      teal: "Teal",
      indigo: "Indaco",
      gray: "Grigio",
    };
    return themeLabels[theme] || "Blu";
  };

  // Check if organization is Personal (cannot be deleted)
  const isPersonalOrg = (org: OrganizationWithDetails) => {
    return org.name === "Personal";
  };

  // Cards view only - no table columns needed

  return (
    <div className="flex h-screen">
      <Sidebar />
      <div className="flex-1 overflow-hidden">
        <Header 
          title="Organizzazioni"
          subtitle="Gestisci le tue organizzazioni e le relative informazioni"
          onNewClick={handleAdd}
        />
        <main 
          className="p-6 space-y-6 rounded-t-lg min-h-full"
          style={{ 
            borderTop: '2px solid rgba(30, 64, 175, 0.3)',
            borderLeft: '2px solid rgba(30, 64, 175, 0.3)',
            borderRight: '2px solid rgba(30, 64, 175, 0.3)'
          }}
        >
          {/* Header con Crea nuova a sinistra */}
          <div className="flex justify-start items-center">
            <Button onClick={handleAdd} data-testid="button-add-organization">
              <Plus className="h-4 w-4 mr-2" />
              Nuova Organizzazione
            </Button>
          </div>

          {/* Cards Grid View Only */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {safeItems.map((item) => (
              <Card key={item.id} className="cursor-pointer hover:shadow-lg transition-shadow" onClick={() => handleEdit(item)}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      {item.partnerId && partnerMap.get(item.partnerId)?.logoUrl ? (
                        <img 
                          src={partnerMap.get(item.partnerId)!.logoUrl!} 
                          alt={partnerMap.get(item.partnerId)!.name}
                          className="w-10 h-10 rounded-lg object-cover"
                          data-testid={`img-org-badge-${item.id}`}
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-lg bg-blue-500 flex items-center justify-center text-white text-lg font-semibold">
                          {item.name.charAt(0).toUpperCase()}
                        </div>
                      )}
                      <CardTitle className="text-lg">{item.name}</CardTitle>
                    </div>
                    <div className="flex space-x-2">
                      <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); handleEdit(item); }}>
                        <Edit className="h-4 w-4" />
                      </Button>
                      {!isPersonalOrg(item) && (
                        <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); handleDelete([item]); }}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Tema:</span>
                      <div className="flex items-center">
                        <div 
                          className="w-4 h-4 rounded-full mr-2 border border-gray-300"
                          style={{ backgroundColor: getThemeColor(item.theme) }}
                        />
                        <span className="text-sm capitalize">{getThemeLabel(item.theme)}</span>
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Stato:</span>
                      <div className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-semibold ${
                        item.isActive !== false
                          ? 'bg-green-100 text-green-800' 
                          : 'bg-red-100 text-red-800'
                      }`}>
                        {item.isActive !== false ? 'Attiva' : 'Inattiva'}
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Partner:</span>
                      <div className="flex items-center">
                        {item.partnerId && partnerMap.get(item.partnerId) ? (
                          <>
                            {partnerMap.get(item.partnerId)?.logoUrl ? (
                              <img 
                                src={partnerMap.get(item.partnerId)!.logoUrl!} 
                                alt={partnerMap.get(item.partnerId)!.name}
                                className="h-6 w-6 rounded-full object-cover mr-2"
                                data-testid={`img-partner-logo-${item.id}`}
                              />
                            ) : (
                              <User className="h-4 w-4 mr-1 text-muted-foreground" />
                            )}
                            <span className="text-sm">{partnerMap.get(item.partnerId)!.name}</span>
                          </>
                        ) : (
                          <>
                            <User className="h-4 w-4 mr-1 text-muted-foreground" />
                            <span className="text-sm">Nessuno</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Create/Edit Dialog */}
          <Dialog open={showForm} onOpenChange={setShowForm}>
            <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>
                  {editingItem ? "Modifica Organizzazione" : "Nuova Organizzazione"}
                </DialogTitle>
                <DialogDescription>
                  {editingItem ? "Aggiorna" : "Aggiungi"} le informazioni dell'organizzazione
                </DialogDescription>
              </DialogHeader>
              
              {editingItem ? (
                <Tabs defaultValue="details" className="w-full">
                  <TabsList className="grid w-full grid-cols-3">
                    <TabsTrigger value="details" className="flex items-center space-x-2">
                      <Building className="h-4 w-4" />
                      <span>Dettagli</span>
                    </TabsTrigger>
                    <TabsTrigger value="scenarios" className="flex items-center space-x-2">
                      <Network className="h-4 w-4" />
                      <span>Scenari</span>
                    </TabsTrigger>
                    <TabsTrigger value="history" className="flex items-center space-x-2">
                      <History className="h-4 w-4" />
                      <span>Storico</span>
                    </TabsTrigger>
                  </TabsList>
                  
                  <TabsContent value="details" className="mt-6">
                    <OrganizationForm
                      organization={editingItem}
                      onSuccess={() => {
                        setShowForm(false);
                        setEditingItem(null);
                      }}
                      onCancel={() => {
                        setShowForm(false);
                        setEditingItem(null);
                      }}
                    />
                  </TabsContent>
                  
                  <TabsContent value="scenarios" className="mt-6">
                    <BusinessScenariosManager 
                      organizationId={editingItem.id}
                      organizationName={editingItem.name}
                    />
                  </TabsContent>
                  
                  <TabsContent value="history" className="mt-6">
                    <AuditHistory 
                      tableName="organizations" 
                      recordId={editingItem.id}
                      title="Storico Modifiche Organizzazione"
                    />
                  </TabsContent>
                </Tabs>
              ) : (
                <OrganizationForm
                  organization={editingItem}
                  onSuccess={() => {
                    setShowForm(false);
                    setEditingItem(null);
                  }}
                  onCancel={() => {
                    setShowForm(false);
                    setEditingItem(null);
                  }}
                />
              )}
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

          {/* Bulk Copy Dialog */}
          <BulkCopyDialog
            open={showBulkCopyDialog}
            onOpenChange={setShowBulkCopyDialog}
            title="Copia Organizzazioni"
            description="Crea copie delle organizzazioni"
            selectedCount={selectedItems.length}
            onCopy={handleBulkCopy}
            isPending={bulkCopyMutation.isPending}
          />

          {/* Bulk Edit Dialog */}
          <BulkEditDialog
            open={showBulkEditDialog}
            onOpenChange={setShowBulkEditDialog}
            title="Modifica Multipla Organizzazioni"
            description={`Modifica ${selectedItems.length} organizzazioni selezionate`}
            fields={bulkEditFields}
            selectedCount={selectedItems.length}
            onSave={handleBulkEditSave}
            isPending={bulkEditMutation.isPending}
          />
        </main>
      </div>
    </div>
  );
}