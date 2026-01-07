import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest, getQueryFn } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Share2, X, Loader2, Users } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface ProjectShare {
  id: string;
  projectId: string;
  targetOrganizationId: string;
  targetOrganizationName: string;
  permission: 'read' | 'edit';
  sharedAt: string;
}

interface Organization {
  id: string;
  name: string;
}

interface ProjectShareManagerProps {
  projectId: string;
  projectOrganizationId: string;
  isReadOnly?: boolean;
}

export default function ProjectShareManager({ projectId, projectOrganizationId, isReadOnly = false }: ProjectShareManagerProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedOrgId, setSelectedOrgId] = useState<string>("");

  const { data: shares = [], isLoading: isLoadingShares } = useQuery<ProjectShare[]>({
    queryKey: [`/api/projects/${projectId}/shares`],
    queryFn: getQueryFn({ on401: "throw" }),
    enabled: !!projectId,
  });

  const { data: userOrgs = [] } = useQuery<Organization[]>({
    queryKey: ['/api/user/organizations'],
    queryFn: getQueryFn({ on401: "throw" }),
    enabled: !!user,
  });

  // Filter out: project's own organization and already shared organizations
  const availableOrgs = userOrgs.filter(org => 
    org.id !== projectOrganizationId && 
    !shares.some(share => share.targetOrganizationId === org.id)
  );

  // Debug
  console.log('[ProjectShareManager] projectId:', projectId);
  console.log('[ProjectShareManager] projectOrganizationId:', projectOrganizationId);
  console.log('[ProjectShareManager] userOrgs:', userOrgs);
  console.log('[ProjectShareManager] shares:', shares);
  console.log('[ProjectShareManager] availableOrgs:', availableOrgs);

  const createShareMutation = useMutation({
    mutationFn: async (targetOrganizationId: string) => {
      const res = await apiRequest("POST", `/api/projects/${projectId}/shares`, {
        targetOrganizationId,
        permission: 'read',
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/shares`] });
      setSelectedOrgId("");
      toast({
        title: "Progetto condiviso",
        description: "Il progetto è stato condiviso con l'organizzazione selezionata",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Errore",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deleteShareMutation = useMutation({
    mutationFn: async (targetOrganizationId: string) => {
      await apiRequest("DELETE", `/api/projects/${projectId}/shares/${targetOrganizationId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/shares`] });
      toast({
        title: "Condivisione rimossa",
        description: "La condivisione è stata rimossa",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Errore",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleShare = () => {
    if (selectedOrgId) {
      createShareMutation.mutate(selectedOrgId);
    }
  };

  if (isLoadingShares) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-6">
          <Loader2 className="h-4 w-4 animate-spin" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card data-testid="project-share-manager">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Users className="h-4 w-4" />
          Condivisione Progetto
        </CardTitle>
        <CardDescription className="text-xs">
          Condividi questo progetto con altre organizzazioni
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {shares.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">Condiviso con:</p>
            <div className="flex flex-wrap gap-2">
              {shares.map((share) => (
                <Badge 
                  key={share.id} 
                  variant="secondary"
                  className="flex items-center gap-1 pr-1"
                  data-testid={`share-badge-${share.targetOrganizationId}`}
                >
                  <Share2 className="h-3 w-3" />
                  {share.targetOrganizationName}
                  {!isReadOnly && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-4 w-4 ml-1 hover:bg-destructive/20"
                      onClick={() => deleteShareMutation.mutate(share.targetOrganizationId)}
                      disabled={deleteShareMutation.isPending}
                      data-testid={`remove-share-${share.targetOrganizationId}`}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  )}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {!isReadOnly && availableOrgs.length > 0 && (
          <div className="flex gap-2">
            <Select value={selectedOrgId} onValueChange={setSelectedOrgId}>
              <SelectTrigger className="flex-1" data-testid="select-org-to-share">
                <SelectValue placeholder="Seleziona organizzazione..." />
              </SelectTrigger>
              <SelectContent>
                {availableOrgs.map((org) => (
                  <SelectItem key={org.id} value={org.id}>
                    {org.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              onClick={handleShare}
              disabled={!selectedOrgId || createShareMutation.isPending}
              size="sm"
              data-testid="btn-share-project"
            >
              {createShareMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Share2 className="h-4 w-4" />
              )}
            </Button>
          </div>
        )}

        {!isReadOnly && availableOrgs.length === 0 && shares.length === 0 && (
          <p className="text-xs text-muted-foreground italic">
            Non hai altre organizzazioni con cui condividere
          </p>
        )}
      </CardContent>
    </Card>
  );
}
