import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { insertMessageSchema, type InsertMessage } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";

interface MessageFormProps {
  onSuccess?: () => void;
  defaultValues?: Partial<InsertMessage>;
}

const messageFormSchema = insertMessageSchema.extend({
  receivedAt: insertMessageSchema.shape.receivedAt.optional(),
});

export default function MessageForm({ onSuccess, defaultValues }: MessageFormProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const form = useForm<InsertMessage>({
    resolver: zodResolver(messageFormSchema),
    defaultValues: {
      type: "email",
      status: "unread",
      fromEmail: "",
      fromName: "",
      toEmail: "",
      toName: "",
      subject: "",
      body: "",
      htmlBody: "",
      messageId: "",
      attachments: [],
      receivedAt: new Date(),
      projectId: undefined,
      taskId: undefined,
      partnerId: undefined,
      confidenceScore: undefined,
      matchingReason: "",
      isManuallyVerified: false,
      ...defaultValues,
    },
  });

  const createMutation = useMutation({
    mutationFn: (data: InsertMessage) => apiRequest("POST", "/api/messages", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/messages"] });
      toast({
        title: "Messaggio creato",
        description: "Il messaggio è stato aggiunto con successo.",
      });
      form.reset();
      onSuccess?.();
    },
    onError: (error: Error) => {
      toast({
        title: "Errore",
        description: error.message || "Errore durante la creazione del messaggio.",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: InsertMessage) => {
    createMutation.mutate(data);
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6" data-testid="form-message">
        {/* Message Type */}
        <FormField
          control={form.control}
          name="type"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Tipo Messaggio</FormLabel>
              <Select onValueChange={field.onChange} defaultValue={field.value} data-testid="select-message-type">
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleziona tipo messaggio" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="email">Email</SelectItem>
                  <SelectItem value="chat">Chat</SelectItem>
                  <SelectItem value="sms">SMS</SelectItem>
                  <SelectItem value="other">Altro</SelectItem>
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Status */}
        <FormField
          control={form.control}
          name="status"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Stato</FormLabel>
              <Select onValueChange={field.onChange} defaultValue={field.value} data-testid="select-message-status">
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleziona stato" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="unread">Non letto</SelectItem>
                  <SelectItem value="read">Letto</SelectItem>
                  <SelectItem value="processed">Elaborato</SelectItem>
                  <SelectItem value="archived">Archiviato</SelectItem>
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* From Email */}
        <FormField
          control={form.control}
          name="fromEmail"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Email Mittente *</FormLabel>
              <FormControl>
                <Input 
                  placeholder="mittente@esempio.com" 
                  {...field} 
                  data-testid="input-from-email"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* From Name */}
        <FormField
          control={form.control}
          name="fromName"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Nome Mittente</FormLabel>
              <FormControl>
                <Input 
                  placeholder="Nome Mittente" 
                  {...field} 
                  value={field.value || ""}
                  data-testid="input-from-name"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* To Email */}
        <FormField
          control={form.control}
          name="toEmail"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Email Destinatario *</FormLabel>
              <FormControl>
                <Input 
                  placeholder="destinatario@esempio.com" 
                  {...field} 
                  data-testid="input-to-email"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* To Name */}
        <FormField
          control={form.control}
          name="toName"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Nome Destinatario</FormLabel>
              <FormControl>
                <Input 
                  placeholder="Nome Destinatario" 
                  {...field} 
                  value={field.value || ""}
                  data-testid="input-to-name"
                />
              </FormControl>
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
              <FormLabel>Oggetto</FormLabel>
              <FormControl>
                <Input 
                  placeholder="Oggetto del messaggio" 
                  {...field} 
                  value={field.value || ""}
                  data-testid="input-subject"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Body */}
        <FormField
          control={form.control}
          name="body"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Contenuto</FormLabel>
              <FormControl>
                <Textarea 
                  placeholder="Contenuto del messaggio..." 
                  className="min-h-[120px]" 
                  {...field} 
                  value={field.value || ""}
                  data-testid="textarea-body"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* HTML Body */}
        <FormField
          control={form.control}
          name="htmlBody"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Contenuto HTML (opzionale)</FormLabel>
              <FormControl>
                <Textarea 
                  placeholder="Contenuto HTML del messaggio..." 
                  className="min-h-[80px]" 
                  {...field} 
                  value={field.value || ""}
                  data-testid="textarea-html-body"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Message ID */}
        <FormField
          control={form.control}
          name="messageId"
          render={({ field }) => (
            <FormItem>
              <FormLabel>ID Messaggio (opzionale)</FormLabel>
              <FormControl>
                <Input 
                  placeholder="ID univoco del messaggio" 
                  {...field} 
                  value={field.value || ""}
                  data-testid="input-message-id"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="flex items-center justify-end space-x-2">
          <Button
            type="submit"
            disabled={createMutation.isPending}
            data-testid="button-submit"
          >
            {createMutation.isPending ? "Creazione..." : "Crea Messaggio"}
          </Button>
        </div>
      </form>
    </Form>
  );
}