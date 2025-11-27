import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, getQueryFn } from "@/lib/queryClient";
import { useTableLayout } from "@/lib/user-preferences";
import { useOrganization } from "@/contexts/organization-context";
import Sidebar from "@/components/layout/sidebar";
import Header from "@/components/layout/header";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { DataTable, createTextColumn } from "@/components/ui/data-table";
import { ListViewToolbar } from "@/components/ui/list-view-toolbar";
import { TableConfiguration } from "@/components/ui/table-configuration";
import { Contact as ContactIcon, Mail, Phone, Building, MoreHorizontal, Edit, Trash2, User } from "lucide-react";
import { Contact, Partner } from "@shared/schema";
import ContactForm from "@/components/forms/contact-form";
import { BulkEditDialog, BulkEditField } from "@/components/dialogs/bulk-edit-dialog";
import { BulkCopyDialog } from "@/components/dialogs/bulk-copy-dialog";
import { useEntityFieldMetadata, metadataToAvailableColumns } from "@/hooks/use-entity-field-metadata";

export default function ContactsPage() {
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [selectedContacts, setSelectedContacts] = useState<Contact[]>([]);
  const [showBulkDeleteDialog, setShowBulkDeleteDialog] = useState(false);
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
  } = useTableLayout('contacts');

  const { data: contacts, isLoading } = useQuery<Contact[]>({
    queryKey: ["/api/contacts"],
    queryFn: getQueryFn({ on401: "throw" }),
    enabled: !!currentOrganizationId,
    staleTime: 30 * 60 * 1000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });

  const { data: partners = [] } = useQuery<Partner[]>({
    queryKey: ["/api/partners"],
    queryFn: getQueryFn({ on401: "throw" }),
    enabled: !!currentOrganizationId,
    staleTime: 30 * 60 * 1000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });

  const { data: fieldMetadata } = useEntityFieldMetadata("contacts");
  const availableColumns = fieldMetadata ? metadataToAvailableColumns(fieldMetadata) : [];

  // URL filtering for partnerId
  const urlParams = new URLSearchParams(window.location.search);
  const partnerIdFilter = urlParams.get('partnerId');
  const filteredContacts = partnerIdFilter 
    ? contacts?.filter(c => c.partnerId === partnerIdFilter) || []
    : contacts || [];

  const deleteMutation = useMutation({
    mutationFn: async (contactId: string) => {
      const response = await apiRequest("DELETE", `/api/contacts/${contactId}`);
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/contacts"] });
      toast({
        title: "Contatto eliminato",
        description: "Il contatto è stato eliminato con successo.",
      });
      setShowDeleteDialog(false);
      setSelectedContact(null);
    },
    onError: () => {
      toast({
        title: "Errore",
        description: "Non è stato possibile eliminare il contatto.",
        variant: "destructive",
      });
    },
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: async (contactIds: string[]) => {
      const promises = contactIds.map(id => 
        apiRequest("DELETE", `/api/contacts/${id}`)
      );
      await Promise.all(promises);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/contacts"] });
      toast({
        title: "Contatti eliminati",
        description: `${selectedContacts.length} contatti eliminati con successo.`,
      });
      setSelectedContacts([]);
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

  const bulkEditMutation = useMutation({
    mutationFn: async ({ contacts, updates }: { contacts: Contact[], updates: Record<string, any> }) => {
      await Promise.all(
        contacts.map(contact => apiRequest("PUT", `/api/contacts/${contact.id}`, updates))
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/contacts"] });
      setSelectedContacts([]);
      setShowBulkEditDialog(false);
      toast({ title: "Modificati", description: "Contatti modificati con successo" });
    }
  });

  const bulkCopyMutation = useMutation({
    mutationFn: async ({ contacts, addSuffix, suffix }: { contacts: Contact[], addSuffix: boolean, suffix: string }) => {
      await Promise.all(
        contacts.map(contact => {
          const { id, createdAt, updatedAt, userId, organizationId, ...contactData } = contact;
          const newContact = {
            ...contactData,
            name: addSuffix ? `${contact.name}${suffix}` : contact.name,
          };
          return apiRequest("POST", "/api/contacts", newContact);
        })
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/contacts"] });
      setSelectedContacts([]);
      setShowBulkCopyDialog(false);
      toast({
        title: "Contatti copiati",
        description: "I contatti selezionati sono stati copiati con successo.",
      });
    },
  });

  const handleEdit = (contact: Contact) => {
    setSelectedContact(contact);
    setShowEditDialog(true);
  };

  const handleDelete = (contact: Contact) => {
    setSelectedContact(contact);
    setShowDeleteDialog(true);
  };

  const confirmDelete = () => {
    if (selectedContact) {
      deleteMutation.mutate(selectedContact.id);
    }
  };

  const handleBulkDelete = () => {
    setShowBulkDeleteDialog(true);
  };

  const confirmBulkDelete = () => {
    const contactIds = selectedContacts.map(c => c.id);
    bulkDeleteMutation.mutate(contactIds);
  };

  const bulkEditFields: BulkEditField[] = [
    {
      key: "position",
      label: "Ruolo",
      type: "text",
      placeholder: "Es: Manager, CEO",
    },
    {
      key: "partnerId",
      label: "Organizzazione",
      type: "select",
      options: [
        { value: "", label: "Nessuna" },
        ...partners.map(p => ({ value: p.id, label: p.name })),
      ],
    },
  ];

  const handleBulkEditSave = (updates: Record<string, any>) => {
    bulkEditMutation.mutate({ contacts: selectedContacts, updates });
  };

  const handleBulkCopy = ({ addSuffix, suffix }: { addSuffix: boolean; suffix: string }) => {
    bulkCopyMutation.mutate({ contacts: selectedContacts, addSuffix, suffix });
  };

  // Define filter columns for advanced filtering
  const filterColumns = [
    { id: 'name', label: 'Nome', type: 'text' as const },
    { id: 'email', label: 'Email', type: 'text' as const },
    { id: 'phone', label: 'Telefono', type: 'text' as const },
    { id: 'position', label: 'Ruolo', type: 'text' as const },
    { id: 'company', label: 'Azienda', type: 'text' as const },
  ];

  // Define aggregation columns
  const aggregationColumns = [
    { id: 'name', type: 'count' as const, label: 'Totale Contatti' },
  ];

  // Define table columns for list view
  const tableColumns = [
    {
      accessorKey: 'name',
      header: 'Nome',
      cell: ({ row }: any) => (
        <div className="flex items-center gap-2" data-testid={`text-contact-name-${row.original.id}`}>
          <User className="h-4 w-4 text-muted-foreground" />
          <span className="font-medium">{row.original.name}</span>
        </div>
      ),
    },
    {
      accessorKey: 'email',
      header: 'Email',
      cell: ({ row }: any) => (
        <div className="flex items-center gap-2" data-testid={`text-contact-email-${row.original.id}`}>
          <Mail className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm">{row.original.email}</span>
        </div>
      ),
    },
    {
      accessorKey: 'phone',
      header: 'Telefono',
      cell: ({ row }: any) => row.original.phone ? (
        <div className="flex items-center gap-2">
          <Phone className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm">{row.original.phone}</span>
        </div>
      ) : (
        <span className="text-muted-foreground text-sm">-</span>
      ),
    },
    createTextColumn('position', 'Ruolo', 25),
    {
      accessorKey: 'company',
      header: 'Azienda',
      cell: ({ row }: any) => row.original.company ? (
        <div className="flex items-center gap-2">
          <Building className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm">{row.original.company}</span>
        </div>
      ) : (
        <span className="text-muted-foreground text-sm">-</span>
      ),
    },
    createTextColumn('notes', 'Note', 40),
    {
      id: 'actions',
      header: 'Azioni',
      cell: ({ row }: any) => {
        const contact = row.original;
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" data-testid={`button-contact-menu-${contact.id}`}>
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem 
                onClick={() => handleEdit(contact)}
                data-testid={`menu-edit-contact-${contact.id}`}
              >
                <Edit className="mr-2 h-4 w-4" />
                Modifica
              </DropdownMenuItem>
              <DropdownMenuItem 
                onClick={() => handleDelete(contact)}
                className="text-destructive"
                data-testid={`menu-delete-contact-${contact.id}`}
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
          title="Contatti" 
          subtitle="Gestisci i tuoi contatti di riferimento"
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
            onDeleteSelected={() => setShowBulkDeleteDialog(true)}
            hasSelection={selectedContacts.length > 0}
          />
          
          {isLoading ? (
            <div className="space-y-4">
              {[...Array(6)].map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : filteredContacts.length === 0 ? (
            <div className="text-center py-12">
              <ContactIcon className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium text-foreground mb-2">Nessun contatto</h3>
              <p className="text-muted-foreground mb-4">Aggiungi il tuo primo contatto di riferimento</p>
              <Button onClick={() => setShowCreateDialog(true)} data-testid="button-create-first-contact">
                Aggiungi Contatto
              </Button>
            </div>
          ) : (
            <DataTable
              key={`contacts-table-${currentLayoutName}-${JSON.stringify(layout.columns)}`}
              columns={tableColumns}
              data={filteredContacts}
              searchPlaceholder="Cerca contatti..."
              onRowClick={handleEdit}
              enableSelection={true}
              onSelectionChange={setSelectedContacts}
              tableId="contacts"
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
      
      {/* Create/Edit Dialog */}
      <Dialog open={showCreateDialog || showEditDialog} onOpenChange={(open) => {
        if (!open) {
          setShowCreateDialog(false);
          setShowEditDialog(false);
          setSelectedContact(null);
        }
      }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {selectedContact ? "Modifica Contatto" : "Nuovo Contatto"}
            </DialogTitle>
            <DialogDescription>
              {selectedContact ? "Modifica i dati del contatto" : "Aggiungi un nuovo contatto di riferimento"}
            </DialogDescription>
          </DialogHeader>
          <ContactForm
            contact={selectedContact || undefined}
            onSuccess={() => {
              setShowCreateDialog(false);
              setShowEditDialog(false);
              setSelectedContact(null);
            }}
            onCancel={() => {
              setShowCreateDialog(false);
              setShowEditDialog(false);
              setSelectedContact(null);
            }}
          />
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Conferma Eliminazione</AlertDialogTitle>
            <AlertDialogDescription>
              Sei sicuro di voler eliminare "{selectedContact?.name}"? 
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
              Sei sicuro di voler eliminare {selectedContacts.length} contatti selezionati? 
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
              {bulkDeleteMutation.isPending ? "Eliminando..." : `Elimina ${selectedContacts.length} Contatti`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk Copy Dialog */}
      <BulkCopyDialog
        open={showBulkCopyDialog}
        onOpenChange={setShowBulkCopyDialog}
        title="Copia Contatti"
        description="Crea copie dei contatti"
        selectedCount={selectedContacts.length}
        onCopy={handleBulkCopy}
        isPending={bulkCopyMutation.isPending}
      />

      {/* Table Configuration Dialog */}
      <TableConfiguration
        isOpen={showConfigDialog}
        onOpenChange={setShowConfigDialog}
        tableId="contacts"
        availableColumns={availableColumns.length > 0 ? availableColumns : [
          { id: 'name', label: 'Nome' },
          { id: 'email', label: 'Email' },
          { id: 'phone', label: 'Telefono' },
          { id: 'position', label: 'Ruolo' },
          { id: 'company', label: 'Azienda' },
          { id: 'notes', label: 'Note' },
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
        title="Modifica Multipla Contatti"
        description={`Modifica ${selectedContacts.length} contatti selezionati`}
        fields={bulkEditFields}
        selectedCount={selectedContacts.length}
        onSave={handleBulkEditSave}
        isPending={bulkEditMutation.isPending}
      />
    </div>
  );
}
