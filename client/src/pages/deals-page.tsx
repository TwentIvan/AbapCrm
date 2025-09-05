import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, getQueryFn } from "@/lib/queryClient";
import { useOrganization } from "@/hooks/use-organization";
import { useTableLayout } from "@/lib/user-preferences";
import Sidebar from "@/components/layout/sidebar";
import Header from "@/components/layout/header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { UniversalTable, createStandardColumns } from "@/components/ui/universal-table";
import { LayoutManager } from "@/components/ui/layout-manager";
import { TableConfiguration } from "@/components/ui/table-configuration";
import { Handshake, DollarSign, Calendar, TrendingUp, MoreHorizontal, Grid3X3, List, Edit, Trash2, History } from "lucide-react";
import { Deal } from "@shared/schema";
import DealForm from "@/components/forms/deal-form";
import AuditHistory from "@/components/ui/audit-history";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const stageColors = {
  prospecting: "bg-blue-100 text-blue-800",
  proposal: "bg-yellow-100 text-yellow-800",
  negotiation: "bg-orange-100 text-orange-800", 
  closing: "bg-purple-100 text-purple-800",
  won: "bg-green-100 text-green-800",
  lost: "bg-red-100 text-red-800",
};

const stageLabels = {
  prospecting: "Prospecting",
  proposal: "Proposal",
  negotiation: "Negotiation",
  closing: "Closing",
  won: "Won",
  lost: "Lost",
};

