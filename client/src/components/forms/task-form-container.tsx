import { useParams } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getQueryFn } from "@/lib/queryClient";
import { useOrganization } from "@/hooks/use-organization";
import FormContainer, { useFormRouting } from "./form-container";
import TaskForm from "./task-form";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MessageHistory } from "@/components/ui/message-history";
import AuditHistory from "@/components/ui/audit-history";
import { Edit, MessageSquare, History } from "lucide-react";
import type { Task } from "@shared/schema";

interface TaskFormContainerProps {
  // Dialog mode props
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  editingTask?: Task | null;
  
  // Callbacks
  onSuccess?: () => void;
}

export default function TaskFormContainer({
  open = false,
  onOpenChange,
  editingTask,
  onSuccess,
}: TaskFormContainerProps) {
  const params = useParams();
  const { currentOrganizationId } = useOrganization();
  const queryClient = useQueryClient();
  
  // Form routing
  const { routes, navigation, currentRoute } = useFormRouting("/tasks", params.id);
  
  // For full-page mode, fetch task data from route params
  const { data: fullPageTask } = useQuery({
    queryKey: ["/api/tasks", params.id],
    queryFn: getQueryFn({ on401: "throw" }),
    enabled: !!params.id && currentRoute.isEdit,
  });
  
  // Determine which task to use
  const task = currentRoute.isFullPage ? fullPageTask : editingTask;
  const isEditing = !!task;
  
  // Type safety check - show loading instead of null
  if (currentRoute.isEdit && !task && currentRoute.isFullPage) {
    return <div className="p-8 text-center">Caricamento task...</div>;
  }
  
  // Handle success callback
  const handleSuccess = () => {
    if (currentRoute.isFullPage) {
      navigation.toList();
    } else {
      onSuccess?.();
    }
    queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
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
  
  const title = isEditing ? "Modifica Task" : "Nuovo Task";
  const description = isEditing 
    ? `Modifica i dettagli del task "${(task as Task)?.title}"` 
    : "Crea un nuovo task per la tua organizzazione";
  
  return (
    <FormContainer
      open={open}
      onOpenChange={handleOpenChange}
      title={title}
      description={description}
      fullPageRoute={isEditing ? routes.edit((task as Task)?.id || "") : routes.create}
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
            <TaskForm 
              task={task as Task}
              onSuccess={handleSuccess}
            />
          </TabsContent>
          
          <TabsContent value="messages" className="mt-6">
            <MessageHistory 
              tableName="tasks" 
              recordId={(task as Task)?.id || ""}
              title="Storico Messaggi Task"
            />
          </TabsContent>
          
          <TabsContent value="history" className="mt-6">
            <AuditHistory 
              tableName="tasks" 
              recordId={(task as Task)?.id || ""}
              title="Storico Modifiche Task"
            />
          </TabsContent>
        </Tabs>
      ) : (
        // Creation mode - just the form
        <TaskForm 
          task={task as Task}
          onSuccess={handleSuccess}
        />
      )}
    </FormContainer>
  );
}