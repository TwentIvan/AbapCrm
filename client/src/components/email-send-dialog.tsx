import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, getQueryFn } from "@/lib/queryClient";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Send, User, Mail, MessageSquare, Paperclip, CheckCircle, AlertCircle } from "lucide-react";

interface EmailSender {
  email: string;
  name: string;
  isMain: boolean;
  isForwarder: boolean;
}

const emailSendSchema = z.object({
  from: z.string().email().optional(),
  to: z.string().min(1, "Destinatario richiesto"),
  subject: z.string().min(1, "Oggetto richiesto"),
  text: z.string().optional(),
  html: z.string().optional(),
  replyTo: z.string().email().optional(),
});

type EmailSendForm = z.infer<typeof emailSendSchema>;

interface EmailSendDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EmailSendDialog({ open, onOpenChange }: EmailSendDialogProps) {
  const [activeTab, setActiveTab] = useState<"compose" | "test">("compose");
  const [lastSentResult, setLastSentResult] = useState<{ success: boolean; message: string } | null>(null);
  
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch available senders
  const { data: senders, isLoading: sendersLoading } = useQuery<EmailSender[]>({
    queryKey: ["/api/email/senders"],
    queryFn: getQueryFn({ on401: "throw" }),
    enabled: open,
  });

  const form = useForm<EmailSendForm>({
    resolver: zodResolver(emailSendSchema),
    defaultValues: {
      from: "",
      to: "",
      subject: "",
      text: "",
      html: "",
      replyTo: "",
    },
  });

