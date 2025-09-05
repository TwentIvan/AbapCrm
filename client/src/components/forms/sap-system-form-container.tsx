import { useParams } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getQueryFn } from "@/lib/queryClient";
import { useOrganization } from "@/hooks/use-organization";
import FormContainer, { useFormRouting } from "./form-container";
import SapSystemForm from "./sap-system-form";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MessageHistory } from "@/components/ui/message-history";
import AuditHistory from "@/components/ui/audit-history";
import { Edit, MessageSquare, History } from "lucide-react";
import type { SapSystem } from "@shared/schema";

interface SapSystemFormContainerProps {
  // Dialog mode props
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  editingSystem?: SapSystem | null;
  
  // Callbacks
  onSuccess?: () => void;
}

export default function SapSystemFormContainer({
  open = false,
  onOpenChange,
  editingSystem,
  onSuccess,
}: SapSystemFormContainerProps) {
  const params = useParams();
  const { currentOrganizationId } = useOrganization();
  const queryClient = useQueryClient();
  
  // Form routing
  const { routes, navigation, currentRoute } = useFormRouting("/sap-systems", params.id);
  
  // For full-page mode, fetch system data from route params
  const { data: fullPageSystem } = useQuery({
    queryKey: ["/api/sap-systems", params.id],
    queryFn: getQueryFn({ on401: "throw" }),
    enabled: !!params.id && currentRoute.isEdit,
  });
  
  // Determine which system to use
  const system = currentRoute.isFullPage ? fullPageSystem : editingSystem;
  const isEditing = !!system;
  
  // Type safety check - show loading instead of null
  if (currentRoute.isEdit && !system && currentRoute.isFullPage) {
    return <div className="p-8 text-center">Caricamento sistema SAP...</div>;
  }
  
  // Handle success callback
  const handleSuccess = () => {
    if (currentRoute.isFullPage) {
      navigation.toList();
    } else {
      onSuccess?.();
    }
    queryClient.invalidateQueries({ queryKey: ["/api/sap-systems"] });
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
  
  const title = isEditing ? "Modifica Sistema SAP" : "Nuovo Sistema SAP";
  const description = isEditing 
    ? `Modifica i dettagli del sistema SAP "${(system as SapSystem)?.name}"` 
    : "Crea un nuovo sistema SAP per la tua organizzazione";
  
  return (
    <FormContainer
      open={open}
      onOpenChange={handleOpenChange}
      title={title}
      description={description}
      fullPageRoute={isEditing ? routes.edit((system as SapSystem)?.id || "") : routes.create}
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
            <SapSystemForm 
              system={system as SapSystem}
              onSuccess={handleSuccess}
            />
          </TabsContent>
          
          <TabsContent value="messages" className="mt-6">
            <MessageHistory 
              tableName="sap_systems" 
              recordId={(system as SapSystem)?.id || ""}
              title="Storico Messaggi Sistema SAP"
            />
          </TabsContent>
          
          <TabsContent value="history" className="mt-6">
            <AuditHistory 
              tableName="sap_systems" 
              recordId={(system as SapSystem)?.id || ""}
              title="Storico Modifiche Sistema SAP"
            />
          </TabsContent>
        </Tabs>
      ) : (
        // Creation mode - just the form
        <SapSystemForm 
          system={system as SapSystem}
          onSuccess={handleSuccess}
        />
      )}
    </FormContainer>
  );
}