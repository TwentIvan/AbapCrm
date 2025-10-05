import { useParams } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getQueryFn } from "@/lib/queryClient";
import { useOrganization } from "@/contexts/organization-context";
import FormContainer, { useFormRouting } from "./form-container";
import { SystemCredentialsForm } from "./system-credentials-form";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MessageHistory } from "@/components/ui/message-history";
import AuditHistory from "@/components/ui/audit-history";
import { Edit, MessageSquare, History } from "lucide-react";
import type { SystemCredentials } from "@shared/schema";

interface SystemCredentialsFormContainerProps {
  // Dialog mode props
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  editingCredential?: SystemCredentials | null;
  
  // Callbacks
  onSuccess?: () => void;
}

export default function SystemCredentialsFormContainer({
  open = false,
  onOpenChange,
  editingCredential,
  onSuccess,
}: SystemCredentialsFormContainerProps) {
  const params = useParams();
  const { currentOrganizationId } = useOrganization();
  const queryClient = useQueryClient();
  
  // Form routing
  const { routes, navigation, currentRoute } = useFormRouting("/system-credentials", params.id);
  
  // For full-page mode, fetch credential data from route params
  const { data: fullPageCredential } = useQuery({
    queryKey: ["/api/system-credentials", params.id],
    queryFn: getQueryFn({ on401: "throw" }),
    enabled: !!params.id && currentRoute.isEdit,
  });
  
  // Determine which credential to use
  const credential = currentRoute.isFullPage ? fullPageCredential : editingCredential;
  const isEditing = !!credential;
  
  // Type safety check - show loading instead of null
  if (currentRoute.isEdit && !credential && currentRoute.isFullPage) {
    return <div className="p-8 text-center">Caricamento credenziali...</div>;
  }
  
  // Handle success callback
  const handleSuccess = () => {
    if (currentRoute.isFullPage) {
      navigation.toList();
    } else {
      onSuccess?.();
    }
    queryClient.invalidateQueries({ queryKey: ["/api/system-credentials"] });
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
  
  const title = isEditing ? "Modifica Credenziali" : "Nuove Credenziali";
  const description = isEditing 
    ? `Modifica le credenziali per "${(credential as SystemCredentials)?.systemName}"` 
    : "Crea nuove credenziali di sistema";
  
  return (
    <FormContainer
      open={open}
      onOpenChange={handleOpenChange}
      title={title}
      description={description}
      fullPageRoute={isEditing ? routes.edit((credential as SystemCredentials)?.id || "") : routes.create}
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
            <SystemCredentialsForm 
              credential={credential as SystemCredentials}
              onSuccess={handleSuccess}
              onCancel={() => handleOpenChange(false)}
            />
          </TabsContent>
          
          <TabsContent value="messages" className="mt-6">
            <MessageHistory 
              tableName="system_credentials" 
              recordId={(credential as SystemCredentials)?.id || ""}
              title="Storico Messaggi Credenziali"
            />
          </TabsContent>
          
          <TabsContent value="history" className="mt-6">
            <AuditHistory 
              tableName="system_credentials" 
              recordId={(credential as SystemCredentials)?.id || ""}
              title="Storico Modifiche Credenziali"
            />
          </TabsContent>
        </Tabs>
      ) : (
        // Creation mode - just the form
        <SystemCredentialsForm 
          credential={credential as SystemCredentials}
          onSuccess={handleSuccess}
          onCancel={() => handleOpenChange(false)}
        />
      )}
    </FormContainer>
  );
}