import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, getQueryFn } from "@/lib/queryClient";
import { useOrganization } from "@/contexts/organization-context";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { insertContactSchema, type Contact, type Partner } from "@shared/schema";
import { z } from "zod";

const contactFormSchema = insertContactSchema.extend({
  name: z.string().min(1, "Il nome è obbligatorio"),
  email: z.string().email("Email non valida"),
  phone: z.string().optional(),
  position: z.string().optional(),
  company: z.string().optional(),
  notes: z.string().optional(),
  partnerId: z.string().optional(),
});

type ContactFormValues = z.infer<typeof contactFormSchema>;

interface ContactFormProps {
  contact?: Contact;
  onSuccess: () => void;
  onCancel: () => void;
}

export default function ContactForm({ contact, onSuccess, onCancel }: ContactFormProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { currentOrganizationId } = useOrganization();

  // Fetch partners for selection
  const { data: partners } = useQuery<Partner[]>({
    queryKey: ["/api/partners"],
    queryFn: getQueryFn({ on401: "throw" }),
    enabled: !!currentOrganizationId,
  });

  const form = useForm<ContactFormValues>({
    resolver: zodResolver(contactFormSchema),
    defaultValues: {
      name: contact?.name || "",
      email: contact?.email || "",
      phone: contact?.phone || "",
      position: contact?.position || "",
      company: contact?.company || "",
      notes: contact?.notes || "",
      partnerId: contact?.partnerId || "",
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: ContactFormValues) => {
      return await apiRequest("POST", "/api/contacts", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/contacts"] });
      toast({
        title: "Contatto creato",
        description: "Il contatto è stato creato con successo.",
      });
      onSuccess();
    },
    onError: (error: any) => {
      toast({
        title: "Errore",
        description: error.message || "Non è stato possibile creare il contatto.",
        variant: "destructive",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: ContactFormValues) => {
      return await apiRequest("PUT", `/api/contacts/${contact?.id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/contacts"] });
      toast({
        title: "Contatto aggiornato",
        description: "Il contatto è stato aggiornato con successo.",
      });
      onSuccess();
    },
    onError: (error: any) => {
      toast({
        title: "Errore",
        description: error.message || "Non è stato possibile aggiornare il contatto.",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: ContactFormValues) => {
    if (contact) {
      updateMutation.mutate(data);
    } else {
      createMutation.mutate(data);
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Nome *</FormLabel>
              <FormControl>
                <Input 
                  {...field} 
                  placeholder="Mario Rossi"
                  data-testid="input-contact-name"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Email *</FormLabel>
              <FormControl>
                <Input 
                  {...field} 
                  type="email"
                  placeholder="mario.rossi@example.com"
                  data-testid="input-contact-email"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="phone"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Telefono</FormLabel>
              <FormControl>
                <Input 
                  {...field} 
                  placeholder="+39 123 456 7890"
                  data-testid="input-contact-phone"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="position"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Ruolo</FormLabel>
              <FormControl>
                <Input 
                  {...field} 
                  placeholder="Project Manager"
                  data-testid="input-contact-position"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="company"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Azienda</FormLabel>
              <FormControl>
                <Input 
                  {...field} 
                  placeholder="Acme Corporation"
                  data-testid="input-contact-company"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="partnerId"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Partner Associato</FormLabel>
              <Select 
                onValueChange={field.onChange} 
                defaultValue={field.value}
              >
                <FormControl>
                  <SelectTrigger data-testid="select-contact-partner">
                    <SelectValue placeholder="Seleziona partner (opzionale)" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="">Nessun partner</SelectItem>
                  {partners?.map((partner) => (
                    <SelectItem key={partner.id} value={partner.id}>
                      {partner.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="notes"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Note</FormLabel>
              <FormControl>
                <Textarea 
                  {...field} 
                  placeholder="Note aggiuntive sul contatto..."
                  rows={3}
                  data-testid="input-contact-notes"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="flex gap-2 justify-end pt-4">
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            disabled={isPending}
            data-testid="button-cancel-contact"
          >
            Annulla
          </Button>
          <Button 
            type="submit" 
            disabled={isPending}
            data-testid="button-save-contact"
          >
            {isPending ? "Salvataggio..." : contact ? "Aggiorna" : "Crea"}
          </Button>
        </div>
      </form>
    </Form>
  );
}
