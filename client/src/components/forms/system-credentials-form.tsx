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
import { SearchableSelect } from "@/components/ui/searchable-select";
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
      userId: credential?.userId || "811b4ad2-6882-4a7d-afcd-57dfb7f0af51", // Current user ID
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

  // Real SAP systems with actual UUIDs from database (temporary until API 401 is fixed)
  const sapSystems = selectedSystemType === "sap" ? [
    // Real systems with proper UUIDs from database
    { id: "8854f105-1e44-46ab-bc1b-c74f0d60e59e", name: "Alperia.PRD", serverHost: "10.87.158.3" },
    { id: "1e841e98-6549-47d5-ad5d-b7033bea9da4", name: "Alperia.SBX", serverHost: "10.87.158.2" },
    { id: "77ea9cb5-f285-4728-83fc-2418795d9737", name: "Alperia.QUA", serverHost: "10.87.158.2" },
    { id: "445368c7-d062-4f3d-8661-ccada9b7235e", name: "Alperia.D4U", serverHost: "10.230.0.89" },
    { id: "7f31ef3e-56b7-42ea-aa37-3a686c129512", name: "Alperia.NWC", serverHost: "192.168.202.148" },
    { id: "acc821c3-b57c-4abc-83a3-db8b97781403", name: "Alperia.T4U", serverHost: "vhalpt4ucs.fra3.hec.corp.local" },
    { id: "c8d2d1a7-5461-429a-a380-d6a82044b2a4", name: "Hera.PR1", serverHost: "10.11.10.26" },
    { id: "72c41ce7-4d80-403e-ab9a-8adb3a4577b9", name: "Hera.PRQ", serverHost: "isuprq.service.intra" },
    { id: "56307313-32bf-452b-a240-3691089e5eae", name: "Hera.PRP", serverHost: "10.11.11.47" },
    { id: "83d9f112-8730-43bf-a4b3-426b9b37a229", name: "Hera.PQ4", serverHost: "isupq4.service.intra" },
    { id: "349cdfec-9f8e-464c-a434-61824221f8b8", name: "Hera.SV6", serverHost: "isuse6.service.intra" }, // ECCO SV6!
    { id: "2a17df43-bb64-47a6-98c5-02b768f81db9", name: "Edison.NUB", serverHost: "ewfdws4hal01.corp.awsedison.it" },
    { id: "78032808-27b9-4069-800e-77c1c3ec2937", name: "Edison.NUT", serverHost: "ewfrws4hal01.corp.awsedison.it" },
    { id: "ad8fac16-7d8f-4e47-9219-d08bd75659c6", name: "Edison.EUC", serverHost: "10.202.242.162" },
    { id: "7481bfce-ebb6-430b-9963-b56a3d7c7cfc", name: "Enel.REP", serverHost: "10.153.99.23" },
    { id: "ce0f902f-5fef-4586-b389-499c21b47130", name: "Enel.RED", serverHost: "10.154.133.39" },
    { id: "0f368277-a269-47cd-8088-6d6bb5522dd2", name: "Enel.REM", serverHost: "10.154.133.116" },
    { id: "5ab48393-911c-40d7-948e-629bf0c0d730", name: "Enel.REQ", serverHost: "12.1.1.1" },
    { id: "1b475623-b28f-4c80-84d0-32a042fd2a90", name: "CSI.PRD", serverHost: "10.102.229.46" },
    { id: "714f8fe3-affe-4ec6-81d1-14804a452b36", name: "CSI.DEV", serverHost: "10.102.229.63" },
    { id: "0eb72859-3283-4414-bf19-37037139ed1d", name: "CSI.SND", serverHost: "10.102.229.69" },
    { id: "7d3d8bb3-8da6-40ba-b1d0-415a706bc6f9", name: "Iren.SHS", serverHost: "172.25.255.223" },
    { id: "df61cdd2-0621-4f59-84ca-7d773441aa9f", name: "Iren.SHP", serverHost: "172.25.255.222" },
    { id: "a5f7c1ef-610e-46fc-9fe7-39758708f4fb", name: "Iren.SHC", serverHost: "saphshc02.master.local" },
    { id: "4c223f19-7988-4908-85e1-a2fcbbb64a04", name: "Iren.SM2", serverHost: "172.25.245.142" }
  ] : [];
  
  const vpnConnections: any[] = [];

  const mutation = useMutation({
    mutationFn: async (data: InsertSystemCredentials) => {
      const url = isEditing 
        ? `/api/system-credentials/${credential.id}`
        : "/api/system-credentials";
      const method = isEditing ? "PUT" : "POST";
      
      return apiRequest(method, url, data);
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
    console.log("Form submit triggered with data:", data);
    console.log("Form errors:", form.formState.errors);
    console.log("Form is valid:", form.formState.isValid);
    console.log("Mutation state:", { isPending: mutation.isPending, isError: mutation.isError });
    
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
          <form 
            onSubmit={(e) => {
              console.log("Form submit event triggered!");
              e.preventDefault();
              form.handleSubmit(onSubmit)(e);
            }} 
            className="space-y-6"
          >
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
              render={({ field }) => {
                // Prepare options for SearchableSelect
                const systemOptions = selectedSystemType === "sap" && Array.isArray(sapSystems) && sapSystems.length > 0
                  ? sapSystems.map((system: any) => ({
                      value: system.id,
                      label: system.name,
                      description: system.serverHost
                    }))
                  : [{ value: "temp-manual", label: `Inserimento manuale - aggiungi ${selectedSystemType.toUpperCase()}`, description: "Nessun sistema esistente trovato" }];

                return (
                  <FormItem>
                    <FormLabel>Sistema di Riferimento</FormLabel>
                    <FormControl>
                      <SearchableSelect
                        options={systemOptions}
                        value={field.value || undefined}
                        onValueChange={(value) => {
                          field.onChange(value);
                          // Auto-fill system name from selected system
                          const systems = selectedSystemType === "sap" ? sapSystems : vpnConnections;
                          const selectedSystem = Array.isArray(systems) ? systems.find((s: any) => s.id === value) : null;
                          if (selectedSystem) {
                            form.setValue("systemName", selectedSystem.name);
                          }
                        }}
                        placeholder="Seleziona sistema esistente"
                        searchPlaceholder="Cerca sistema per nome o IP..."
                        emptyMessage="Nessun sistema trovato con questo filtro."
                        data-testid="searchable-select-system-reference"
                        className="w-full"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                );
              }}
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
                onClick={(e) => {
                  console.log("Button clicked!");
                  console.log("Form state:", {
                    isValid: form.formState.isValid,
                    errors: form.formState.errors,
                    values: form.getValues()
                  });
                }}
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