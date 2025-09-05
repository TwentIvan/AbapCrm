import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Sidebar from "@/components/layout/sidebar";
import Header from "@/components/layout/header";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { getQueryFn, queryClient, apiRequest } from "@/lib/queryClient";
import { Building, Trash2, Users, History, Edit, User } from "lucide-react";
import OrganizationForm from "@/components/forms/organization-form";
import AuditHistory from "@/components/ui/audit-history";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

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

export default function OrganizationsPage() {
  const [selectedItems, setSelectedItems] = useState<OrganizationWithDetails[]>([]);
  const [editingItem, setEditingItem] = useState<OrganizationWithDetails | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showBulkDeleteDialog, setShowBulkDeleteDialog] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: items = [], isLoading } = useQuery<OrganizationWithDetails[]>({
    queryKey: ["/api/organizations"],
    queryFn: getQueryFn({ on401: "throw" }),
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // Debug log for isActive values
  if (items && items.length > 0) {
    console.log("DEBUG Organizations data:", items);
    console.log("DEBUG First org isActive type:", typeof items[0].isActive, "value:", items[0].isActive);
  }

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
        <main className="p-6 space-y-6">
          {/* Cards Grid View Only */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {items.map((item) => (
              <Card key={item.id} className="cursor-pointer hover:shadow-lg transition-shadow" onClick={() => handleEdit(item)}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <div className="w-10 h-10 rounded-full bg-blue-500 flex items-center justify-center text-white text-lg font-semibold">
                        {item.name.charAt(0).toUpperCase()}
                      </div>
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
                        item.isActive === true
                          ? 'bg-green-100 text-green-800' 
                          : 'bg-red-100 text-red-800'
                      }`}>
                        {item.isActive !== false ? 'Attiva' : 'Inattiva'}
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Partner:</span>
                      <div className="flex items-center">
                        <User className="h-4 w-4 mr-1 text-muted-foreground" />
                        <span className="text-sm">{item.partnerId ? "Associato" : "Nessuno"}</span>
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
                  <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="details" className="flex items-center space-x-2">
                      <Building className="h-4 w-4" />
                      <span>Dettagli</span>
                    </TabsTrigger>
                    <TabsTrigger value="history" className="flex items-center space-x-2">
                      <History className="h-4 w-4" />
                      <span>Storico Modifiche</span>
                    </TabsTrigger>
                  </TabsList>
                  
                  <TabsContent value="details" className="mt-6">
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
                    queryClient.invalidateQueries({ queryKey: ["/api/organizations"] });
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
        </main>
      </div>
    </div>
  );
}