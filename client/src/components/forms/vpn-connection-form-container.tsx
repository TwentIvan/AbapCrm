import { useParams } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getQueryFn } from "@/lib/queryClient";
import { useOrganization } from "@/contexts/organization-context";
import FormContainer, { useFormRouting } from "./form-container";
import SimpleVPNForm from "./simple-vpn-form";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MessageHistory } from "@/components/ui/message-history";
import AuditHistory from "@/components/ui/audit-history";
import { Edit, MessageSquare, History } from "lucide-react";
import type { VpnConnection, Partner } from "@shared/schema";

interface VpnConnectionFormContainerProps {
  // Dialog mode props
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  editingConnection?: VpnConnection | null;
  
  // Callbacks
  onSuccess?: () => void;
}

export default function VpnConnectionFormContainer({
  open = false,
  onOpenChange,
  editingConnection,
  onSuccess,
}: VpnConnectionFormContainerProps) {
  const params = useParams();
  const { currentOrganizationId } = useOrganization();
  const queryClient = useQueryClient();
  
  // Form routing
  const { routes, navigation, currentRoute } = useFormRouting("/vpn-connections", params.id);
  
  // For full-page mode, fetch connection data from route params
  const { data: fullPageConnection } = useQuery({
    queryKey: ["/api/vpn-connections", params.id],
    queryFn: getQueryFn({ on401: "throw" }),
    enabled: !!params.id && currentRoute.isEdit,
  });
  
  // Fetch partners list for SimpleVPNForm
  const { data: partners = [] } = useQuery<Partner[]>({
    queryKey: ["/api/partners"],
    queryFn: getQueryFn({ on401: "throw" }),
    enabled: !!currentOrganizationId,
  });
  
  // Determine which connection to use
  const connection = currentRoute.isFullPage ? fullPageConnection : editingConnection;
  const isEditing = !!connection;
  
  // Type safety check - show loading instead of null
  if (currentRoute.isEdit && !connection && currentRoute.isFullPage) {
    return <div className="p-8 text-center">Caricamento connessione VPN...</div>;
  }
  
  // Handle success callback
  const handleSuccess = () => {
    if (currentRoute.isFullPage) {
      navigation.toList();
    } else {
      onSuccess?.();
    }
    queryClient.invalidateQueries({ queryKey: ["/api/vpn-connections"] });
  };
  
  // Handle container close
  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen && currentRoute.isFullPage) {
      navigation.toList();
    } else {
      onOpenChange?.(newOpen);
    }
  };
  
  // Only return null if we're in full page mode but not on a valid route
  // In dialog mode, we always render regardless of route
  if (currentRoute.isFullPage && !currentRoute.isCreate && !currentRoute.isEdit) {
    return null;
  }
  
  const title = isEditing ? "Modifica Connessione VPN" : "Nuova Connessione VPN";
  const description = isEditing 
    ? `Modifica la connessione VPN "${(connection as VpnConnection)?.name}"` 
    : "Crea una nuova connessione VPN";
  
  return (
    <FormContainer
      open={open}
      onOpenChange={handleOpenChange}
      title={title}
      description={description}
      fullPageRoute={isEditing ? routes.edit((connection as VpnConnection)?.id || "") : routes.create}
      maxWidth="max-w-4xl"
    >
      {isEditing ? (
        // Editing mode with tabs (details, messages, history)
        <Tabs defaultValue="details" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="details" className="flex items-center space-x-2">
              <Edit className="h-4 w-4" />
              <span>Dettagli</span>
            </TabsTrigger>
            <TabsTrigger value="messages" className="flex items-center space-x-2">
              <MessageSquare className="h-4 w-4" />
              <span>Messaggi</span>
            </TabsTrigger>
            <TabsTrigger value="history" className="flex items-center space-x-2">
              <History className="h-4 w-4" />
              <span>Storico Modifiche</span>
            </TabsTrigger>
          </TabsList>
          
          <TabsContent value="details" className="mt-6">
            <div className="p-4 text-center">
              <p className="text-muted-foreground">
                La modifica di connessioni VPN esistenti non è ancora supportata.<br/>
                Elimina la connessione e ricreala se necessario.
              </p>
            </div>
          </TabsContent>
          
          <TabsContent value="messages" className="mt-6">
            <MessageHistory 
              tableName="vpn_connections" 
              recordId={(connection as VpnConnection)?.id || ""}
              title="Storico Messaggi Connessione VPN"
            />
          </TabsContent>
          
          <TabsContent value="history" className="mt-6">
            <AuditHistory 
              tableName="vpn_connections" 
              recordId={(connection as VpnConnection)?.id || ""}
              title="Storico Modifiche Connessione VPN"
            />
          </TabsContent>
        </Tabs>
      ) : (
        // Creation mode - just the form
        <SimpleVPNForm 
          partners={partners?.map(p => ({ id: p.id, name: p.name || 'N/A', company: p.company || 'N/A' })) || []}
          onSuccess={handleSuccess}
          onCancel={() => handleOpenChange(false)}
        />
      )}
    </FormContainer>
  );
}