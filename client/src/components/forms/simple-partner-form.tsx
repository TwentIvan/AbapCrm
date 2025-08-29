import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { insertPartnerSchema } from "@shared/schema";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Building2, User, Globe, FileText } from "lucide-react";

const simplePartnerSchema = insertPartnerSchema.extend({
  name: z.string().min(1, "Nome richiesto"),
  type: z.enum(["client", "vendor", "supplier", "partner"]),
  email: z.string().optional().default(""),
  phone: z.string().optional().default(""),
  company: z.string().optional().default(""),
  position: z.string().optional().default(""),
  address: z.string().optional().default(""),
  city: z.string().optional().default(""),
  postalCode: z.string().optional().default(""),
  country: z.string().default("IT"),
  fiscalCode: z.string().optional().default(""),
  vatNumber: z.string().optional().default(""),
  website: z.string().optional().default(""),
  notes: z.string().optional().default(""),
});

type FormData = z.infer<typeof simplePartnerSchema>;

interface SimplePartnerFormProps {
  onSuccess?: () => void;
}

export default function SimplePartnerForm({ onSuccess }: SimplePartnerFormProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const form = useForm<FormData>({
    resolver: zodResolver(simplePartnerSchema),
    defaultValues: {
      name: "",
      email: "",
      phone: "",
      company: "",
      position: "",
      address: "",
      city: "",
      postalCode: "",
      country: "IT",
      fiscalCode: "",
      vatNumber: "",
      website: "",
      notes: "",
      type: "client",
    },
  });

  const createPartnerMutation = useMutation({
    mutationFn: async (data: FormData) => {
      const partnerData = {
        name: data.name,
        type: data.type,
        email: data.email?.trim() || null,
        phone: data.phone?.trim() || null,
        company: data.company?.trim() || null,
        position: data.position?.trim() || null,
        address: data.address?.trim() || null,
        city: data.city?.trim() || null,
        postalCode: data.postalCode?.trim() || null,
        country: data.country || "IT",
        fiscalCode: data.fiscalCode?.trim() || null,
        vatNumber: data.vatNumber?.trim() || null,
        website: data.website?.trim() || null,
        notes: data.notes?.trim() || null,
        userId: user!.id
      };
      
      const res = await apiRequest("POST", "/api/partners", partnerData);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/partners"] });
      toast({ title: "Partner creato con successo!" });
      form.reset();
      onSuccess?.();
    },
    onError: (error: Error) => {
      toast({
        title: "Errore nella creazione del partner",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: FormData) => {
    if (!user) {
      toast({
        title: "Errore di autenticazione", 
        description: "Devi essere loggato per creare un partner",
        variant: "destructive"
      });
      return;
    }

    createPartnerMutation.mutate(data);
  };

  return (
    <div className="space-y-6">
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="h-5 w-5" />
                Informazioni Base
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                
                {/* Nome */}
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nome / Denominazione *</FormLabel>
                      <FormControl>
                        <Input 
                          {...field}
                          placeholder="Inserisci nome partner..."
                          data-testid="input-partner-name"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Tipo */}
                <FormField
                  control={form.control}
                  name="type"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Tipologia *</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-partner-type">
                            <SelectValue placeholder="Seleziona tipologia" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="client">Cliente</SelectItem>
                          <SelectItem value="vendor">Fornitore</SelectItem>
                          <SelectItem value="supplier">Supplier</SelectItem>
                          <SelectItem value="partner">Partner</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Email */}
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
                          placeholder="email@esempio.com"
                          data-testid="input-partner-email"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Telefono */}
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
                          data-testid="input-partner-phone"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Azienda */}
                <FormField
                  control={form.control}
                  name="company"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Azienda</FormLabel>
                      <FormControl>
                        <Input 
                          {...field}
                          placeholder="Nome azienda"
                          data-testid="input-partner-company"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Posizione */}
                <FormField
                  control={form.control}
                  name="position"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Posizione / Ruolo</FormLabel>
                      <FormControl>
                        <Input 
                          {...field}
                          placeholder="CEO, Manager, etc."
                          data-testid="input-partner-position"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

              </div>
            </CardContent>
          </Card>

          {/* Indirizzo */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="h-5 w-5" />
                Indirizzo e Localizzazione
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                
                {/* Indirizzo */}
                <FormField
                  control={form.control}
                  name="address"
                  render={({ field }) => (
                    <FormItem className="md:col-span-2">
                      <FormLabel>Indirizzo</FormLabel>
                      <FormControl>
                        <Input 
                          {...field}
                          placeholder="Via Roma 123"
                          data-testid="input-partner-address"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Città */}
                <FormField
                  control={form.control}
                  name="city"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Città</FormLabel>
                      <FormControl>
                        <Input 
                          {...field}
                          placeholder="Milano"
                          data-testid="input-partner-city"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* CAP */}
                <FormField
                  control={form.control}
                  name="postalCode"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>CAP</FormLabel>
                      <FormControl>
                        <Input 
                          {...field}
                          placeholder="20100"
                          data-testid="input-partner-postal-code"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Paese */}
                <FormField
                  control={form.control}
                  name="country"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Paese</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-partner-country">
                            <SelectValue placeholder="Seleziona paese" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="IT">Italia</SelectItem>
                          <SelectItem value="US">Stati Uniti</SelectItem>
                          <SelectItem value="DE">Germania</SelectItem>
                          <SelectItem value="FR">Francia</SelectItem>
                          <SelectItem value="ES">Spagna</SelectItem>
                          <SelectItem value="GB">Regno Unito</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

              </div>
            </CardContent>
          </Card>

          {/* Dati Fiscali */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Dati Fiscali e Website
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                
                {/* Codice Fiscale */}
                <FormField
                  control={form.control}
                  name="fiscalCode"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Codice Fiscale</FormLabel>
                      <FormControl>
                        <Input 
                          {...field}
                          placeholder="RSSMRA85M01H501Z"
                          data-testid="input-partner-fiscal-code"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Partita IVA */}
                <FormField
                  control={form.control}
                  name="vatNumber"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Partita IVA</FormLabel>
                      <FormControl>
                        <Input 
                          {...field}
                          placeholder="IT12345678901"
                          data-testid="input-partner-vat-number"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Website */}
                <FormField
                  control={form.control}
                  name="website"
                  render={({ field }) => (
                    <FormItem className="md:col-span-2">
                      <FormLabel>Sito Web</FormLabel>
                      <FormControl>
                        <Input 
                          {...field}
                          type="url"
                          placeholder="https://www.esempio.com"
                          data-testid="input-partner-website"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

              </div>
            </CardContent>
          </Card>

          {/* Note */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Globe className="h-5 w-5" />
                Note e Osservazioni
              </CardTitle>
            </CardHeader>
            <CardContent>
              <FormField
                control={form.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Note</FormLabel>
                    <FormControl>
                      <Textarea
                        {...field}
                        placeholder="Note aggiuntive, preferenze, requisiti speciali..."
                        className="min-h-[80px]"
                        data-testid="textarea-partner-notes"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          {/* Submit Button */}
          <div className="flex justify-end">
            <Button
              type="submit"
              disabled={createPartnerMutation.isPending}
              className="w-full md:w-auto"
              data-testid="button-submit-partner"
            >
              {createPartnerMutation.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Crea Partner
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}