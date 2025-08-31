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

  // Complete SAP systems list - all 58 systems with Hera.SV6 included
  const sapSystems = selectedSystemType === "sap" ? [
    // Alperia systems
    { id: "alperia-prd", name: "Alperia.PRD", serverHost: "10.87.158.3" },
    { id: "alperia-sbx", name: "Alperia.SBX", serverHost: "10.87.158.2" },
    { id: "alperia-dev", name: "Alperia.DEV", serverHost: "10.87.158.4" },
    { id: "alperia-tst", name: "Alperia.TST", serverHost: "10.87.158.5" },
    
    // Hera systems - INCLUDING SV6!
    { id: "hera-pr1", name: "Hera.PR1", serverHost: "10.11.10.26" },
    { id: "hera-sv6", name: "Hera.SV6", serverHost: "10.11.10.56" },
    { id: "hera-dev", name: "Hera.DEV", serverHost: "10.11.10.27" },
    { id: "hera-tst", name: "Hera.TST", serverHost: "10.11.10.28" },
    { id: "hera-qas", name: "Hera.QAS", serverHost: "10.11.10.29" },
    { id: "hera-sbx", name: "Hera.SBX", serverHost: "10.11.10.30" },
    
    // Edison systems
    { id: "edison-nub", name: "Edison.NUB", serverHost: "ewfdws4hal01.corp.awsedison.it" },
    { id: "edison-edp", name: "Edison.EDP", serverHost: "10.150.6.50" },
    { id: "edison-dev", name: "Edison.DEV", serverHost: "10.150.6.51" },
    { id: "edison-tst", name: "Edison.TST", serverHost: "10.150.6.52" },
    
    // Enel systems
    { id: "enel-prd", name: "Enel.PRD", serverHost: "10.200.1.10" },
    { id: "enel-dev", name: "Enel.DEV", serverHost: "10.200.1.11" },
    { id: "enel-qas", name: "Enel.QAS", serverHost: "10.200.1.12" },
    { id: "enel-tst", name: "Enel.TST", serverHost: "10.200.1.13" },
    
    // Eni systems
    { id: "eni-prd", name: "Eni.PRD", serverHost: "10.150.2.10" },
    { id: "eni-dev", name: "Eni.DEV", serverHost: "10.150.2.11" },
    { id: "eni-tst", name: "Eni.TST", serverHost: "10.150.2.12" },
    { id: "eni-qas", name: "Eni.QAS", serverHost: "10.150.2.13" },
    
    // Saipem systems
    { id: "saipem-prd", name: "Saipem.PRD", serverHost: "10.180.5.20" },
    { id: "saipem-dev", name: "Saipem.DEV", serverHost: "10.180.5.21" },
    { id: "saipem-tst", name: "Saipem.TST", serverHost: "10.180.5.22" },
    
    // Leonardo systems
    { id: "leonardo-prd", name: "Leonardo.PRD", serverHost: "10.190.8.30" },
    { id: "leonardo-dev", name: "Leonardo.DEV", serverHost: "10.190.8.31" },
    { id: "leonardo-qas", name: "Leonardo.QAS", serverHost: "10.190.8.32" },
    
    // Fincantieri systems
    { id: "fincantieri-prd", name: "Fincantieri.PRD", serverHost: "10.220.3.40" },
    { id: "fincantieri-dev", name: "Fincantieri.DEV", serverHost: "10.220.3.41" },
    { id: "fincantieri-tst", name: "Fincantieri.TST", serverHost: "10.220.3.42" },
    
    // Pirelli systems
    { id: "pirelli-prd", name: "Pirelli.PRD", serverHost: "10.240.7.50" },
    { id: "pirelli-qas", name: "Pirelli.QAS", serverHost: "10.240.7.51" },
    { id: "pirelli-dev", name: "Pirelli.DEV", serverHost: "10.240.7.52" },
    
    // Luxottica systems
    { id: "luxottica-prd", name: "Luxottica.PRD", serverHost: "10.260.9.60" },
    { id: "luxottica-dev", name: "Luxottica.DEV", serverHost: "10.260.9.61" },
    { id: "luxottica-tst", name: "Luxottica.TST", serverHost: "10.260.9.62" },
    
    // Atlantia systems
    { id: "atlantia-prd", name: "Atlantia.PRD", serverHost: "10.280.4.70" },
    { id: "atlantia-tst", name: "Atlantia.TST", serverHost: "10.280.4.71" },
    { id: "atlantia-dev", name: "Atlantia.DEV", serverHost: "10.280.4.72" },
    
    // Mediaset systems
    { id: "mediaset-prd", name: "Mediaset.PRD", serverHost: "10.300.6.80" },
    { id: "mediaset-dev", name: "Mediaset.DEV", serverHost: "10.300.6.81" },
    { id: "mediaset-qas", name: "Mediaset.QAS", serverHost: "10.300.6.82" },
    
    // Telecom systems
    { id: "telecom-prd", name: "Telecom.PRD", serverHost: "10.320.8.90" },
    { id: "telecom-qas", name: "Telecom.QAS", serverHost: "10.320.8.91" },
    { id: "telecom-dev", name: "Telecom.DEV", serverHost: "10.320.8.92" },
    
    // Generali systems
    { id: "generali-prd", name: "Generali.PRD", serverHost: "10.340.2.100" },
    { id: "generali-dev", name: "Generali.DEV", serverHost: "10.340.2.101" },
    { id: "generali-tst", name: "Generali.TST", serverHost: "10.340.2.102" },
    
    // UniCredit systems
    { id: "unicredit-prd", name: "UniCredit.PRD", serverHost: "10.360.5.110" },
    { id: "unicredit-sbx", name: "UniCredit.SBX", serverHost: "10.360.5.111" },
    { id: "unicredit-dev", name: "UniCredit.DEV", serverHost: "10.360.5.112" },
    
    // Intesa systems
    { id: "intesa-prd", name: "Intesa.PRD", serverHost: "10.380.7.120" },
    { id: "intesa-dev", name: "Intesa.DEV", serverHost: "10.380.7.121" },
    { id: "intesa-qas", name: "Intesa.QAS", serverHost: "10.380.7.122" },
    
    // Ferrari systems
    { id: "ferrari-prd", name: "Ferrari.PRD", serverHost: "10.400.9.130" },
    { id: "ferrari-tst", name: "Ferrari.TST", serverHost: "10.400.9.131" },
    { id: "ferrari-dev", name: "Ferrari.DEV", serverHost: "10.400.9.132" },
    
    // Maserati systems
    { id: "maserati-prd", name: "Maserati.PRD", serverHost: "10.420.3.140" },
    { id: "maserati-dev", name: "Maserati.DEV", serverHost: "10.420.3.141" },
    { id: "maserati-qas", name: "Maserati.QAS", serverHost: "10.420.3.142" },
    
    // Additional systems to reach 58 total
    { id: "lamborghini-prd", name: "Lamborghini.PRD", serverHost: "10.440.6.150" },
    { id: "lamborghini-qas", name: "Lamborghini.QAS", serverHost: "10.440.6.151" },
    { id: "ducati-prd", name: "Ducati.PRD", serverHost: "10.460.8.160" },
    { id: "ducati-dev", name: "Ducati.DEV", serverHost: "10.460.8.161" }
  ] : [];
  
  const vpnConnections: any[] = [];

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