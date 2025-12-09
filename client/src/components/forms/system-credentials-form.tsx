import { useState, useEffect, useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { useToast } from "@/hooks/use-toast";
import { insertSystemCredentialsSchema, type SystemCredentials, type SapSystem, type VpnConnection } from "@shared/schema";
import { apiRequest, queryClient, getQueryFn, getCurrentOrganizationId } from "@/lib/queryClient";
import { z } from "zod";

const frontendCredentialSchema = insertSystemCredentialsSchema.omit({ userId: true });
type FrontendCredentialData = z.infer<typeof frontendCredentialSchema>;

interface SystemCredentialsFormProps {
  credential?: SystemCredentials | null;
  onSuccess: () => void;
  onCancel: () => void;
}

export function SystemCredentialsForm({ credential, onSuccess, onCancel }: SystemCredentialsFormProps) {
  const { toast } = useToast();
  const currentOrganizationId = getCurrentOrganizationId();
  const isEditing = !!credential;

  const form = useForm<FrontendCredentialData>({
    resolver: zodResolver(frontendCredentialSchema),
    defaultValues: {
      username: credential?.username || "",
      password: credential?.password || "",
      systemType: credential?.systemType || "sap",
      systemId: credential?.systemId || undefined,
      systemName: credential?.systemName || "",
      webLink: (credential as any)?.webLink || "",
      expirationDate: credential?.expirationDate ? new Date(credential.expirationDate) : undefined,
      isActive: credential?.isActive ?? true,
      description: credential?.description || "",
      notes: credential?.notes || "",
    },
  });

  const selectedSystemType = form.watch("systemType");
  const selectedSystemId = form.watch("systemId");

  const { data: sapSystemsData } = useQuery<SapSystem[]>({
    queryKey: ["/api/sap-systems"],
    queryFn: getQueryFn({ on401: "throw" }),
    enabled: !!currentOrganizationId,
  });

  const { data: vpnConnectionsData } = useQuery<VpnConnection[]>({
    queryKey: ["/api/vpn-connections"],
    queryFn: getQueryFn({ on401: "throw" }),
    enabled: !!currentOrganizationId && selectedSystemType === "vpn",
  });

  const filteredSystems = useMemo(() => {
    if (!sapSystemsData) return [];
    
    if (selectedSystemType === "sap") {
      return sapSystemsData.filter(s => 
        s.connectionType === "sapgui" || 
        s.connectionType === "cloud" || 
        s.connectionType === "citrix"
      );
    } else if (selectedSystemType === "weblink") {
      return sapSystemsData.filter(s => s.connectionType === "weblink");
    }
    return [];
  }, [sapSystemsData, selectedSystemType]);

  const systemOptions = useMemo(() => {
    if (selectedSystemType === "vpn") {
      if (!vpnConnectionsData || vpnConnectionsData.length === 0) {
        return [{ value: "temp-manual", label: "Inserimento manuale - aggiungi VPN", description: "Nessuna VPN trovata" }];
      }
      return vpnConnectionsData
        .sort((a, b) => a.name.localeCompare(b.name))
        .map(vpn => ({
          value: vpn.id,
          label: vpn.name,
          description: vpn.serverHost || ""
        }));
    }

    if (filteredSystems.length === 0) {
      const typeLabel = selectedSystemType === "sap" ? "SAP" : "Web";
      return [{ value: "temp-manual", label: `Inserimento manuale - aggiungi ${typeLabel}`, description: `Nessun sistema ${typeLabel} trovato` }];
    }

    return filteredSystems
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(system => ({
        value: system.id,
        label: system.name,
        description: system.serverHost || system.webLink || ""
      }));
  }, [selectedSystemType, filteredSystems, vpnConnectionsData]);

  const selectedSystemUrl = useMemo(() => {
    if (selectedSystemType === "weblink" && selectedSystemId && selectedSystemId !== "temp-manual") {
      const system = filteredSystems.find(s => s.id === selectedSystemId);
      return system?.webLink || "";
    }
    return "";
  }, [selectedSystemType, selectedSystemId, filteredSystems]);

  useEffect(() => {
    if (selectedSystemId && selectedSystemId !== "temp-manual") {
      if (selectedSystemType === "vpn") {
        const vpn = vpnConnectionsData?.find(v => v.id === selectedSystemId);
        if (vpn) {
          form.setValue("systemName", vpn.name);
        }
      } else {
        const system = filteredSystems.find(s => s.id === selectedSystemId);
        if (system) {
          form.setValue("systemName", system.name);
          if (selectedSystemType === "weblink" && system.webLink) {
            form.setValue("webLink", system.webLink);
          }
        }
      }
    }
  }, [selectedSystemId, selectedSystemType, filteredSystems, vpnConnectionsData, form]);

  const mutation = useMutation({
    mutationFn: async (data: FrontendCredentialData) => {
      const url = isEditing 
        ? `/api/system-credentials/${credential.id}`
        : "/api/system-credentials";
      const method = isEditing ? "PUT" : "POST";
      
      const payload = {
        ...data,
        systemId: data.systemId === "temp-manual" ? null : data.systemId,
      };
      
      return apiRequest(method, url, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/system-credentials"] });
      
      toast({
        title: isEditing ? "Credenziali aggiornate" : "Credenziali create",
        description: isEditing 
          ? "Le credenziali sono state aggiornate con successo." 
          : "Le nuove credenziali sono state create con successo.",
      });
      onSuccess();
    },
    onError: (error) => {
      console.error("Mutation error:", error);
      toast({
        title: "Errore",
        description: `Impossibile ${isEditing ? "aggiornare" : "creare"} le credenziali.`,
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: FrontendCredentialData) => {
    console.log("Form submitted with data:", data);
    mutation.mutate(data);
  };

  const handleFormError = (errors: any) => {
    console.log("Form validation errors:", errors);
  };

  return (
    <Dialog open={true} onOpenChange={() => onCancel()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? "Modifica Credenziali" : "Nuove Credenziali Sistema"}
          </DialogTitle>
          <DialogDescription>
            {isEditing 
              ? "Modifica le credenziali esistenti per il sistema."
              : "Aggiungi nuove credenziali per un sistema SAP, VPN o Web."
            }
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit, handleFormError)} className="space-y-6">
            <FormField
              control={form.control}
              name="systemType"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tipo Sistema</FormLabel>
                  <Select 
                    onValueChange={(value) => {
                      field.onChange(value);
                      form.setValue("systemId", undefined);
                      form.setValue("systemName", "");
                      form.setValue("webLink", "");
                    }} 
                    defaultValue={field.value}
                    data-testid="select-system-type"
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Seleziona tipo" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="sap">SAP</SelectItem>
                      <SelectItem value="vpn">VPN</SelectItem>
                      <SelectItem value="weblink">Link Web</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="username"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Username</FormLabel>
                    <FormControl>
                      <Input 
                        {...field} 
                        placeholder="Username del sistema"
                        data-testid="input-username"
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
                        placeholder="Password del sistema"
                        data-testid="input-password"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="systemId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    Sistema di Riferimento 
                    {selectedSystemType === "sap" && " (Solo sistemi SAP)"}
                    {selectedSystemType === "vpn" && " (Solo connessioni VPN)"}
                    {selectedSystemType === "weblink" && " (Solo collegamenti Web)"}
                  </FormLabel>
                  <FormControl>
                    <SearchableSelect
                      options={systemOptions}
                      value={field.value || undefined}
                      onValueChange={field.onChange}
                      placeholder="Seleziona sistema esistente"
                      searchPlaceholder="Cerca sistema per nome..."
                      emptyMessage="Nessun sistema trovato con questo filtro."
                      data-testid="searchable-select-system-reference"
                      className="w-full"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {form.watch("systemId") === "temp-manual" && (
              <FormField
                control={form.control}
                name="systemName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nome Sistema</FormLabel>
                    <FormControl>
                      <Input 
                        {...field} 
                        placeholder={
                          selectedSystemType === "sap" ? "Es. PRD, DEV, QAS" : 
                          selectedSystemType === "weblink" ? "Es. Portale Cliente, Intranet" : 
                          "Es. Cliente VPN, Office VPN"
                        }
                        data-testid="input-system-name"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            {selectedSystemType === "weblink" && selectedSystemUrl && (
              <div className="p-3 bg-muted rounded-lg">
                <p className="text-sm text-muted-foreground">URL del sistema selezionato:</p>
                <p className="text-sm font-medium break-all">{selectedSystemUrl}</p>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="expirationDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Data Scadenza (opzionale)</FormLabel>
                    <FormControl>
                      <Input 
                        {...field}
                        type="date"
                        value={field.value ? new Date(field.value).toISOString().split('T')[0] : ''}
                        onChange={(e) => field.onChange(e.target.value ? new Date(e.target.value) : undefined)}
                        data-testid="input-expiration-date"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="isActive"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                    <div className="space-y-0.5">
                      <FormLabel className="text-base">Attivo</FormLabel>
                      <div className="text-sm text-muted-foreground">
                        Credenziali attualmente utilizzabili
                      </div>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        data-testid="switch-is-active"
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Descrizione (opzionale)</FormLabel>
                  <FormControl>
                    <Input 
                      {...field}
                      value={field.value || ""}
                      placeholder="Es. Admin user, Developer, Client VPN"
                      data-testid="input-description"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Note (opzionale)</FormLabel>
                  <FormControl>
                    <Textarea 
                      {...field}
                      value={field.value || ""}
                      placeholder="Note aggiuntive sulle credenziali..."
                      rows={3}
                      data-testid="textarea-notes"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex justify-end gap-2">
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
                disabled={mutation.isPending}
                data-testid="button-submit"
              >
                {mutation.isPending 
                  ? "Salvando..." 
                  : isEditing ? "Aggiorna" : "Crea"
                }
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
