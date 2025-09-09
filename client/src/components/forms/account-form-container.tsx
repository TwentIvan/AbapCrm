import { useParams } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getQueryFn } from "@/lib/queryClient";
import { useOrganization } from "@/hooks/use-organization";
import { useAuth } from "@/hooks/use-auth";
import FormContainer, { useFormRouting } from "./form-container";
import AccountForm from "./account-form";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MessageHistory } from "@/components/ui/message-history";
import AuditHistory from "@/components/ui/audit-history";
import EmailConfig from "@/components/email-config";
import { Edit, MessageSquare, History, Mail } from "lucide-react";
import type { User } from "@shared/schema";

interface AccountFormContainerProps {
  // Dialog mode props
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  editingUser?: User | null;
  
  // Callbacks
  onSuccess?: () => void;
}

export default function AccountFormContainer({
  open = false,
  onOpenChange,
  editingUser,
  onSuccess,
}: AccountFormContainerProps) {
  const params = useParams();
  const { currentOrganizationId } = useOrganization();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  
  // Form routing
  const { routes, navigation, currentRoute } = useFormRouting("/account", params.id);
  
  // For full-page mode, use current user data
  const { data: fullPageUser } = useQuery<User>({
    queryKey: ["/api/user"],
    queryFn: getQueryFn({ on401: "throw" }),
    enabled: !!currentRoute.isFullPage,
  });
  
  // Determine which user to use
  const currentUser = currentRoute.isFullPage ? fullPageUser : (editingUser || user);
  const isEditing = !!currentUser;
  
  // Type safety check - show loading instead of null
  if (currentRoute.isFullPage && !currentUser) {
    return <div className="p-8 text-center">Caricamento account...</div>;
  }
  
  // Handle success callback
  const handleSuccess = () => {
    if (currentRoute.isFullPage) {
      navigation.toList();
    } else {
      onSuccess?.();
    }
    queryClient.invalidateQueries({ queryKey: ["/api/user"] });
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

  return (
    <FormContainer
      open={currentRoute.isFullPage ? true : open}
      onOpenChange={handleOpenChange}
      title={isEditing ? "Modifica Account" : "Nuovo Account"}
    >
      <Tabs defaultValue="details" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="details" className="flex items-center gap-2">
            <Edit className="h-4 w-4" />
            Dettagli
          </TabsTrigger>
          <TabsTrigger value="email" className="flex items-center gap-2">
            <Mail className="h-4 w-4" />
            Email
          </TabsTrigger>
          <TabsTrigger value="messages" className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4" />
            Messaggi
          </TabsTrigger>
          <TabsTrigger value="history" className="flex items-center gap-2">
            <History className="h-4 w-4" />
            Storico
          </TabsTrigger>
        </TabsList>

        <TabsContent value="details" className="space-y-4">
          <AccountForm
            user={currentUser}
            onSuccess={handleSuccess}
          />
        </TabsContent>

        <TabsContent value="email" className="space-y-4">
          <EmailConfig />
        </TabsContent>

        <TabsContent value="messages" className="space-y-4">
          <MessageHistory 
            tableName="users"
            recordId={currentUser?.id || ""}
          />
        </TabsContent>

        <TabsContent value="history" className="space-y-4">
          <AuditHistory 
            tableName="users"
            recordId={currentUser?.id || ""}
          />
        </TabsContent>
      </Tabs>
    </FormContainer>
  );
}