export default function DealsPage() {
  const [selectedDeals, setSelectedDeals] = useState<Deal[]>([]);
  const [editingDeal, setEditingDeal] = useState<Deal | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showBulkDeleteDialog, setShowBulkDeleteDialog] = useState(false);
  const [showConfigDialog, setShowConfigDialog] = useState(false);
  const [editingLayout, setEditingLayout] = useState<any>(null);
  
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
  } = useTableLayout('deals');
  const viewMode = layout.viewMode;

  const { data: deals = [], isLoading } = useQuery<Deal[]>({
    queryKey: ["/api/deals"],
    queryFn: getQueryFn({ on401: "throw" }),
    staleTime: 30 * 60 * 1000, // 30 minutes
    refetchOnMount: false, // Use cache if available
    refetchOnWindowFocus: false,
  });

  const deleteMutation = useMutation({
    mutationFn: async (dealId: string) => {
      await apiRequest("DELETE", `/api/deals/${dealId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/deals"] });
      setShowDeleteDialog(false);
      setEditingDeal(null);
      toast({
        title: "Deal eliminato",
        description: "Il deal è stato eliminato con successo.",
      });
    },
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: async (deals: Deal[]) => {
      for (const deal of deals) {
        await apiRequest("DELETE", `/api/deals/${deal.id}`);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/deals"] });
      setSelectedDeals([]);
      setShowBulkDeleteDialog(false);
      toast({
        title: "Deal eliminati",
        description: "I deal selezionati sono stati eliminati con successo.",
      });
    },
  });

  const handleEdit = (deal: Deal) => {
    setEditingDeal(deal);
    setShowForm(true);
  };

  const handleAdd = () => {
    setEditingDeal(null);
    setShowForm(true);
  };

  const handleSingleDelete = (deal: Deal) => {
    setEditingDeal(deal);
    setShowDeleteDialog(true);
  };

  const handleDelete = (deals: Deal[]) => {
    if (deals.length === 0) return;
    setSelectedDeals(deals);
    setShowBulkDeleteDialog(true);
  };

  const confirmDelete = () => {
    if (editingDeal) {
      deleteMutation.mutate(editingDeal.id);
    }
  };

  const confirmBulkDelete = () => {
    bulkDeleteMutation.mutate(selectedDeals);
  };

  const activeDeals = deals?.filter(deal => !["won", "lost"].includes(deal.stage));
  const closedDeals = deals?.filter(deal => ["won", "lost"].includes(deal.stage));

  const totalValue = activeDeals?.reduce((sum, deal) => sum + parseFloat(deal.value), 0) || 0;
  const wonValue = closedDeals?.filter(deal => deal.stage === "won")
    .reduce((sum, deal) => sum + parseFloat(deal.value), 0) || 0;

  const formatValue = (value: string | null) => {
    if (!value) return "N/A";
    const amount = parseFloat(value);
    return `€${amount.toLocaleString()}`;
  };

  const formatDate = (date: Date | string | null) => {
    if (!date) return "N/A";
    return new Date(date).toLocaleDateString("it-IT");
  };

  // Define filter columns for advanced filtering
  const filterColumns = [
    { id: 'title', label: 'Titolo', type: 'text' as const },
    { id: 'stage', label: 'Stage', type: 'select' as const, options: [
      { value: 'prospecting', label: 'Prospecting' },
      { value: 'proposal', label: 'Proposal' },
      { value: 'negotiation', label: 'Negotiation' },
      { value: 'closing', label: 'Closing' },
      { value: 'won', label: 'Won' },
      { value: 'lost', label: 'Lost' },
    ]},
    { id: 'value', label: 'Valore', type: 'number' as const },
    { id: 'company', label: 'Azienda', type: 'text' as const },
    { id: 'contactPerson', label: 'Contatto', type: 'text' as const },
    { id: 'closingDate', label: 'Data Chiusura', type: 'date' as const },
  ];

  // Define aggregation columns 
  const aggregationColumns = [
    { id: 'title', type: 'count' as const, label: 'Totale Deals' },
    { id: 'value', type: 'sum' as const, label: 'Valore Totale' },
    { id: 'value', type: 'avg' as const, label: 'Valore Medio' },
  ];

  const columns = [
    createStandardColumns.text("title", "Titolo"),
    createStandardColumns.badge("stage", "Stage", stageColors),
    {
      key: "value",
      label: "Valore", 
      sortable: true,
      searchable: false,
      render: (deal: Deal) => formatValue(deal.value)
    },
    createStandardColumns.text("company", "Azienda"),
    createStandardColumns.text("contactPerson", "Contatto"),
    {
      key: "actualCloseDate",
      label: "Data Chiusura", 
      sortable: true,
      searchable: false,
      render: (deal: Deal) => formatDate(deal.actualCloseDate)
    },
    {
      key: "actions",
      label: "Azioni", 
      sortable: false,
      searchable: false,
      render: (deal: Deal) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" data-testid={`button-deal-menu-${deal.id}`}>
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem 
              onClick={() => handleEdit(deal)}
              data-testid={`menu-edit-deal-${deal.id}`}
            >
              <Edit className="mr-2 h-4 w-4" />
              Modifica
            </DropdownMenuItem>
            <DropdownMenuItem 
              onClick={() => handleSingleDelete(deal)}
              className="text-destructive"
              data-testid={`menu-delete-deal-${deal.id}`}
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
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-auto">
        <Header 
          title="Deal" 
          subtitle="Gestisci pipeline vendite e opportunità"
          onNewClick={handleAdd}
        />
        
        <div className="p-6 space-y-6">
          {/* Pipeline Summary */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Active Pipeline</p>
                    <p className="text-2xl font-bold text-foreground" data-testid="text-active-pipeline-value">
                      €{totalValue.toLocaleString()}
                    </p>
                  </div>
                  <TrendingUp className="h-8 w-8 text-blue-600" />
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Active Deals</p>
                    <p className="text-2xl font-bold text-foreground" data-testid="text-active-deals-count">
                      {activeDeals?.length || 0}
                    </p>
                  </div>
                  <Handshake className="h-8 w-8 text-green-600" />
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Won This Month</p>
                    <p className="text-2xl font-bold text-foreground" data-testid="text-won-value">
                      €{wonValue.toLocaleString()}
                    </p>
                  </div>
                  <DollarSign className="h-8 w-8 text-purple-600" />
                </div>
              </CardContent>
            </Card>
          </div>

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
          ) : deals?.length === 0 ? (
            <div className="text-center py-12">
              <Handshake className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium text-foreground mb-2">No deals yet</h3>
              <p className="text-muted-foreground mb-4">Create your first deal to start tracking opportunities</p>
              <Button onClick={handleAdd} data-testid="button-create-first-deal">
                Create Deal
              </Button>
            </div>
          ) : (
            <UniversalTable
              data={deals}
              columns={columns}
              enableSelection={true}
              enableSearch={true}
              searchPlaceholder="Cerca deal..."
              onSelectionChange={(rows) => setSelectedDeals(rows as Deal[])}
              onRowClick={handleEdit}
              bulkActions={[
                {
                  label: "Elimina Selezionati",
                  icon: Trash2,
                  variant: "destructive",
                  onClick: () => handleDelete(selectedDeals)
                }
              ]}
            />
          )}
            <div>
              {activeDeals && activeDeals.length > 0 && (
                <div className="mb-8">
                  <h3 className="text-lg font-semibold text-foreground mb-4">Active Deals</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {activeDeals.map((deal) => (
                      <Card key={deal.id} className="hover:shadow-lg transition-shadow" data-testid={`card-deal-${deal.id}`}>
                        <CardHeader>
                          <div className="flex items-start justify-between">
                            <div>
                              <CardTitle className="text-lg" data-testid={`text-deal-title-${deal.id}`}>
                                {deal.title}
                              </CardTitle>
                              <Badge 
                                className={stageColors[deal.stage]}
                                data-testid={`badge-deal-stage-${deal.id}`}
                              >
                                {stageLabels[deal.stage]}
                              </Badge>
                            </div>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" data-testid={`button-deal-menu-${deal.id}`}>
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem 
                                  onClick={() => handleEdit(deal)}
                                  data-testid={`menu-edit-deal-${deal.id}`}
                                >
                                  <Edit className="mr-2 h-4 w-4" />
                                  Modifica
                                </DropdownMenuItem>
                                <DropdownMenuItem 
                                  onClick={() => handleSingleDelete(deal)}
                                  className="text-destructive"
                                  data-testid={`menu-delete-deal-${deal.id}`}
                                >
                                  <Trash2 className="mr-2 h-4 w-4" />
                                  Elimina
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </CardHeader>
                        
                        <CardContent className="space-y-3">
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-muted-foreground">Value</span>
                            <span className="font-semibold text-foreground" data-testid={`text-deal-value-${deal.id}`}>
                              €{parseFloat(deal.value).toLocaleString()}
                            </span>
                          </div>
                          
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-muted-foreground">Probability</span>
                            <span className="font-medium text-foreground" data-testid={`text-deal-probability-${deal.id}`}>
                              {deal.probability}%
                            </span>
                          </div>
                          
                          {deal.expectedCloseDate && (
                            <div className="flex items-center space-x-1 text-sm text-muted-foreground">
                              <Calendar className="h-4 w-4" />
                              <span data-testid={`text-deal-close-date-${deal.id}`}>
                                Expected: {new Date(deal.expectedCloseDate).toLocaleDateString()}
                              </span>
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>
              )}
              
              {closedDeals && closedDeals.length > 0 && (
                <div>
                  <h3 className="text-lg font-semibold text-foreground mb-4">Closed Deals</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {closedDeals.map((deal) => (
                      <Card key={deal.id} className="opacity-75" data-testid={`card-deal-${deal.id}`}>
                        <CardHeader>
                          <div className="flex items-start justify-between">
                            <div>
                              <CardTitle className="text-lg" data-testid={`text-deal-title-${deal.id}`}>
                                {deal.title}
                              </CardTitle>
                              <Badge 
                                className={stageColors[deal.stage]}
                                data-testid={`badge-deal-stage-${deal.id}`}
                              >
                                {stageLabels[deal.stage]}
                              </Badge>
                            </div>
                          </div>
                        </CardHeader>
                        
                        <CardContent className="space-y-3">
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-muted-foreground">Value</span>
                            <span className="font-semibold text-foreground" data-testid={`text-deal-value-${deal.id}`}>
                              €{parseFloat(deal.value).toLocaleString()}
                            </span>
                          </div>
                          
                          {deal.actualCloseDate && (
                            <div className="flex items-center space-x-1 text-sm text-muted-foreground">
                              <Calendar className="h-4 w-4" />
                              <span data-testid={`text-deal-actual-close-date-${deal.id}`}>
                                Closed: {new Date(deal.actualCloseDate).toLocaleDateString()}
                              </span>
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </main>
      {/* Table Configuration Dialog */}
      <TableConfiguration
        isOpen={showConfigDialog}
        onOpenChange={setShowConfigDialog}
        tableId="deals"
        availableColumns={[
          { id: 'title', label: 'Titolo' },
          { id: 'stage', label: 'Stage' },
          { id: 'value', label: 'Valore' },
          { id: 'company', label: 'Azienda' },
          { id: 'contactPerson', label: 'Contatto' },
          { id: 'actualCloseDate', label: 'Data Chiusura' },
        ]}
        editingLayout={editingLayout}
        onSave={(layoutData) => {
          updateLayout(layoutData);
          setShowConfigDialog(false);
        }}
        onCancel={() => setShowConfigDialog(false)}
      />

      {/* Edit Deal Dialog */}
      {showForm && (
        <Dialog open={showForm} onOpenChange={(open) => {
          if (!open) {
            setShowForm(false);
            setEditingDeal(null);
          }
        }}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden">
            <DialogHeader>
              <DialogTitle>
                {editingDeal ? "Modifica Deal" : "Nuovo Deal"}
              </DialogTitle>
              <DialogDescription>
                {editingDeal ? "Modifica i dettagli del deal selezionato" : "Crea un nuovo deal"}
              </DialogDescription>
            </DialogHeader>
            
            <Tabs defaultValue="details" className="w-full h-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="details" data-testid="tab-deal-details">
                  <span>Dettagli</span>
                </TabsTrigger>
                {editingDeal && (
                  <TabsTrigger value="history" data-testid="tab-deal-history">
                    <History className="h-4 w-4 mr-2" />
                    <span>Storico Modifiche</span>
                  </TabsTrigger>
                )}
              </TabsList>
              
              <TabsContent value="details" className="mt-6">
                <DealForm 
                  deal={editingDeal} 
                  onSuccess={() => {
                    setShowForm(false);
                    setEditingDeal(null);
                    queryClient.invalidateQueries({ queryKey: ["/api/deals"] });
                  }}
                />
              </TabsContent>
              
              {editingDeal && (
                <TabsContent value="history" className="mt-6">
                  <AuditHistory 
                    tableName="deals" 
                    recordId={editingDeal.id}
                    title="Storico Modifiche Deal"
                  />
                </TabsContent>
              )}
            </Tabs>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
