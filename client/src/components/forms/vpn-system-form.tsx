import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { insertVpnSystemsSchema, type VpnSystems, type Partner, type VpnSoftware } from "@shared/schema";

const formSchema = insertVpnSystemsSchema.extend({
  partnerId: z.string().optional(),
  vpnSoftwareId: z.string().optional(),
}).omit({ userId: true });

type VpnSystemFormData = z.infer<typeof formSchema>;

interface VpnSystemFormProps {
  system?: VpnSystems | null;
  onSuccess: () => void;
  onCancel: () => void;
}

export default function VpnSystemForm({ system, onSuccess, onCancel }: VpnSystemFormProps) {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<VpnSystemFormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: system?.name || "",
      serverHost: system?.serverHost || "",
      serverPort: system?.serverPort || null,
      connectionProfile: system?.connectionProfile || "client-to-site",
      status: system?.status || "inactive",
      description: system?.description || "",
      partnerId: system?.partnerId || undefined,
      vpnSoftwareId: system?.vpnSoftwareId || undefined,
      username: system?.username || "",
      notes: system?.notes || "",
      configNotes: system?.configNotes || "",
      autoStart: system?.autoStart || false,
    },
  });

  // Fetch partners for dropdown
  const { data: partners = [] } = useQuery<Partner[]>({
    queryKey: ["/api/partners"],
    queryFn: async () => {
      const res = await fetch("/api/partners", { credentials: "include" });
      if (!res.ok) throw new Error('Failed to fetch partners');
      return res.json();
    },
  });

  // Fetch VPN software for dropdown
  const { data: vpnSoftware = [] } = useQuery<VpnSoftware[]>({
    queryKey: ["/api/vpn-software"],
    queryFn: async () => {
      const res = await fetch("/api/vpn-software", { credentials: "include" });
      if (!res.ok) throw new Error('Failed to fetch VPN software');
      return res.json();
    },
  });

  const createMutation = useMutation({
    mutationFn: (data: VpnSystemFormData) => 
      apiRequest("POST", "/api/vpn-systems", data),
    onSuccess: () => {
      toast({ title: "Successo", description: "Sistema VPN creato con successo" });
      onSuccess();
    },
    onError: (error) => {
      console.error("Create error:", error);
      toast({ 
        title: "Errore", 
        description: "Errore durante la creazione del sistema VPN",
        variant: "destructive"
      });
    }
  });

  const updateMutation = useMutation({
    mutationFn: (data: VpnSystemFormData) => 
      apiRequest("PUT", `/api/vpn-systems/${system?.id}`, data),
    onSuccess: () => {
      toast({ title: "Successo", description: "Sistema VPN aggiornato con successo" });
      onSuccess();
    },
    onError: (error) => {
      console.error("Update error:", error);
      toast({ 
        title: "Errore", 
        description: "Errore durante l'aggiornamento del sistema VPN",
        variant: "destructive"
      });
    }
  });

  const onSubmit = async (data: VpnSystemFormData) => {
    setIsSubmitting(true);
    try {
      // Clean up empty strings to null
      const cleanData = {
        ...data,
        partnerId: data.partnerId || null,
        vpnSoftwareId: data.vpnSoftwareId || null,
        description: data.description || null,
      };

      if (system) {
        await updateMutation.mutateAsync(cleanData);
      } else {
        await createMutation.mutateAsync(cleanData);
      }
    } catch (error) {
      console.error("Submit error:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Nome Sistema *</FormLabel>
                <FormControl>
                  <Input 
                    placeholder="es. VPN Cliente ABC"
                    data-testid="input-name"
                    {...field} 
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="status"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Stato</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <FormControl>
                    <SelectTrigger data-testid="select-status">
                      <SelectValue placeholder="Seleziona stato" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="active">Attivo</SelectItem>
                    <SelectItem value="inactive">Inattivo</SelectItem>
                    <SelectItem value="error">Errore</SelectItem>
                    <SelectItem value="connecting">Connessione</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="serverHost"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Indirizzo Server *</FormLabel>
                <FormControl>
                  <Input 
                    placeholder="es. vpn.example.com o 192.168.1.1"
                    data-testid="input-server-host"
                    {...field} 
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="serverPort"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Porta</FormLabel>
                <FormControl>
                  <Input 
                    type="number"
                    placeholder="es. 1723, 443"
                    data-testid="input-server-port"
                    {...field}
                    value={field.value || ""}
                    onChange={(e) => field.onChange(e.target.value ? parseInt(e.target.value) : null)}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="connectionProfile"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Profilo Connessione</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <FormControl>
                    <SelectTrigger data-testid="select-connection-profile">
                      <SelectValue placeholder="Seleziona profilo" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="site-to-site">Site-to-Site</SelectItem>
                    <SelectItem value="client-to-site">Client-to-Site</SelectItem>
                    <SelectItem value="ssl-vpn">SSL VPN</SelectItem>
                    <SelectItem value="ipsec">IPSec</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="vpnSoftwareId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Software VPN</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <FormControl>
                    <SelectTrigger data-testid="select-vpn-software">
                      <SelectValue placeholder="Seleziona software" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="">Nessuno</SelectItem>
                    {vpnSoftware.map((software) => (
                      <SelectItem key={software.id} value={software.id}>
                        {software.vendor} {software.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="partnerId"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Partner</FormLabel>
              <Select onValueChange={field.onChange} defaultValue={field.value}>
                <FormControl>
                  <SelectTrigger data-testid="select-partner">
                    <SelectValue placeholder="Seleziona partner" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="">Nessun partner</SelectItem>
                  {partners.map((partner) => (
                    <SelectItem key={partner.id} value={partner.id}>
                      {partner.name} {partner.company && `(${partner.company})`}
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
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Descrizione</FormLabel>
              <FormControl>
                <Textarea 
                  placeholder="Descrizione opzionale del sistema VPN..."
                  data-testid="textarea-description"
                  {...field}
                  value={field.value || ""}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="flex justify-end gap-3">
          <Button 
            type="button" 
            variant="outline" 
            onClick={onCancel}
            data-testid="button-cancel"
          >
            Annulla
          </Button>
          <Button 
            type="submit" 
            disabled={isSubmitting}
            data-testid="button-submit"
          >
            {isSubmitting ? "Salvando..." : (system ? "Aggiorna" : "Crea")}
          </Button>
        </div>
      </form>
    </Form>
  );
}