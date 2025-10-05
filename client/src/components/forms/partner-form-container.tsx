import { useParams } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getQueryFn } from "@/lib/queryClient";
import { useOrganization } from "@/contexts/organization-context";
import FormContainer, { useFormRouting } from "./form-container";
import AdvancedPartnerForm from "./advanced-partner-form";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MessageHistory } from "@/components/ui/message-history";
import AuditHistory from "@/components/ui/audit-history";
import { Edit, MessageSquare, History } from "lucide-react";
import type { Partner } from "@shared/schema";

interface PartnerFormContainerProps {
  // Dialog mode props
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  editingPartner?: Partner | null;
  
  // Callbacks
  onSuccess?: () => void;
}

export default function PartnerFormContainer({
  open = false,
  onOpenChange,
  editingPartner,
  onSuccess,
}: PartnerFormContainerProps) {
  const params = useParams();
  const { currentOrganizationId } = useOrganization();
  const queryClient = useQueryClient();
  
  // Form routing
  const { routes, navigation, currentRoute } = useFormRouting("/partners", params.id);
  
  // For full-page mode, fetch partner data from route params
  const { data: fullPagePartner } = useQuery({
    queryKey: ["/api/partners", params.id],
    queryFn: getQueryFn({ on401: "throw" }),
    enabled: !!params.id && currentRoute.isEdit,
  });
  
  // Determine which partner to use
  const partner = currentRoute.isFullPage ? fullPagePartner : editingPartner;
  const isEditing = !!partner;
  
  // Type safety check - show loading instead of null
  if (currentRoute.isEdit && !partner && currentRoute.isFullPage) {
    return <div className="p-8 text-center">Caricamento partner...</div>;
  }
  
  // Handle success callback
  const handleSuccess = () => {
    if (currentRoute.isFullPage) {
      navigation.toList();
    } else {
      onSuccess?.();
    }
    queryClient.invalidateQueries({ queryKey: ["/api/partners"] });
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
  
  const title = isEditing ? "Modifica Partner" : "Nuovo Partner";
  const description = isEditing 
    ? `Modifica i dettagli del partner "${(partner as Partner)?.name}"` 
    : "Crea un nuovo partner per la tua organizzazione";
  
  return (
    <FormContainer
      open={open}
      onOpenChange={handleOpenChange}
      title={title}
      description={description}
      fullPageRoute={isEditing ? routes.edit((partner as Partner)?.id || "") : routes.create}
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
            <AdvancedPartnerForm 
              existingPartner={partner as Partner}
              onSuccess={handleSuccess}
            />
          </TabsContent>
          
          <TabsContent value="messages" className="mt-6">
            <MessageHistory 
              tableName="partners" 
              recordId={(partner as Partner)?.id || ""}
              title="Storico Messaggi Partner"
            />
          </TabsContent>
          
          <TabsContent value="history" className="mt-6">
            <AuditHistory 
              tableName="partners" 
              recordId={(partner as Partner)?.id || ""}
              title="Storico Modifiche Partner"
            />
          </TabsContent>
        </Tabs>
      ) : (
        // Creation mode - just the form
        <AdvancedPartnerForm 
          existingPartner={partner as Partner}
          onSuccess={handleSuccess}
        />
      )}
    </FormContainer>
  );
}