import { useState } from "react";
import { useLocation } from "wouter";
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
import { DataTable, createBadgeColumn, createTextColumn } from "@/components/ui/data-table";
import { LayoutManager } from "@/components/ui/layout-manager";
import { LayoutControlBox } from "@/components/ui/layout-control-box";
import { TableConfiguration } from "@/components/ui/table-configuration";
import { Mail, Server, MoreHorizontal, Grid3X3, List, Edit, Trash2, History, Shield, CheckCircle, XCircle, Plus, Send } from "lucide-react";
import { EmailConfig } from "@shared/schema";
import AuditHistory from "@/components/ui/audit-history";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmailSendDialog } from "@/components/email-send-dialog";

const statusColors = {
  active: "bg-green-100 text-green-800",
  inactive: "bg-red-100 text-red-800",
  testing: "bg-yellow-100 text-yellow-800",
};

const statusLabels = {
  active: "Attivo",
  inactive: "Inattivo", 
  testing: "Test",
};

export default function EmailAccountsPage() {
  const [location] = useLocation();
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState<EmailConfig | null>(null);
  
  // Route detection for full-page mode
  const isFullPageMode = location.startsWith("/email-accounts/");
  const isCreateMode = location === "/email-accounts/new";
  const isEditMode = location.includes("/edit");
  const [selectedAccounts, setSelectedAccounts] = useState<EmailConfig[]>([]);
  const [showBulkDeleteDialog, setShowBulkDeleteDialog] = useState(false);
  const [editingLayout, setEditingLayout] = useState<any>(null);
  const [showConfigDialog, setShowConfigDialog] = useState(false);
  const [showSendDialog, setShowSendDialog] = useState(false);
  
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
  } = useTableLayout('email-accounts');

  const { data: emailAccounts, isLoading } = useQuery<EmailConfig[]>({
    queryKey: ["/api/email/configs"],
    queryFn: getQueryFn({ on401: "throw" }),
    enabled: !!currentOrganizationId, // Wait for organization context
    staleTime: 30 * 60 * 1000, // 30 minutes
    refetchOnMount: false, // Use cache if available
    refetchOnWindowFocus: false,
  });

  const deleteMutation = useMutation({
    mutationFn: async (accountId: string) => {
      const response = await fetch(`/api/email/configs/${accountId}`, {
        method: 'DELETE',
        credentials: 'include'
      });
      if (!response.ok) {
        throw new Error('Failed to delete email account');
      }
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/email/configs"] });
      toast({
        title: "Account email eliminato",
        description: "L'account email è stato eliminato con successo.",
      });
      setShowDeleteDialog(false);
      setSelectedAccount(null);
    },
    onError: () => {
      toast({
        title: "Errore",
        description: "Non è stato possibile eliminare l'account email.",
        variant: "destructive",
      });
    },
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: async (accountIds: string[]) => {
      const promises = accountIds.map(id => 
        fetch(`/api/email/configs/${id}`, {
          method: 'DELETE',
          credentials: 'include'
        })
      );
      const responses = await Promise.all(promises);
      
      // Check if all deletions were successful
      const failed = responses.filter(res => !res.ok);
      if (failed.length > 0) {
        throw new Error(`Failed to delete ${failed.length} account(s)`);
      }
      return responses;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/email/configs"] });
      toast({
        title: "Account email eliminati",
        description: `${selectedAccounts.length} account eliminati con successo.`,
      });
      setSelectedAccounts([]);
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

  const handleEdit = (account: EmailConfig) => {
    setSelectedAccount(account);
    setShowEditDialog(true);
  };
  
  // Handle full-page mode: when user navigates directly to /email-accounts/new or /email-accounts/:id/edit
  if (isFullPageMode) {
    return (
      <div>Full page mode placeholder</div>
    );
  }

  // Email Account Edit Dialog with Tabs (including AuditHistory)
  const EmailAccountEditDialog = () => {
    return (
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Modifica Account Email</DialogTitle>
            <DialogDescription>
              Configura le impostazioni per l'account {selectedAccount?.email}
            </DialogDescription>
          </DialogHeader>
          
          <Tabs defaultValue="details" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="details" className="flex items-center space-x-2">
                <Mail className="h-4 w-4" />
                <span>Configurazione</span>
              </TabsTrigger>
              <TabsTrigger value="history" className="flex items-center space-x-2">
                <History className="h-4 w-4" />
                <span>Storico Modifiche</span>
              </TabsTrigger>
            </TabsList>
            
            <TabsContent value="details" className="mt-6">
              <div className="space-y-4">
                <div className="text-sm text-muted-foreground">
                  Form di configurazione account email sarà implementato qui.
                  <br />Account: {selectedAccount?.email}
                  <br />Server: {selectedAccount?.host}:{selectedAccount?.port}
                  <br />Forwarding: {selectedAccount?.isForwarder ? 'Abilitato' : 'Disabilitato'}
                </div>
              </div>
            </TabsContent>
            
            <TabsContent value="history" className="mt-6">
              {selectedAccount && (
                <AuditHistory 
                  tableName="email_configs" 
                  recordId={selectedAccount.id}
                  title="Storico Modifiche Account Email"
                />
              )}
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>
    );
  };

  const handleDelete = (account: EmailConfig) => {
    setSelectedAccount(account);
    setShowDeleteDialog(true);
  };

  const confirmDelete = () => {
    if (selectedAccount) {
      deleteMutation.mutate(selectedAccount.id);
    }
  };

  const handleBulkDelete = () => {
    setShowBulkDeleteDialog(true);
  };

  const confirmBulkDelete = () => {
    const accountIds = selectedAccounts.map(p => p.id);
    bulkDeleteMutation.mutate(accountIds);
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
    { id: 'email', label: 'Email', type: 'text' as const },
    { id: 'imapHost', label: 'Server IMAP', type: 'text' as const },
    { id: 'isActive', label: 'Stato', type: 'select' as const, options: [
      { value: 'true', label: 'Attivo' },
      { value: 'false', label: 'Inattivo' },
    ]},
    { id: 'isForwarder', label: 'Forwarding', type: 'select' as const, options: [
      { value: 'true', label: 'Abilitato' },
      { value: 'false', label: 'Disabilitato' },
    ]},
  ];

  // Define aggregation columns (example for counting)
  const aggregationColumns = [
    { id: 'email', type: 'count' as const, label: 'Totale Account' },
  ];

  // Define table columns for list view
  const tableColumns = [
    {
      accessorKey: 'email',
      header: 'Email Account',
      cell: ({ row }: any) => (
        <div className="font-medium" data-testid={`text-email-${row.original.id}`}>
          <div className="flex items-center space-x-2">
            <Mail className="h-4 w-4 text-muted-foreground" />
            <span>{row.original.email}</span>
          </div>
        </div>
      ),
    },
    {
      accessorKey: 'imapHost',
      header: 'Server IMAP',
      cell: ({ row }: any) => (
        <div className="flex items-center space-x-2" data-testid={`text-imap-host-${row.original.id}`}>
          <Server className="h-4 w-4 text-muted-foreground" />
          <span>{row.original.imapHost}:{row.original.imapPort}</span>
        </div>
      ),
    },
    {
      accessorKey: 'isActive',
      header: 'Stato',
      cell: ({ row }: any) => (
        <Badge variant={row.original.isActive ? 'default' : 'secondary'} data-testid={`badge-status-${row.original.id}`}>
          {row.original.isActive ? (
            <><CheckCircle className="h-3 w-3 mr-1" />Attivo</>
          ) : (
            <><XCircle className="h-3 w-3 mr-1" />Inattivo</>
          )}
        </Badge>
      ),
    },
    {
      accessorKey: 'isForwarder',
      header: 'Forwarding',
      cell: ({ row }: any) => (
        <Badge variant={row.original.isForwarder ? 'outline' : 'secondary'} data-testid={`badge-forwarder-${row.original.id}`}>
          {row.original.isForwarder ? (
            <><Shield className="h-3 w-3 mr-1" />Abilitato</>
          ) : (
            <><XCircle className="h-3 w-3 mr-1" />Disabilitato</>
          )}
        </Badge>
      ),
    },
    {
      accessorKey: 'customSignature',
      header: 'Firma Personalizzata',
      cell: ({ row }: any) => (
        <div className="max-w-[200px] truncate" data-testid={`text-signature-${row.original.id}`}>
          {row.original.customSignature || '-'}
        </div>
      ),
    },
    {
      id: 'actions',
      header: 'Actions',
      cell: ({ row }: any) => {
        const account = row.original;
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="h-8 w-8 p-0" data-testid={`button-actions-${account.id}`}>
                <span className="sr-only">Open menu</span>
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => handleEdit(account)} data-testid={`button-edit-${account.id}`}>
                <Edit className="mr-2 h-4 w-4" />
                Modifica
              </DropdownMenuItem>
              <DropdownMenuItem 
                onClick={() => handleDelete(account)} 
                className="text-red-600"
                data-testid={`button-delete-${account.id}`}
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

  const handleAdd = () => {
    setSelectedAccount(null);
    setShowCreateDialog(true);
  };

  return (
    <div className="flex h-screen bg-background">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header title="Account Email" subtitle="Gestisci gli account email per la ricezione e l'elaborazione dei messaggi" />
        
        <main className="flex-1 overflow-x-hidden overflow-y-auto bg-muted/20 p-6">
          <div className="max-w-full mx-auto space-y-6">
            {/* Header */}
            <div className="flex justify-between items-center">
              <div>
                <h1 className="text-3xl font-bold tracking-tight" data-testid="text-page-title">Account Email</h1>
                <p className="text-muted-foreground">
                  Gestisci gli account email per la ricezione e l'elaborazione dei messaggi
                </p>
              </div>
              <div className="flex gap-2">
                <Button onClick={() => setShowSendDialog(true)} data-testid="button-send-email" variant="outline">
                  <Send className="mr-2 h-4 w-4" />
                  Invia Email
                </Button>
                <Button onClick={handleAdd} data-testid="button-add-email-account">
                  <Plus className="mr-2 h-4 w-4" />
                  Aggiungi Account
                </Button>
              </div>
            </div>
            
            {/* Layout Manager */}
            <div className="flex items-center justify-between">
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
                onConfigureTable={() => {
                  setEditingLayout(null);
                  setShowConfigDialog(true);
                }}
              />
            </div>

            {/* Main Content */}
            {isLoading && (!emailAccounts || emailAccounts.length === 0) ? (
              <div className="space-y-4">
                {[...Array(6)].map((_, i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : emailAccounts?.length === 0 ? (
              <div className="text-center py-12">
                <Mail className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium text-foreground mb-2">Nessun account email</h3>
                <p className="text-muted-foreground mb-4">Configura il tuo primo account email per iniziare</p>
                <Button onClick={handleAdd} data-testid="button-create-first-email-account">
                  Aggiungi Account Email
                </Button>
              </div>
            ) : (
              <DataTable
                key={`email-accounts-table-${currentLayoutName}-${JSON.stringify(layout.columns)}`}
                columns={tableColumns}
                data={emailAccounts || []}
                searchPlaceholder="Cerca account email..."
                onRowClick={handleEdit}
                enableSelection={true}
                onSelectionChange={setSelectedAccounts}
                bulkActions={bulkActions}
                tableId="email-accounts"
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
        
        {/* Single Delete Dialog */}
        <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Elimina Account Email</AlertDialogTitle>
              <AlertDialogDescription>
                Sei sicuro di voler eliminare l'account "{selectedAccount?.email}"? 
                Questa azione non può essere annullata.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel data-testid="button-cancel-delete">Annulla</AlertDialogCancel>
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

        {/* Bulk Delete Dialog */}
        <AlertDialog open={showBulkDeleteDialog} onOpenChange={setShowBulkDeleteDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Elimina Account Selezionati</AlertDialogTitle>
              <AlertDialogDescription>
                Sei sicuro di voler eliminare i {selectedAccounts.length} account selezionati? 
                Questa azione non può essere annullata.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel data-testid="button-cancel-bulk-delete">Annulla</AlertDialogCancel>
              <AlertDialogAction 
                onClick={confirmBulkDelete}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                disabled={bulkDeleteMutation.isPending}
                data-testid="button-confirm-bulk-delete"
              >
                {bulkDeleteMutation.isPending ? "Eliminando..." : `Elimina ${selectedAccounts.length} Account`}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
      
      {/* Email Account Edit Dialog */}
      <EmailAccountEditDialog />
      
      {/* Table Configuration Dialog */}
      <TableConfiguration
        tableId="email-accounts"
        availableColumns={[
          { id: 'email', label: 'Email Account' },
          { id: 'imapHost', label: 'Server IMAP' },
          { id: 'isActive', label: 'Stato' },
          { id: 'isForwarder', label: 'Forwarding' },
          { id: 'customSignature', label: 'Firma Personalizzata' }
        ]}
        editingLayout={editingLayout}
        isOpen={showConfigDialog}
        onOpenChange={setShowConfigDialog}
        onSave={saveLayoutAs}
        onCancel={() => setShowConfigDialog(false)}
      />

      {/* Email Send Dialog */}
      <EmailSendDialog
        open={showSendDialog}
        onOpenChange={setShowSendDialog}
      />
    </div>
  );
}