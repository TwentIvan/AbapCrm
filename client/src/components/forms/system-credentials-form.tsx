import { useState, useEffect } from "react";
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
import { useToast } from "@/hooks/use-toast";
import { insertSystemCredentialsSchema, type SystemCredentials, type InsertSystemCredentials } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";

interface SystemCredentialsFormProps {
  credential?: SystemCredentials | null;
  onSuccess: () => void;
  onCancel: () => void;
}

export function SystemCredentialsForm({ credential, onSuccess, onCancel }: SystemCredentialsFormProps) {
  const { toast } = useToast();
  const isEditing = !!credential;

  const form = useForm<InsertSystemCredentials>({
    resolver: zodResolver(insertSystemCredentialsSchema),
    defaultValues: {
      username: credential?.username || "",
      password: credential?.password || "",
      systemType: credential?.systemType || "sap",
      systemId: credential?.systemId || undefined,
      systemName: credential?.systemName || "",
      expirationDate: credential?.expirationDate ? new Date(credential.expirationDate) : undefined,
      isActive: credential?.isActive ?? true,
      description: credential?.description || "",
      notes: credential?.notes || "",
    },
  });

  const selectedSystemType = form.watch("systemType");

  // Fetch available systems for reference - only load what exists
  const { data: sapSystems = [], isLoading: sapLoading, error: sapError } = useQuery({
    queryKey: ["/api/sap-systems"],
    enabled: selectedSystemType === "sap", // Solo se tipo SAP selezionato
    onSuccess: (data) => {
      console.log("SAP Systems loaded:", data?.length || 0);
    },
    onError: (error) => {
      console.error("SAP Systems error:", error);
    }
  });

  const { data: vpnConnections = [] } = useQuery({
    queryKey: ["/api/vpn-connections"],  
    enabled: false // VPN table doesn't exist yet
  });

  const mutation = useMutation({
    mutationFn: async (data: InsertSystemCredentials) => {
      const url = isEditing 
        ? `/api/system-credentials/${credential.id}`
        : "/api/system-credentials";
      const method = isEditing ? "PUT" : "POST";
      
      return apiRequest(url, method, data);
    },
    onSuccess: () => {
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

  const onSubmit = (data: InsertSystemCredentials) => {
    mutation.mutate(data);
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
              : "Aggiungi nuove credenziali per un sistema SAP o VPN."
            }
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <FormField
              control={form.control}
              name="systemType"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tipo Sistema</FormLabel>
                  <Select 
                    onValueChange={field.onChange} 
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
                  <FormLabel>Sistema di Riferimento</FormLabel>
                  <Select 
                    onValueChange={(value) => {
                      field.onChange(value);
                      // Auto-fill system name from selected system  
                      const systems = selectedSystemType === "sap" ? sapSystems : vpnConnections;
                      const selectedSystem = Array.isArray(systems) ? systems.find((s: any) => s.id === value) : null;
                      if (selectedSystem) {
                        form.setValue("systemName", selectedSystem.name);
                      }
                    }} 
                    defaultValue={field.value || undefined}
                    data-testid="select-system-reference"
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Seleziona sistema esistente" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {selectedSystemType === "sap" && Array.isArray(sapSystems) && sapSystems.length > 0 ? (
                        // Mostra sistemi SAP esistenti
                        sapSystems.map((system: any) => (
                          <SelectItem key={system.id} value={system.id}>
                            {system.name} ({system.serverHost || system.host})
                          </SelectItem>
                        ))
                      ) : selectedSystemType === "vpn" && Array.isArray(vpnConnections) && vpnConnections.length > 0 ? (
                        // Mostra connessioni VPN esistenti
                        vpnConnections.map((vpn: any) => (
                          <SelectItem key={vpn.id} value={vpn.id}>
                            {vpn.name} ({vpn.serverHost || vpn.host})
                          </SelectItem>
                        ))
                      ) : (
                        // Fallback per inserimento manuale
                        <SelectItem value="temp-manual">Inserimento manuale - nessun {selectedSystemType.toUpperCase()} nel sistema</SelectItem>
                      )}
                    </SelectContent>
                  </Select>
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
                        placeholder={selectedSystemType === "sap" ? "Es. PRD, DEV, QAS" : "Es. Cliente VPN, Office VPN"}
                        data-testid="input-system-name"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
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