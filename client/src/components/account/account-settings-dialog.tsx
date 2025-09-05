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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest, getQueryFn } from "@/lib/queryClient";
import { Mail, Trash2, Plus, Power, PowerOff, HelpCircle, ExternalLink } from "lucide-react";
import type { EmailConfig } from "@shared/schema";

interface AccountSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function AccountSettingsDialog({ open, onOpenChange }: AccountSettingsDialogProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [formData, setFormData] = useState({
    firstName: user?.firstName || "",
    lastName: user?.lastName || "",
    email: user?.email || "",
  });
  
  const [activeTab, setActiveTab] = useState("account");
  const [showEmailForm, setShowEmailForm] = useState(false);
  const [editingConfig, setEditingConfig] = useState<EmailConfig | null>(null);
  const [deleteConfigId, setDeleteConfigId] = useState<string | null>(null);
  
  const [emailFormData, setEmailFormData] = useState({
    email: "",
    password: "",
    host: "imap.gmail.com",
    port: 993,
    tls: true,
    folders: ["INBOX"],
  });

  const updateUserMutation = useMutation({
    mutationFn: async (data: any) => {
      return await apiRequest("PUT", `/api/users/${user?.id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      toast({
        title: "Successo",
        description: "Impostazioni account aggiornate",
      });
      onOpenChange(false);
    },
    onError: () => {
      toast({
        title: "Errore",
        description: "Errore nell'aggiornamento delle impostazioni",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateUserMutation.mutate(formData);
  };

  const handleChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  // Get email configurations
  const { data: emailConfigs = [], isLoading: isLoadingConfigs } = useQuery<EmailConfig[]>({
    queryKey: ["/api/email/configs"],
    queryFn: getQueryFn({ on401: "throw" }),
    enabled: open,
  });

  // Delete email configuration mutation
  const deleteConfigMutation = useMutation({
    mutationFn: async (configId: string) => {
      return await apiRequest("DELETE", `/api/email/configs/${configId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/email/configs"] });
      toast({
        title: "Successo",
        description: "Configurazione email eliminata",
      });
      setDeleteConfigId(null);
    },
    onError: () => {
      toast({
        title: "Errore",
        description: "Errore nell'eliminazione della configurazione",
        variant: "destructive",
      });
    },
  });

  // Create/Update email configuration mutation
  const saveEmailConfigMutation = useMutation({
    mutationFn: async (data: any) => {
      if (editingConfig) {
        return await apiRequest("PUT", `/api/email/configs/${editingConfig.id}`, data);
      } else {
        return await apiRequest("POST", `/api/email/configs`, data);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/email/configs"] });
      toast({
        title: "Successo",
        description: editingConfig ? "Configurazione aggiornata" : "Configurazione creata",
      });
      setShowEmailForm(false);
      setEditingConfig(null);
      resetEmailForm();
    },
    onError: () => {
      toast({
        title: "Errore",
        description: "Errore nel salvataggio della configurazione",
        variant: "destructive",
      });
    },
  });

  // Activate email configuration mutation
  const activateConfigMutation = useMutation({
    mutationFn: async (configId: string) => {
      return await apiRequest("POST", `/api/email/configs/${configId}/activate`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/email/configs"] });
      toast({
        title: "Successo",
        description: "Configurazione email attivata",
      });
    },
    onError: () => {
      toast({
        title: "Errore",
        description: "Errore nell'attivazione della configurazione",
        variant: "destructive",
      });
    },
  });

  const resetEmailForm = () => {
    setEmailFormData({
      email: "",
      password: "",
      host: "imap.gmail.com",
      port: 993,
      tls: true,
      folders: ["INBOX"],
    });
  };

  const handleEmailFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    saveEmailConfigMutation.mutate(emailFormData);
  };

  const handleEditConfig = (config: EmailConfig) => {
    setEditingConfig(config);
    setEmailFormData({
      email: config.email,
      password: config.password,
      host: config.host,
      port: config.port,
      tls: config.tls,
      folders: config.folders,
    });
    setShowEmailForm(true);
  };

  const handleNewConfig = () => {
    setEditingConfig(null);
    resetEmailForm();
    setShowEmailForm(true);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[95vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Impostazioni Account</DialogTitle>
          <DialogDescription>
            Gestisci le informazioni del tuo account e le configurazioni email
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="account">Informazioni Account</TabsTrigger>
            <TabsTrigger value="email">Configurazioni Email</TabsTrigger>
          </TabsList>
          
          <TabsContent value="account" className="space-y-4">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="firstName">Nome</Label>
                <Input
                  id="firstName"
                  value={formData.firstName}
                  onChange={(e) => handleChange("firstName", e.target.value)}
                  data-testid="input-first-name"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="lastName">Cognome</Label>
                <Input
                  id="lastName"
                  value={formData.lastName}
                  onChange={(e) => handleChange("lastName", e.target.value)}
                  data-testid="input-last-name"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => handleChange("email", e.target.value)}
                  data-testid="input-email"
                />
              </div>

              <div className="flex justify-end space-x-2 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => onOpenChange(false)}
                  data-testid="button-cancel"
                >
                  Annulla
                </Button>
                <Button
                  type="submit"
                  data-testid="button-save"
                  disabled={updateUserMutation.isPending}
                >
                  {updateUserMutation.isPending ? "Salvataggio..." : "Salva"}
                </Button>
              </div>
            </form>
          </TabsContent>
          
          <TabsContent value="email" className="space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-medium">Configurazioni Email</h3>
              <Button onClick={handleNewConfig} size="sm" data-testid="button-new-email-config">
                <Plus className="h-4 w-4 mr-2" />
                Nuova Configurazione
              </Button>
            </div>
            
            {isLoadingConfigs ? (
              <p>Caricamento configurazioni...</p>
            ) : (
              <div className="grid gap-4 max-h-96 overflow-y-auto">
                {emailConfigs.map((config: EmailConfig) => (
                  <Card key={config.id} className="relative">
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Mail className="h-4 w-4" />
                          <CardTitle className="text-base">{config.email}</CardTitle>
                          {config.isActive && (
                            <Badge variant="default" className="bg-green-500">
                              Attiva
                            </Badge>
                          )}
                        </div>
                        <div className="flex gap-2">
                          {!config.isActive && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => activateConfigMutation.mutate(config.id)}
                              disabled={activateConfigMutation.isPending}
                              data-testid={`button-activate-${config.id}`}
                            >
                              <Power className="h-4 w-4" />
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleEditConfig(config)}
                            data-testid={`button-edit-${config.id}`}
                          >
                            Modifica
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setDeleteConfigId(config.id)}
                            data-testid={`button-delete-${config.id}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="text-sm text-muted-foreground space-y-1">
                        <p><strong>Host:</strong> {config.host}:{config.port}</p>
                        <p><strong>Cartelle:</strong> {config.folders.join(", ") || "INBOX"}</p>
                        <p><strong>TLS:</strong> {config.tls ? "Sì" : "No"}</p>
                      </div>
                    </CardContent>
                  </Card>
                ))}
                
                {emailConfigs.length === 0 && (
                  <Card>
                    <CardContent className="pt-6">
                      <p className="text-center text-muted-foreground">
                        Nessuna configurazione email presente.
                        <br />
                        Clicca "Nuova Configurazione" per aggiungerne una.
                      </p>
                    </CardContent>
                  </Card>
                )}
              </div>
            )}
            
            {/* Email Configuration Form */}
            {showEmailForm && (
              <Card>
                <CardHeader>
                  <CardTitle>
                    {editingConfig ? "Modifica Configurazione" : "Nuova Configurazione Email"}
                  </CardTitle>
                  <CardDescription>
                    Configura la connessione IMAP per sincronizzare le email.
                    <br />
                    <strong>Importante:</strong> Per Gmail/Outlook, devi generare una "App Password" dalle impostazioni del tuo account, non usare la password normale.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handleEmailFormSubmit} className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="email">Email</Label>
                        <Input
                          id="email"
                          type="email"
                          value={emailFormData.email}
                          onChange={(e) => setEmailFormData(prev => ({ ...prev, email: e.target.value }))}
                          data-testid="input-config-email"
                          required
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="password">App Password</Label>
                        <Input
                          id="password"
                          type="password"
                          value={emailFormData.password}
                          onChange={(e) => setEmailFormData(prev => ({ ...prev, password: e.target.value }))}
                          placeholder="Non la password normale, ma l'App Password"
                          data-testid="input-config-password"
                          required
                        />
                        <div className="text-xs text-muted-foreground space-y-1">
                          <p>⚠️ <strong>Non usare la password normale!</strong> Genera una App Password dal tuo account email.</p>
                          <details className="mt-2">
                            <summary className="cursor-pointer text-blue-600 hover:text-blue-800 flex items-center gap-1">
                              <HelpCircle className="h-3 w-3" />
                              Come generare App Password
                            </summary>
                            <div className="mt-2 p-2 bg-muted rounded text-xs space-y-2">
                              <div>
                                <strong>Gmail:</strong> Account Google → Sicurezza → Verifica in due passaggi → Password per le app
                              </div>
                              <div>
                                <strong>Outlook:</strong> Account Microsoft → Sicurezza → Opzioni di sicurezza avanzate → Password per le app
                              </div>
                              <div>
                                <strong>Altri provider:</strong> Cerca "App Password" o "Password applicazione" nelle impostazioni
                              </div>
                            </div>
                          </details>
                        </div>
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-3 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="host">Host IMAP</Label>
                        <Input
                          id="host"
                          value={emailFormData.host}
                          onChange={(e) => setEmailFormData(prev => ({ ...prev, host: e.target.value }))}
                          data-testid="input-config-host"
                          required
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="port">Porta</Label>
                        <Input
                          id="port"
                          type="number"
                          value={emailFormData.port}
                          onChange={(e) => setEmailFormData(prev => ({ ...prev, port: parseInt(e.target.value) }))}
                          data-testid="input-config-port"
                          required
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="folders">Cartelle (separate da virgola)</Label>
                        <Input
                          id="folders"
                          value={emailFormData.folders.join(", ")}
                          onChange={(e) => setEmailFormData(prev => ({ 
                            ...prev, 
                            folders: e.target.value.split(",").map(f => f.trim()).filter(f => f.length > 0)
                          }))}
                          placeholder="INBOX, CRM, Support"
                          data-testid="input-config-folders"
                        />
                      </div>
                    </div>
                    
                    <div className="flex justify-end space-x-2">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => {
                          setShowEmailForm(false);
                          setEditingConfig(null);
                          resetEmailForm();
                        }}
                        data-testid="button-cancel-email-form"
                      >
                        Annulla
                      </Button>
                      <Button
                        type="submit"
                        disabled={saveEmailConfigMutation.isPending}
                        data-testid="button-save-email-config"
                      >
                        {saveEmailConfigMutation.isPending ? "Salvando..." : "Salva"}
                      </Button>
                    </div>
                  </form>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
        
        {/* Delete Confirmation Dialog */}
        <AlertDialog open={!!deleteConfigId} onOpenChange={() => setDeleteConfigId(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Conferma Eliminazione</AlertDialogTitle>
              <AlertDialogDescription>
                Sei sicuro di voler eliminare questa configurazione email? Questa azione non può essere annullata.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Annulla</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => deleteConfigId && deleteConfigMutation.mutate(deleteConfigId)}
                className="bg-destructive text-destructive-foreground"
              >
                Elimina
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </DialogContent>
    </Dialog>
  );
}