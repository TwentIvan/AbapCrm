import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
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
import { Handshake, DollarSign, Calendar, TrendingUp, MoreHorizontal, Grid3X3, List, Edit, Trash2 } from "lucide-react";
import { Deal } from "@shared/schema";
import DealForm from "@/components/forms/deal-form";

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
    queryFn: async () => {
      const res = await fetch("/api/deals", { credentials: "include" });
      if (!res.ok) throw new Error('Failed to fetch deals');
      return res.json();
    },
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
      key: "closingDate",
      label: "Data Chiusura", 
      sortable: true,
      searchable: false,
      render: (deal: Deal) => formatDate(deal.closingDate)
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
            <LayoutManager
              currentLayoutName={currentLayoutName}
              savedLayouts={savedLayouts}
              onLoadLayout={loadLayout}
              onRenameLayout={renameLayout}
              onDeleteLayout={deleteLayout}
              onEditLayout={(layout) => {
                setEditingLayout(layout);
                setShowConfigDialog(true);
              }}
            />

            {/* View Toggle */}
            <div className="flex bg-muted rounded-lg p-1">
              <Button
                variant={viewMode === 'cards' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => updateLayout({ viewMode: 'cards' })}
                data-testid="button-view-cards"
              >
                <Grid3X3 className="mr-2 h-4 w-4" />
                Cards
              </Button>
              <Button
                variant={viewMode === 'list' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => updateLayout({ viewMode: 'list' })}
                data-testid="button-view-list"
              >
                <List className="mr-2 h-4 w-4" />
                List
              </Button>
            </div>
          </div>

          {isLoading ? (
            viewMode === 'cards' ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {[...Array(6)].map((_, i) => (
                  <Card key={i}>
                    <CardHeader>
                      <Skeleton className="h-4 w-3/4" />
                      <Skeleton className="h-3 w-1/2" />
                    </CardHeader>
                    <CardContent>
                      <Skeleton className="h-16 w-full" />
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <div className="space-y-4">
                {[...Array(6)].map((_, i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            )
          ) : deals?.length === 0 ? (
            <div className="text-center py-12">
              <Handshake className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium text-foreground mb-2">No deals yet</h3>
              <p className="text-muted-foreground mb-4">Create your first deal to start tracking opportunities</p>
              <Button onClick={() => setShowCreateDialog(true)} data-testid="button-create-first-deal">
                Create Deal
              </Button>
            </div>
          ) : viewMode === 'list' ? (
            <DataTable
              key={`deals-${currentLayoutName}`}
              columns={tableColumns}
              data={deals || []}
              searchPlaceholder="Search deals..."
              onRowClick={handleEditDeal}
              enableSelection={true}
              onSelectionChange={setSelectedDeals}
              tableId="deals"
              enableAdvancedFilters={true}
              filterColumns={filterColumns}
              enableAggregation={true}
              aggregationColumns={aggregationColumns}
              enableColumnReordering={true}
            />
          ) : (
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
                                  onClick={() => handleEditDeal(deal)}
                                  data-testid={`menu-edit-deal-${deal.id}`}
                                >
                                  <Edit className="mr-2 h-4 w-4" />
                                  Modifica
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
      
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Create New Deal</DialogTitle>
          </DialogHeader>
          <DealForm onSuccess={() => setShowCreateDialog(false)} />
        </DialogContent>
      </Dialog>

      <Dialog open={showEditDialog} onOpenChange={handleCloseEditDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit Deal</DialogTitle>
          </DialogHeader>
          {editingDeal && (
            <DealForm 
              deal={editingDeal} 
              onSuccess={handleCloseEditDialog} 
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Table Configuration Dialog */}
      <TableConfiguration
        tableId="deals"
        availableColumns={[
          { id: 'title', label: 'Title' },
          { id: 'stage', label: 'Stage' },
          { id: 'value', label: 'Value' },
          { id: 'partnerId', label: 'Partner' },
          { id: 'probability', label: 'Probability' },
          { id: 'expectedCloseDate', label: 'Expected Close Date' },
        ]}
        open={showConfigDialog}
        onOpenChange={setShowConfigDialog}
        editingLayout={editingLayout}
        onSave={(updatedLayout) => {
          updateExistingLayout(updatedLayout);
          setEditingLayout(null);
          setShowConfigDialog(false);
        }}
        onCancel={() => {
          setEditingLayout(null);
          setShowConfigDialog(false);
        }}
      />
    </div>
  );
}
