import { useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { type SapSystem, type Partner, type SystemCredentials } from "@shared/schema";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Loader2, Globe, Building, Key } from "lucide-react";

const formSchema = z.object({
  name: z.string().min(1, "Nome richiesto"),
  webLink: z.string().url("URL non valido").min(1, "Link richiesto"),
  partnerId: z.string().optional().nullable(),
  defaultCredentialId: z.string().optional().nullable(),
  description: z.string().optional(),
});

interface WebLinkFormProps {
  editingLink?: SapSystem | null;
  onSuccess?: () => void;
  onCancel?: () => void;
}

export default function WebLinkForm({ editingLink, onSuccess, onCancel }: WebLinkFormProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: partners } = useQuery<Partner[]>({
    queryKey: ["/api/partners/all"],
    queryFn: async () => {
      const res = await fetch("/api/partners/all", { credentials: "include" });
      if (!res.ok) throw new Error('Failed to fetch partners');
      return res.json();
    },
  });

  const { data: credentials } = useQuery<SystemCredentials[]>({
    queryKey: ["/api/system-credentials"],
    queryFn: async () => {
      const res = await fetch("/api/system-credentials", { credentials: "include" });
      if (!res.ok) throw new Error('Failed to fetch credentials');
      return res.json();
    },
  });

  const partnerOptions = useMemo(() => {
    const options = (partners || [])
      .map(p => ({ value: p.id, label: p.name }))
      .sort((a, b) => a.label.localeCompare(b.label, 'it'));
    return [{ value: "none", label: "Nessun partner" }, ...options];
  }, [partners]);

  const credentialOptions = useMemo(() => {
    const options = (credentials || [])
      .map(c => ({ value: c.id, label: `${c.systemName} - ${c.username}` }))
      .sort((a, b) => a.label.localeCompare(b.label, 'it'));
    return [{ value: "none", label: "Nessuna credenziale" }, ...options];
  }, [credentials]);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: editingLink?.name || "",
      webLink: (editingLink as any)?.webLink || "",
      partnerId: editingLink?.partnerId || undefined,
      defaultCredentialId: (editingLink as any)?.defaultCredentialId || undefined,
      description: editingLink?.description || "",
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: z.infer<typeof formSchema>) => {
      const payload = {
        ...data,
        partnerId: data.partnerId === "none" ? null : data.partnerId,
        defaultCredentialId: data.defaultCredentialId === "none" ? null : data.defaultCredentialId,
        connectionType: "weblink",
        systemId: "WEB",
        isActive: true,
      };
      
      const response = await fetch("/api/sap-systems", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || "Failed to create web link");
      }
      
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sap-systems"] });
      toast({ title: "Collegamento creato", description: "Il collegamento web è stato creato con successo." });
      onSuccess?.();
    },
    onError: (error: any) => {
      toast({ title: "Errore", description: error.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: z.infer<typeof formSchema>) => {
      const payload = {
        ...data,
        partnerId: data.partnerId === "none" ? null : data.partnerId,
        defaultCredentialId: data.defaultCredentialId === "none" ? null : data.defaultCredentialId,
        connectionType: "weblink",
      };
      
      const response = await fetch(`/api/sap-systems/${editingLink!.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || "Failed to update web link");
      }
      
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sap-systems"] });
      toast({ title: "Collegamento aggiornato", description: "Il collegamento web è stato aggiornato con successo." });
      onSuccess?.();
    },
    onError: (error: any) => {
      toast({ title: "Errore", description: error.message, variant: "destructive" });
    },
  });

  const onSubmit = (data: z.infer<typeof formSchema>) => {
    if (editingLink) {
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
              <FormLabel className="flex items-center gap-2">
                <Globe className="h-4 w-4 text-purple-600" />
                Nome Collegamento *
              </FormLabel>
              <FormControl>
                <Input placeholder="es. Portale Clienti, SAP Fiori" {...field} data-testid="input-name" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="webLink"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Link (URL) *</FormLabel>
              <FormControl>
                <Input 
                  type="url" 
                  placeholder="https://esempio.com/portale" 
                  {...field} 
                  data-testid="input-web-link" 
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
              <FormLabel className="flex items-center gap-2">
                <Building className="h-4 w-4" />
                Partner (opzionale)
              </FormLabel>
              <FormControl>
                <SearchableSelect
                  options={partnerOptions}
                  value={field.value || "none"}
                  onValueChange={field.onChange}
                  placeholder="Seleziona partner..."
                  searchPlaceholder="Cerca partner..."
                  emptyMessage="Nessun partner trovato."
                  data-testid="select-partner"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="defaultCredentialId"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="flex items-center gap-2">
                <Key className="h-4 w-4" />
                Credenziali di Default (opzionale)
              </FormLabel>
              <FormControl>
                <SearchableSelect
                  options={credentialOptions}
                  value={field.value || "none"}
                  onValueChange={field.onChange}
                  placeholder="Seleziona credenziali..."
                  searchPlaceholder="Cerca credenziali..."
                  emptyMessage="Nessuna credenziale trovata."
                  data-testid="select-credentials"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Note (opzionale)</FormLabel>
              <FormControl>
                <Textarea 
                  placeholder="Aggiungi note..." 
                  className="resize-none" 
                  rows={2}
                  {...field} 
                  data-testid="input-description"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="flex justify-end gap-2 pt-4">
          {onCancel && (
            <Button type="button" variant="outline" onClick={onCancel} data-testid="button-cancel">
              Annulla
            </Button>
          )}
          <Button type="submit" disabled={isPending} data-testid="button-submit">
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {editingLink ? "Aggiorna" : "Crea"} Collegamento
          </Button>
        </div>
      </form>
    </Form>
  );
}