  // Initialize Gmail service
  const initializeGmailMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/email/initialize-gmail", {}),
    onSuccess: () => {
      toast({
        title: "Servizio Gmail inizializzato",
        description: "Il servizio di invio è pronto per l'uso.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Errore inizializzazione",
        description: error.message || "Errore durante l'inizializzazione del servizio Gmail",
        variant: "destructive",
      });
    },
  });

  // Send email mutation
  const sendEmailMutation = useMutation({
    mutationFn: (data: EmailSendForm) => apiRequest("POST", "/api/email/send", data),
    onSuccess: () => {
      setLastSentResult({ success: true, message: "Email inviata con successo" });
      toast({
        title: "Email inviata",
        description: "La tua email è stata inviata con successo.",
      });
      form.reset();
      setActiveTab("test");
    },
    onError: (error: any) => {
      setLastSentResult({ success: false, message: error.message || "Errore durante l'invio" });
      toast({
        title: "Errore invio email",
        description: error.message || "Si è verificato un errore durante l'invio",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: EmailSendForm) => {
    // Convert multiple recipients
    const recipients = data.to.split(/[,;]/).map(email => email.trim()).filter(Boolean);
    
    sendEmailMutation.mutate({
      ...data,
      to: recipients.join(", "),
      // Use HTML if provided, otherwise convert text to HTML
      html: data.html || (data.text ? `<p>${data.text.replace(/\n/g, '<br>')}</p>` : ""),
    });
  };

  const handleInitializeGmail = () => {
    initializeGmailMutation.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Send className="h-5 w-5" />
            Invia Email
          </DialogTitle>
          <DialogDescription>
            Invia email tramite Gmail usando i tuoi account configurati
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as any)} className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="compose" className="flex items-center gap-2">
              <MessageSquare className="h-4 w-4" />
              Scrivi Email
            </TabsTrigger>
            <TabsTrigger value="test" className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4" />
              Test & Configurazione
            </TabsTrigger>
          </TabsList>

          <TabsContent value="compose" className="space-y-4">
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Sender Selection */}
                  <FormField
                    control={form.control}
                    name="from"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="flex items-center gap-2">
                          <User className="h-4 w-4" />
                          Da (opzionale)
                        </FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Account predefinito" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="">Account predefinito</SelectItem>
                            {senders?.map((sender) => (
                              <SelectItem key={sender.email} value={sender.email}>
                                <div className="flex items-center gap-2">
                                  <span>{sender.email}</span>
                                  {sender.isMain && <Badge variant="default" className="text-xs">Principale</Badge>}
                                  {sender.isForwarder && <Badge variant="secondary" className="text-xs">Inoltrante</Badge>}
                                </div>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* Reply-To */}
                  <FormField
                    control={form.control}
                    name="replyTo"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="flex items-center gap-2">
                          <Mail className="h-4 w-4" />
                          Rispondi a (opzionale)
                        </FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="reply@example.com" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                {/* Recipients */}
                <FormField
                  control={form.control}
                  name="to"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="flex items-center gap-2">
                        <Mail className="h-4 w-4" />
                        A (destinatari) *
                      </FormLabel>
                      <FormControl>
                        <Input 
                          {...field} 
                          placeholder="email1@example.com, email2@example.com"
                          className="font-mono text-sm"
                        />
                      </FormControl>
                      <p className="text-xs text-muted-foreground">
                        Separa più destinatari con virgole o punto e virgola
                      </p>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Subject */}
                <FormField
                  control={form.control}
                  name="subject"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Oggetto *</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="Oggetto dell'email" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <Separator />

                <div className="space-y-4">
                  <Label className="text-base font-medium">Contenuto Email</Label>
                  
                  {/* Text Content */}
                  <FormField
                    control={form.control}
                    name="text"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Testo Semplice</FormLabel>
                        <FormControl>
                          <Textarea 
                            {...field} 
                            placeholder="Scrivi qui il contenuto dell'email..."
                            rows={6}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* HTML Content */}
                  <FormField
                    control={form.control}
                    name="html"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>HTML (opzionale)</FormLabel>
                        <FormControl>
                          <Textarea 
                            {...field} 
                            placeholder="<p>Contenuto HTML per email formattate...</p>"
                            rows={4}
                            className="font-mono text-sm"
                          />
                        </FormControl>
                        <p className="text-xs text-muted-foreground">
                          Se non specificato, il testo semplice sarà convertito automaticamente
                        </p>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="flex justify-end gap-2 pt-4">
                  <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                    Annulla
                  </Button>
                  <Button 
                    type="submit" 
                    disabled={sendEmailMutation.isPending}
                    className="flex items-center gap-2"
                  >
                    {sendEmailMutation.isPending ? (
                      <>
                        <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-r-transparent" />
                        Invio...
                      </>
                    ) : (
                      <>
                        <Send className="h-4 w-4" />
                        Invia Email
                      </>
                    )}
                  </Button>
                </div>
              </form>
            </Form>
          </TabsContent>

          <TabsContent value="test" className="space-y-4">
            <div className="grid gap-4">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <CheckCircle className="h-5 w-5" />
                    Stato Servizio Gmail
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <Button
                    onClick={handleInitializeGmail}
                    disabled={initializeGmailMutation.isPending}
                    className="w-full"
                  >
                    {initializeGmailMutation.isPending ? (
                      <>
                        <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-r-transparent mr-2" />
                        Inizializzazione...
                      </>
                    ) : (
                      <>
                        <Mail className="h-4 w-4 mr-2" />
                        Inizializza Servizio Gmail
                      </>
                    )}
                  </Button>
                  
                  {lastSentResult && (
                    <div className={`p-3 rounded-lg border ${
                      lastSentResult.success 
                        ? "bg-green-50 border-green-200 text-green-800" 
                        : "bg-red-50 border-red-200 text-red-800"
                    }`}>
                      <div className="flex items-center gap-2">
                        {lastSentResult.success ? (
                          <CheckCircle className="h-4 w-4" />
                        ) : (
                          <AlertCircle className="h-4 w-4" />
                        )}
                        <span className="font-medium">
                          {lastSentResult.success ? "Successo" : "Errore"}
                        </span>
                      </div>
                      <p className="mt-1 text-sm">{lastSentResult.message}</p>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Account Mittente Disponibili</CardTitle>
                </CardHeader>
                <CardContent>
                  {sendersLoading ? (
                    <div className="space-y-2">
                      <div className="h-4 bg-gray-200 rounded animate-pulse" />
                      <div className="h-4 bg-gray-200 rounded animate-pulse w-3/4" />
                    </div>
                  ) : senders && senders.length > 0 ? (
                    <div className="space-y-2">
                      {senders.map((sender) => (
                        <div key={sender.email} className="flex items-center justify-between p-2 border rounded">
                          <span className="font-mono text-sm">{sender.email}</span>
                          <div className="flex gap-1">
                            {sender.isMain && <Badge variant="default">Principale</Badge>}
                            {sender.isForwarder && <Badge variant="secondary">Inoltrante</Badge>}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-muted-foreground">
                      Nessun account email configurato. Configura almeno un account Gmail attivo.
                    </p>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}