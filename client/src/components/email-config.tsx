import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { Mail, Settings, CheckCircle, AlertCircle, Unplug } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

const emailConfigSchema = z.object({
  email: z.string().email("Inserisci un indirizzo email valido"),
  password: z.string().min(8, "La password deve essere di almeno 8 caratteri"),
  folder: z.string().optional(),
});

type EmailConfigForm = z.infer<typeof emailConfigSchema>;

interface EmailStatus {
  connected: boolean;
  status: string;
}

export default function EmailConfig() {
  const [showConfig, setShowConfig] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: emailStatus } = useQuery<EmailStatus | null>({
    queryKey: ["/api/email/status"],
    refetchInterval: 5000, // Check status every 5 seconds
    retry: false, // Don't retry on auth errors
    refetchOnWindowFocus: false,
  });

  const form = useForm<EmailConfigForm>({
    resolver: zodResolver(emailConfigSchema),
    defaultValues: {
      email: "",
      password: "",
      folder: "INBOX",
    },
  });

  const configureMutation = useMutation({
    mutationFn: (data: EmailConfigForm) => 
      apiRequest("/api/email/configure", "POST", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/email/status"] });
      toast({
        title: "Configurazione completata",
        description: "Il servizio email è stato configurato e sta monitorando la cartella.",
      });
      setShowConfig(false);
      form.reset();
    },
    onError: (error: Error) => {
      toast({
        title: "Errore di configurazione",
        description: error.message || "Errore durante la configurazione del servizio email.",
        variant: "destructive",
      });
    },
  });

  const disconnectMutation = useMutation({
    mutationFn: () => apiRequest("/api/email/disconnect", "POST"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/email/status"] });
      toast({
        title: "Disconnesso",
        description: "Il servizio email è stato disconnesso.",
      });
    },
  });

  const onSubmit = (data: EmailConfigForm) => {
    configureMutation.mutate(data);
  };

  const isConnected = emailStatus?.connected || false;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Configurazione Email IMAP
          </div>
          {isConnected ? (
            <Badge variant="secondary" className="bg-green-500 text-white">
              <CheckCircle className="h-3 w-3 mr-1" />
              Connesso
            </Badge>
          ) : (
            <Badge variant="secondary" className="bg-gray-500 text-white">
              <AlertCircle className="h-3 w-3 mr-1" />
              Non configurato
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {!isConnected && !showConfig && (
          <div className="text-center space-y-4">
            <div className="flex justify-center">
              <Mail className="h-16 w-16 text-muted-foreground opacity-50" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground mb-4">
                Configura Gmail per ricevere automaticamente le email inoltrate nel tuo CRM.
              </p>
              <Button onClick={() => setShowConfig(true)} data-testid="button-configure-email">
                <Settings className="h-4 w-4 mr-2" />
                Configura Gmail
              </Button>
            </div>
          </div>
        )}

        {!isConnected && showConfig && (
          <div className="space-y-4">
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                <strong>Importante:</strong> Per Gmail devi usare una "App Password" invece della password normale.
                <br />
                <a 
                  href="https://support.google.com/mail/answer/185833" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:underline"
                >
                  Guida per creare App Password Gmail →
                </a>
              </AlertDescription>
            </Alert>

            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" data-testid="form-email-config">
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Indirizzo Email Gmail</FormLabel>
                      <FormControl>
                        <Input 
                          placeholder="tuo.email@gmail.com" 
                          {...field}
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
                      <FormLabel>App Password Gmail</FormLabel>
                      <FormControl>
                        <Input 
                          type="password" 
                          placeholder="xxxx xxxx xxxx xxxx" 
                          {...field}
                          data-testid="input-password"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="folder"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Cartella da Monitorare</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value} data-testid="select-folder">
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Seleziona cartella" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="INBOX">INBOX (Posta in arrivo)</SelectItem>
                          <SelectItem value="[Gmail]/All Mail">Tutti i messaggi</SelectItem>
                          <SelectItem value="CRM">CRM (etichetta personalizzata)</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="flex items-center justify-end space-x-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setShowConfig(false)}
                    data-testid="button-cancel"
                  >
                    Annulla
                  </Button>
                  <Button
                    type="submit"
                    disabled={configureMutation.isPending}
                    data-testid="button-save-config"
                  >
                    {configureMutation.isPending ? "Connessione..." : "Connetti"}
                  </Button>
                </div>
              </form>
            </Form>
          </div>
        )}

        {isConnected && (
          <div className="space-y-4">
            <div className="text-center space-y-2">
              <CheckCircle className="h-12 w-12 mx-auto text-green-500" />
              <div>
                <p className="font-medium text-green-700">Gmail configurato con successo!</p>
                <p className="text-sm text-muted-foreground">
                  Il sistema sta monitorando la tua cartella email ogni 2 minuti.
                </p>
              </div>
            </div>

            <Alert>
              <Mail className="h-4 w-4" />
              <AlertDescription>
                <strong>Come usare:</strong>
                <br />
                1. Crea un'etichetta "CRM" in Gmail (opzionale)
                <br />
                2. Inoltra o sposta le email che vuoi processare nella cartella monitorata
                <br />
                3. Il sistema le analizzerà automaticamente con l'AI ogni 2 minuti
              </AlertDescription>
            </Alert>

            <div className="text-center">
              <Button
                variant="outline"
                onClick={() => disconnectMutation.mutate()}
                disabled={disconnectMutation.isPending}
                data-testid="button-disconnect"
              >
                <Unplug className="h-4 w-4 mr-2" />
                {disconnectMutation.isPending ? "Disconnessione..." : "Disconnetti"}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}