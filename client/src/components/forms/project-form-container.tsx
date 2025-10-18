import { useState, useEffect } from "react";
import { useParams } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getQueryFn } from "@/lib/queryClient";
import { useOrganization } from "@/contexts/organization-context";
import { useReadOnlyMode } from "@/hooks/use-readonly-mode";
import FormContainer, { useFormRouting } from "./form-container";
import ProjectForm from "./project-form";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MessageHistory } from "@/components/ui/message-history";
import AuditHistory from "@/components/ui/audit-history";
import { Edit, MessageSquare, History } from "lucide-react";
import type { Project } from "@shared/schema";

interface ProjectFormContainerProps {
  // Dialog mode props
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  editingProject?: Project | null;
  
  // Callbacks
  onSuccess?: () => void;
}

export default function ProjectFormContainer({
  open = false,
  onOpenChange,
  editingProject,
  onSuccess,
}: ProjectFormContainerProps) {
  const params = useParams();
  const { currentOrganizationId } = useOrganization();
  const queryClient = useQueryClient();
  
  // Form routing
  const { routes, navigation, currentRoute } = useFormRouting("/projects", params.id);
  
  // Read-only mode (from URL parameter)
  const { isReadOnly, enableEdit, disableEdit } = useReadOnlyMode();
  
  // For full-page mode, fetch project data from route params
  const { data: fullPageProject } = useQuery({
    queryKey: ["/api/projects", params.id],
    queryFn: getQueryFn({ on401: "throw" }),
    enabled: !!params.id && currentRoute.isEdit,
  });
  
  // Determine which project to use
  const project = currentRoute.isFullPage ? fullPageProject : editingProject;
  const isEditing = !!project;
  
  // Type safety check - show loading instead of null
  if (currentRoute.isEdit && !project && currentRoute.isFullPage) {
    return <div className="p-8 text-center">Caricamento progetto...</div>;
  }
  
  // Handle success callback
  const handleSuccess = () => {
    if (currentRoute.isFullPage) {
      navigation.toList();
    } else {
      onSuccess?.();
    }
    queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
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
  
  const title = isEditing ? "Modifica Progetto" : "Nuovo Progetto";
  const description = isEditing 
    ? `Modifica i dettagli del progetto "${(project as Project)?.name}"` 
    : "Crea un nuovo progetto per la tua organizzazione";
  
  // Toggle function: enable edit when readonly, disable edit when editing
  const handleToggleReadOnly = isEditing 
    ? () => isReadOnly ? enableEdit() : disableEdit()
    : undefined;
  
  return (
    <FormContainer
      open={open}
      onOpenChange={handleOpenChange}
      title={title}
      description={description}
      fullPageRoute={isEditing ? routes.edit((project as Project)?.id || "") : routes.create}
      maxWidth="max-w-4xl"
      isReadOnly={isReadOnly}
      onToggleReadOnly={handleToggleReadOnly}
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
            <ProjectForm 
              project={project as Project}
              onSuccess={handleSuccess}
              isReadOnly={isReadOnly}
            />
          </TabsContent>
          
          <TabsContent value="messages" className="mt-6">
            <MessageHistory 
              tableName="projects" 
              recordId={(project as Project)?.id || ""}
              title="Storico Messaggi Progetto"
            />
          </TabsContent>
          
          <TabsContent value="history" className="mt-6">
            <AuditHistory 
              tableName="projects" 
              recordId={(project as Project)?.id || ""}
              title="Storico Modifiche Progetto"
            />
          </TabsContent>
        </Tabs>
      ) : (
        // Creation mode (simple form)
        <ProjectForm 
          project={undefined}
          onSuccess={handleSuccess}
        />
      )}
    </FormContainer>
  );
}