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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Building2 } from "lucide-react";

const simplePartnerSchema = insertPartnerSchema.extend({
  name: z.string().min(1, "Nome richiesto"),
  type: z.enum(["client", "vendor", "supplier", "partner"]),
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
      type: "client",
      country: "IT",
    },
  });

  const createPartnerMutation = useMutation({
    mutationFn: async (data: FormData) => {
      console.log('🚀 === SIMPLE FORM SUBMIT ===');
      console.log('📋 Data:', data);
      console.log('👤 User:', user);
      
      const partnerData = {
        name: data.name,
        type: data.type,
        email: data.email || null,
        phone: data.phone || null,
        company: data.company || null,
        country: data.country || "IT",
        userId: user!.id
      };
      
      console.log('📤 Sending to API:', partnerData);
      const res = await apiRequest("POST", "/api/partners", partnerData);
      return res.json();
    },
    onSuccess: () => {
      console.log('✅ Partner created successfully!');
      queryClient.invalidateQueries({ queryKey: ["/api/partners"] });
      toast({ title: "Partner creato con successo!" });
      form.reset();
      onSuccess?.();
    },
    onError: (error: Error) => {
      console.log('❌ Partner creation failed:', error);
      toast({
        title: "Errore nella creazione del partner",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: FormData) => {
    console.log('🎯 Form submit triggered');
    
    if (!user) {
      console.log('❌ No user authenticated');
      toast({
        title: "Errore di autenticazione", 
        description: "Devi essere loggato per creare un partner",
        variant: "destructive"
      });
      return;
    }

    console.log('🚀 Starting mutation...');
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
                Partner Semplice (Test)
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

              </div>
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