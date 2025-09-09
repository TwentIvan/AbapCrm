import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { Mail, Settings, CheckCircle, AlertCircle, Trash2, Plus, Edit, Power, Eye, EyeOff } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import type { EmailConfig, InsertEmailConfig } from "@shared/schema";

const emailConfigSchema = z.object({
  email: z.string().email("Inserisci un indirizzo email valido"),
  password: z.string().min(1, "La password è obbligatoria"),
  host: z.string().default("imap.gmail.com"),
  port: z.number().min(1).max(65535).default(993),
  tls: z.boolean().default(true),
  folders: z.array(z.string()).min(1, "Seleziona almeno una cartella").default(["INBOX"]),
});

type EmailConfigForm = z.infer<typeof emailConfigSchema>;

export default function EmailConfig() {
  const [showDialog, setShowDialog] = useState(false);
  const [editingConfig, setEditingConfig] = useState<EmailConfig | null>(null);
  const [configToDelete, setConfigToDelete] = useState<EmailConfig | null>(null);
  const [showPasswords, setShowPasswords] = useState<Record<string, boolean>>({});
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  // Query per ottenere tutte le configurazioni email
  const { data: emailConfigs = [], isLoading } = useQuery<EmailConfig[]>({
    queryKey: ["/api/email/configs"],
    enabled: !!user,
  });

  const form = useForm<EmailConfigForm>({
    resolver: zodResolver(emailConfigSchema),
    defaultValues: {
      email: "",
      password: "",
      host: "imap.gmail.com",
      port: 993,
      tls: true,
      folders: ["INBOX"],
    },
  });

  // Mutation per creare nuova configurazione
  const createMutation = useMutation({
    mutationFn: (data: EmailConfigForm) =>
      apiRequest("POST", "/api/email/configs", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/email/configs"] });
      toast({
        title: "Configurazione creata",
        description: "La configurazione email è stata salvata con successo.",
      });
      setShowDialog(false);
      form.reset();
    },
    onError: (error: Error) => {
      toast({
        title: "Errore",
        description: error.message || "Errore durante la creazione della configurazione.",
        variant: "destructive",
      });
    },
  });

  // Mutation per aggiornare configurazione
  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<EmailConfigForm> }) =>
      apiRequest("PUT", `/api/email/configs/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/email/configs"] });
      toast({
        title: "Configurazione aggiornata",
        description: "La configurazione email è stata modificata con successo.",
      });
      setShowDialog(false);
      setEditingConfig(null);
      form.reset();
    },
    onError: (error: Error) => {
      toast({
        title: "Errore",
        description: error.message || "Errore durante l'aggiornamento della configurazione.",
        variant: "destructive",
      });
    },
  });

  // Mutation per eliminare configurazione
  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      apiRequest("DELETE", `/api/email/configs/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/email/configs"] });
      toast({
        title: "Configurazione eliminata",
        description: "La configurazione email è stata rimossa.",
      });
      setConfigToDelete(null);
    },
    onError: (error: Error) => {
      toast({
        title: "Errore",
        description: error.message || "Errore durante l'eliminazione della configurazione.",
        variant: "destructive",
      });
    },
  });

  // Mutation per attivare/disattivare configurazione
  const toggleActiveMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      apiRequest("PUT", `/api/email/configs/${id}`, { isActive }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/email/configs"] });
      toast({
        title: isActive ? "Configurazione attivata" : "Configurazione disattivata",
        description: `La configurazione email è stata ${isActive ? 'attivata' : 'disattivata'}.`,
      });
    },
  });

  const onSubmit = (data: EmailConfigForm) => {
    if (editingConfig) {
      updateMutation.mutate({ id: editingConfig.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const handleEdit = (config: EmailConfig) => {
    setEditingConfig(config);
    form.reset({
      email: config.email,
      password: config.password,
      host: config.host,
      port: config.port,
      tls: config.tls,
      folders: config.folders,
    });
    setShowDialog(true);
  };

  const handleAdd = () => {
    setEditingConfig(null);
    form.reset();
    setShowDialog(true);
  };

  const togglePasswordVisibility = (configId: string) => {
    setShowPasswords(prev => ({
      ...prev,
      [configId]: !prev[configId]
    }));
  };

  const handleToggleActive = (config: EmailConfig) => {
    toggleActiveMutation.mutate({ id: config.id, isActive: !config.isActive });
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-center">
            <div className="text-muted-foreground">Caricamento configurazioni email...</div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Mail className="h-5 w-5" />
              <CardTitle>Configurazioni Email IMAP</CardTitle>
            </div>
            <Button 
              onClick={handleAdd}
              data-testid="button-add-email-config"
              size="sm"
              className="flex items-center gap-2"
            >
              <Plus className="h-4 w-4" />
              Aggiungi Configurazione
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {emailConfigs.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Mail className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Nessuna configurazione email trovata</p>
              <p className="text-sm">Aggiungi la tua prima configurazione per iniziare a monitorare le email.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {emailConfigs.map((config) => (
                <div
                  key={config.id}
                  className={`p-4 border rounded-lg ${
                    config.isActive ? 'bg-green-50 border-green-200' : 'bg-gray-50 border-gray-200'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1 space-y-2">
                      <div className="flex items-center gap-3">
                        <div className="font-medium">{config.email}</div>
                        <Badge 
                          variant={config.isActive ? "default" : "secondary"}
                          className={config.isActive ? "bg-green-500" : ""}
                        >
                          {config.isActive ? (
                            <>
                              <CheckCircle className="h-3 w-3 mr-1" />
                              Attiva
                            </>
                          ) : (
                            <>
                              <AlertCircle className="h-3 w-3 mr-1" />
                              Inattiva
                            </>
                          )}
                        </Badge>
                      </div>
                      
                      <div className="text-sm text-muted-foreground space-y-1">
                        <div>Host: {config.host}:{config.port} {config.tls ? "(TLS)" : "(Non sicuro)"}</div>
                        <div>Cartelle: {config.folders.join(", ")}</div>
                        <div className="flex items-center gap-2">
                          Password: 
                          {showPasswords[config.id] ? (
                            <span className="font-mono text-xs bg-gray-100 px-2 py-1 rounded">
                              {config.password}
                            </span>
                          ) : (
                            <span className="font-mono text-xs">••••••••</span>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => togglePasswordVisibility(config.id)}
                            data-testid={`button-toggle-password-${config.id}`}
                            className="h-6 px-2"
                          >
                            {showPasswords[config.id] ? (
                              <EyeOff className="h-3 w-3" />
                            ) : (
                              <Eye className="h-3 w-3" />
                            )}
                          </Button>
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleToggleActive(config)}
                        data-testid={`button-toggle-active-${config.id}`}
                        disabled={toggleActiveMutation.isPending}
                      >
                        <Power className="h-4 w-4" />
                      </Button>
                      
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleEdit(config)}
                        data-testid={`button-edit-${config.id}`}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setConfigToDelete(config)}
                        data-testid={`button-delete-${config.id}`}
                        className="text-red-600 hover:text-red-700"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dialog per aggiunta/modifica configurazione */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingConfig ? "Modifica Configurazione Email" : "Aggiungi Configurazione Email"}
            </DialogTitle>
          </DialogHeader>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        type="email"
                        placeholder="nome@gmail.com"
                        data-testid="input-email"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Password</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        type="password"
                        placeholder="Password o App Password"
                        data-testid="input-password"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="host"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Host IMAP</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder="imap.gmail.com"
                        data-testid="input-host"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="port"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Porta</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        type="number"
                        placeholder="993"
                        onChange={(e) => field.onChange(parseInt(e.target.value))}
                        data-testid="input-port"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="folders"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Cartelle da monitorare</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        value={field.value.join(", ")}
                        onChange={(e) => field.onChange(e.target.value.split(",").map(f => f.trim()).filter(Boolean))}
                        placeholder="INBOX, Sent, Drafts"
                        data-testid="input-folders"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="flex justify-end space-x-2 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowDialog(false)}
                  data-testid="button-cancel"
                >
                  Annulla
                </Button>
                <Button
                  type="submit"
                  data-testid="button-save"
                  disabled={createMutation.isPending || updateMutation.isPending}
                >
                  {createMutation.isPending || updateMutation.isPending
                    ? "Salvataggio..."
                    : editingConfig
                    ? "Aggiorna"
                    : "Salva"}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Dialog di conferma eliminazione */}
      <AlertDialog open={!!configToDelete} onOpenChange={() => setConfigToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Elimina Configurazione</AlertDialogTitle>
            <AlertDialogDescription>
              Sei sicuro di voler eliminare la configurazione email per {configToDelete?.email}?
              Questa azione non può essere annullata.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">
              Annulla
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => configToDelete && deleteMutation.mutate(configToDelete.id)}
              data-testid="button-confirm-delete"
              className="bg-red-600 hover:bg-red-700"
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? "Eliminazione..." : "Elimina"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}