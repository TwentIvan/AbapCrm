import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, getQueryFn } from "@/lib/queryClient";
import { useTableLayout } from "@/lib/user-preferences";
import { useOrganization } from "@/contexts/organization-context";
import { useEntityFieldMetadata, metadataToAvailableColumns } from "@/hooks/use-entity-field-metadata";
import Sidebar from "@/components/layout/sidebar";
import Header from "@/components/layout/header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { UniversalTable, createStandardColumns } from "@/components/ui/universal-table";
import { ListViewToolbar } from "@/components/ui/list-view-toolbar";
import { TableConfiguration } from "@/components/ui/table-configuration";
import { Mail, Server, History, Shield, CheckCircle, XCircle, Send } from "lucide-react";
import { EmailConfig } from "@shared/schema";
import AuditHistory from "@/components/ui/audit-history";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmailSendDialog } from "@/components/email-send-dialog";

const statusColors = {
  active: "bg-success/10 text-success",
  inactive: "bg-destructive/10 text-destructive",
  testing: "bg-warning/10 text-warning",
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

  const { data: fieldMetadata } = useEntityFieldMetadata("email-accounts");
  const availableColumns = fieldMetadata ? metadataToAvailableColumns(fieldMetadata) : [];

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

  // Define table columns for UniversalTable (senza colonna Actions)
  const columns = [
    {
      key: 'email',
      label: 'Email Account',
      sortable: true,
      searchable: true,
      render: (account: EmailConfig) => (
        <div className="font-medium flex items-center space-x-2" data-testid={`text-email-${account.id}`}>
          <Mail className="h-4 w-4 text-muted-foreground" />
          <span>{account.email}</span>
        </div>
      ),
    },
    {
      key: 'host',
      label: 'Server IMAP',
      sortable: true,
      searchable: true,
      render: (account: EmailConfig) => (
        <div className="flex items-center space-x-2" data-testid={`text-host-${account.id}`}>
          <Server className="h-4 w-4 text-muted-foreground" />
          <span>{account.host}:{account.port}</span>
        </div>
      ),
    },
    {
      key: 'isActive',
      label: 'Stato',
      sortable: true,
      render: (account: EmailConfig) => (
        <Badge variant={account.isActive ? 'default' : 'secondary'} data-testid={`badge-status-${account.id}`}>
          {account.isActive ? (
            <><CheckCircle className="h-3 w-3 mr-1" />Attivo</>
          ) : (
            <><XCircle className="h-3 w-3 mr-1" />Inattivo</>
          )}
        </Badge>
      ),
    },
    {
      key: 'isForwarder',
      label: 'Forwarding',
      sortable: true,
      render: (account: EmailConfig) => (
        <Badge variant={account.isForwarder ? 'outline' : 'secondary'} data-testid={`badge-forwarder-${account.id}`}>
          {account.isForwarder ? (
            <><Shield className="h-3 w-3 mr-1" />Abilitato</>
          ) : (
            <><XCircle className="h-3 w-3 mr-1" />Disabilitato</>
          )}
        </Badge>
      ),
    },
    {
      key: 'customSignature',
      label: 'Firma Personalizzata',
      sortable: true,
      render: (account: EmailConfig) => (
        <div className="max-w-[200px] truncate" data-testid={`text-signature-${account.id}`}>
          {account.customSignature || '-'}
        </div>
      ),
    },
    {
      key: 'folders',
      label: 'Cartelle',
      sortable: false,
      render: (account: EmailConfig) => 
        account.folders?.length > 0 ? account.folders.join(', ') : 'INBOX',
    },
    {
      key: 'tls',
      label: 'TLS',
      sortable: true,
      render: (account: EmailConfig) => account.tls ? 'Sì' : 'No',
    },
  ];

  // Apply layout configuration: filter visible columns and sort by position
  const visibleColumns = useMemo(() => {
    const getColumnKey = (col: any) => col.accessorKey || col.id || col.key;
    
    // If no layout configuration or empty columns config, show all columns
    if (!layout.columns || Object.keys(layout.columns).length === 0) {
      return columns;
    }
    
    // Filter and sort columns based on layout
    return columns
      .filter(col => {
        const key = getColumnKey(col);
        const config = layout.columns[key];
        return config?.visible !== false;
      })
      .sort((a, b) => {
        const posA = layout.columns[getColumnKey(a)]?.position ?? 999;
        const posB = layout.columns[getColumnKey(b)]?.position ?? 999;
        return posA - posB;
      });
  }, [columns, layout.columns]);

  const handleAdd = () => {
    setSelectedAccount(null);
    setShowCreateDialog(true);
  };

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-auto">
        <Header title="Account Email" subtitle="Gestisci gli account email per la ricezione e l'elaborazione dei messaggi" />

        <div
          className="p-6 rounded-t-lg min-h-full"
          style={{
            borderTop: '2px solid hsl(var(--brand) / 0.3)',
            borderLeft: '2px solid hsl(var(--brand) / 0.3)',
            borderRight: '2px solid hsl(var(--brand) / 0.3)'
          }}
        >
          <div className="max-w-full mx-auto">
            <div className="flex items-center gap-3">
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
                onDeleteSelected={() => setShowBulkDeleteDialog(true)}
                hasSelection={selectedAccounts.length > 0}
              />
              <Button onClick={() => setShowSendDialog(true)} data-testid="button-send-email" variant="outline">
                <Send className="mr-2 h-4 w-4" />
                Invia Email
              </Button>
            </div>

            {/* Main Content */}
            {isLoading ? (
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
              <UniversalTable
                data={emailAccounts || []}
                columns={visibleColumns}
                enableSelection={true}
                onSelectionChange={(rows) => setSelectedAccounts(rows as EmailConfig[])}
                onRowClick={handleEdit}
                emptyMessage="Nessun account email trovato"
              />
            )}
          </div>
        </div>

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
      </main>

      {/* Email Account Edit Dialog */}
      <EmailAccountEditDialog />
      
      {/* Table Configuration Dialog */}
      <TableConfiguration
        tableId="email-accounts"
        availableColumns={availableColumns.length > 0 ? availableColumns : [
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