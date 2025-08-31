import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { UniversalTable, createStandardColumns } from "@/components/ui/universal-table";
import { Button } from "@/components/ui/button";
import { Plus, Edit, Trash2, Key, Wifi, Server } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { SystemCredentialsForm } from "@/components/forms/system-credentials-form";
import type { SystemCredentials } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";

export function SystemCredentialsPage() {
  const [selectedCredentials, setSelectedCredentials] = useState<SystemCredentials[]>([]);
  const [editingCredential, setEditingCredential] = useState<SystemCredentials | null>(null);
  const [showForm, setShowForm] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: credentials = [], isLoading } = useQuery<SystemCredentials[]>({
    queryKey: ["/api/system-credentials"],
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest(`/api/system-credentials/${id}`, "DELETE"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/system-credentials"] });
      toast({
        title: "Credenziali eliminate",
        description: "Le credenziali sono state eliminate con successo.",
      });
    },
    onError: () => {
      toast({
        title: "Errore",
        description: "Impossibile eliminare le credenziali.",
        variant: "destructive",
      });
    },
  });

  const handleEdit = (credential: SystemCredentials) => {
    setEditingCredential(credential);
    setShowForm(true);
  };

  const handleAdd = () => {
    setEditingCredential(null);
    setShowForm(true);
  };

  const handleDelete = async (credentials: SystemCredentials[]) => {
    if (credentials.length === 0) return;
    
    if (confirm(`Eliminare ${credentials.length} credenziali selezionate?`)) {
      for (const credential of credentials) {
        await deleteMutation.mutateAsync(credential.id);
      }
      setSelectedCredentials([]);
    }
  };

  const formatSystemType = (type: string) => {
    switch (type) {
      case "sap": return "SAP";
      case "vpn": return "VPN";
      default: return type.toUpperCase();
    }
  };

  const formatExpirationDate = (date: Date | string | null) => {
    if (!date) return "Nessuna scadenza";
    const expDate = new Date(date);
    const today = new Date();
    const diffDays = Math.ceil((expDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    
    if (diffDays < 0) return `🔴 Scaduta ${Math.abs(diffDays)} giorni fa`;
    if (diffDays <= 7) return `🟡 Scade tra ${diffDays} giorni`;
    if (diffDays <= 30) return `🟠 Scade tra ${diffDays} giorni`;
    return `🟢 Scade il ${expDate.toLocaleDateString("it-IT")}`;
  };

  const columns = [
    createStandardColumns.text("username", "Username"),
    createStandardColumns.text("systemName", "Sistema"),
    createStandardColumns.badge("systemType", "Tipo", {
      "sap": "bg-blue-100 text-blue-800",
      "vpn": "bg-green-100 text-green-800"
    }),
    createStandardColumns.text("description", "Descrizione"),
    {
      key: "expirationDate",
      label: "Scadenza",
      sortable: true,
      searchable: false,
      render: (credential: SystemCredentials) => formatExpirationDate(credential.expirationDate)
    },
    {
      key: "isActive", 
      label: "Stato",
      sortable: true,
      searchable: false,
      render: (credential: SystemCredentials) => (
        <span className={credential.isActive ? "text-green-600" : "text-red-600"}>
          {credential.isActive ? "Attivo" : "Inattivo"}
        </span>
      )
    },
    {
      key: "actions",
      label: "Azioni",
      sortable: false,
      searchable: false,
      render: (credential: SystemCredentials) => (
        <Button
          variant="ghost" 
          size="sm"
          onClick={(e) => {
            e.stopPropagation();
            handleEdit(credential);
          }}
          data-testid={`button-edit-${credential.id}`}
        >
          <Edit className="h-4 w-4" />
        </Button>
      )
    }
  ];

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-3">
          <Key className="h-8 w-8 text-blue-600" />
          <div>
            <h1 className="text-3xl font-bold">Credenziali Sistema</h1>
            <p className="text-gray-600">Gestione unificata credenziali SAP e VPN</p>
          </div>
        </div>
        <Button 
          onClick={handleAdd}
          className="bg-blue-600 hover:bg-blue-700"
          data-testid="button-add-credential"
        >
          <Plus className="h-4 w-4 mr-2" />
          Aggiungi Credenziali
        </Button>
      </div>

      <UniversalTable
        data={credentials}
        columns={columns}
        enableSelection={true}
        enableSearch={true}
        searchPlaceholder="Cerca credenziali..."
        onSelectionChange={(rows) => setSelectedCredentials(rows as SystemCredentials[])}
        onRowClick={handleEdit}
        bulkActions={[
          {
            label: "Delete Selected",
            icon: Trash2,
            variant: "destructive",
            onClick: () => handleDelete(selectedCredentials)
          }
        ]}
        // isLoading={isLoading} // TODO: Add loading support to UniversalTable
      />

      {showForm && (
        <SystemCredentialsForm
          credential={editingCredential}
          onSuccess={() => {
            setShowForm(false);
            setEditingCredential(null);
            queryClient.invalidateQueries({ queryKey: ["/api/system-credentials"] });
          }}
          onCancel={() => {
            setShowForm(false);
            setEditingCredential(null);
          }}
        />
      )}
    </div>
  );
}