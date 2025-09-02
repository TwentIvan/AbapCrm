import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useOrganization } from "@/hooks/use-organization";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Building, Plus, Mail, Users } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface ManageOrganizationsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function ManageOrganizationsDialog({ open, onOpenChange }: ManageOrganizationsDialogProps) {
  const { organizations, currentOrganization } = useOrganization();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [newOrgName, setNewOrgName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("member");

  // Fetch invitations  
  const { data: invitations = [] } = useQuery<any[]>({
    queryKey: ["/api/invitations"],
    enabled: open,
  });

  const createOrgMutation = useMutation({
    mutationFn: async (data: any) => {
      return await apiRequest("POST", "/api/organizations", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/organizations"] });
      toast({
        title: "Successo",
        description: "Organizzazione creata con successo",
      });
      setNewOrgName("");
    },
    onError: () => {
      toast({
        title: "Errore",
        description: "Errore nella creazione dell'organizzazione",
        variant: "destructive",
      });
    },
  });

  const inviteUserMutation = useMutation({
    mutationFn: async (data: any) => {
      return await apiRequest("POST", `/api/organizations/${currentOrganization?.id}/invite`, data);
    },
    onSuccess: () => {
      toast({
        title: "Successo",
        description: "Invito inviato con successo",
      });
      setInviteEmail("");
    },
    onError: () => {
      toast({
        title: "Errore",
        description: "Errore nell'invio dell'invito",
        variant: "destructive",
      });
    },
  });

  const acceptInviteMutation = useMutation({
    mutationFn: async (token: string) => {
      return await apiRequest("POST", `/api/invitations/${token}/accept`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/organizations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/invitations"] });
      toast({
        title: "Successo",
        description: "Invito accettato con successo",
      });
    },
  });

  const handleCreateOrg = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newOrgName.trim()) return;
    
    createOrgMutation.mutate({
      name: newOrgName.trim(),
      description: `Organizzazione gestita da ${currentOrganization?.name}`,
    });
  };

  const handleInviteUser = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail.trim() || !currentOrganization) return;
    
    inviteUserMutation.mutate({
      email: inviteEmail.trim(),
      role: inviteRole,
      message: `Sei stato invitato a far parte dell'organizzazione ${currentOrganization.name}`,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Gestisci Organizzazioni</DialogTitle>
          <DialogDescription>
            Crea nuove organizzazioni, invita utenti e gestisci i tuoi inviti
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="organizations" className="space-y-4">
          <TabsList>
            <TabsTrigger value="organizations">Le mie Organizzazioni</TabsTrigger>
            <TabsTrigger value="invites">Inviti</TabsTrigger>
          </TabsList>

          <TabsContent value="organizations" className="space-y-4">
            {/* Current Organizations */}
            <div className="space-y-3">
              <h3 className="text-sm font-medium">Organizzazioni attuali</h3>
              <div className="space-y-2">
                {organizations.map((org) => (
                  <div
                    key={org.id}
                    className="flex items-center justify-between p-3 border rounded-lg"
                  >
                    <div className="flex items-center space-x-2">
                      <Building className="h-4 w-4" />
                      <span className="font-medium">{org.name}</span>
                      {org.id === currentOrganization?.id && (
                        <Badge variant="secondary">Corrente</Badge>
                      )}
                    </div>
                    <Badge variant="outline">{org.userRole}</Badge>
                  </div>
                ))}
              </div>
            </div>

            {/* Create New Organization */}
            <div className="space-y-3 pt-4 border-t">
              <h3 className="text-sm font-medium">Crea nuova organizzazione</h3>
              <form onSubmit={handleCreateOrg} className="flex space-x-2">
                <Input
                  placeholder="Nome organizzazione"
                  value={newOrgName}
                  onChange={(e) => setNewOrgName(e.target.value)}
                  className="flex-1"
                  data-testid="input-new-org-name"
                />
                <Button
                  type="submit"
                  disabled={createOrgMutation.isPending || !newOrgName.trim()}
                  data-testid="button-create-org"
                >
                  <Plus className="h-4 w-4 mr-1" />
                  Crea
                </Button>
              </form>
            </div>

            {/* Invite Users */}
            {currentOrganization && (currentOrganization.userRole === "admin" || currentOrganization.userRole === "owner") && (
              <div className="space-y-3 pt-4 border-t">
                <h3 className="text-sm font-medium">Invita utenti a {currentOrganization.name}</h3>
                <form onSubmit={handleInviteUser} className="space-y-2">
                  <div className="flex space-x-2">
                    <Input
                      type="email"
                      placeholder="Email utente"
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      className="flex-1"
                      data-testid="input-invite-email"
                    />
                    <select
                      value={inviteRole}
                      onChange={(e) => setInviteRole(e.target.value)}
                      className="px-3 py-2 border rounded-md"
                      data-testid="select-invite-role"
                    >
                      <option value="member">Membro</option>
                      <option value="admin">Admin</option>
                    </select>
                  </div>
                  <Button
                    type="submit"
                    disabled={inviteUserMutation.isPending || !inviteEmail.trim()}
                    className="w-full"
                    data-testid="button-send-invite"
                  >
                    <Mail className="h-4 w-4 mr-2" />
                    Invia Invito
                  </Button>
                </form>
              </div>
            )}
          </TabsContent>

          <TabsContent value="invites" className="space-y-4">
            <div className="space-y-3">
              <h3 className="text-sm font-medium">Inviti ricevuti</h3>
              {invitations.length === 0 ? (
                <p className="text-muted-foreground text-sm">Nessun invito pendente</p>
              ) : (
                <div className="space-y-2">
                  {invitations.map((invite: any) => (
                    <div
                      key={invite.id}
                      className="flex items-center justify-between p-3 border rounded-lg"
                    >
                      <div>
                        <p className="font-medium">
                          Invito a {invite.organizationName || "Organizzazione"}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          Ruolo: {invite.role}
                        </p>
                      </div>
                      <Button
                        onClick={() => acceptInviteMutation.mutate(invite.token)}
                        disabled={acceptInviteMutation.isPending}
                        size="sm"
                        data-testid={`button-accept-invite-${invite.id}`}
                      >
                        Accetta
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>

        <div className="flex justify-end pt-4">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            data-testid="button-close"
          >
            Chiudi
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}