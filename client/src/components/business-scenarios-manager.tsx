import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { getQueryFn, apiRequest, queryClient } from "@/lib/queryClient";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Plus, Trash2, Building, ArrowRight } from "lucide-react";

const businessScenarioSchema = z.object({
  sourceOrganizationId: z.string().min(1, "Organizzazione sorgente richiesta"),
  targetOrganizationId: z.string().min(1, "Organizzazione target richiesta"),
  relationshipType: z.enum([
    "cliente_fattura",
    "cliente_servizio",
    "cliente_timesheet",
    "fornitore",
    "partner",
    "subappaltatore",
  ], { required_error: "Tipo relazione richiesto" }),
  notes: z.string().optional(),
  isActive: z.boolean().default(true),
});

type BusinessScenarioFormData = z.infer<typeof businessScenarioSchema>;

interface BusinessScenario {
  id: string;
  sourceOrganizationId: string;
  targetOrganizationId: string;
  relationshipType: string;
  notes?: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface Organization {
  id: string;
  name: string;
}

interface BusinessScenariosManagerProps {
  organizationId: string;
  organizationName: string;
}

const relationshipTypeLabels: Record<string, string> = {
  cliente_fattura: "Cliente Fattura",
  cliente_servizio: "Cliente Servizio",
  cliente_timesheet: "Cliente Timesheet",
  fornitore: "Fornitore",
  partner: "Partner",
  subappaltatore: "Subappaltatore",
};

export default function BusinessScenariosManager({ organizationId, organizationName }: BusinessScenariosManagerProps) {
  const [showForm, setShowForm] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [scenarioToDelete, setScenarioToDelete] = useState<BusinessScenario | null>(null);
  const { toast } = useToast();

  // Fetch business scenarios
  const { data: scenarios, isLoading: loadingScenarios } = useQuery<BusinessScenario[]>({
    queryKey: ["/api/business-scenarios", organizationId],
    queryFn: getQueryFn({ on401: "throw" }),
  });

  // Fetch all organizations for selection
  const { data: organizations } = useQuery<Organization[]>({
    queryKey: ["/api/organizations"],
    queryFn: getQueryFn({ on401: "throw" }),
  });

  const form = useForm<BusinessScenarioFormData>({
    resolver: zodResolver(businessScenarioSchema),
    defaultValues: {
      sourceOrganizationId: organizationId,
      targetOrganizationId: "",
      relationshipType: "cliente_fattura",
      notes: "",
      isActive: true,
    },
  });

  const createMutation = useMutation({
    mutationFn: (data: BusinessScenarioFormData) =>
      apiRequest("POST", "/api/business-scenarios", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/business-scenarios", organizationId] });
      setShowForm(false);
      form.reset();
      toast({ title: "Creato", description: "Scenario di business creato con successo" });
    },
    onError: () => {
      toast({ title: "Errore", description: "Impossibile creare lo scenario", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/business-scenarios/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/business-scenarios", organizationId] });
      setShowDeleteDialog(false);
      setScenarioToDelete(null);
      toast({ title: "Eliminato", description: "Scenario di business eliminato con successo" });
    },
    onError: () => {
      toast({ title: "Errore", description: "Impossibile eliminare lo scenario", variant: "destructive" });
    },
  });

  const handleSubmit = (data: BusinessScenarioFormData) => {
    createMutation.mutate(data);
  };

  const handleDelete = (scenario: BusinessScenario) => {
    setScenarioToDelete(scenario);
    setShowDeleteDialog(true);
  };

  const confirmDelete = () => {
    if (scenarioToDelete) {
      deleteMutation.mutate(scenarioToDelete.id);
    }
  };

  const getOrganizationName = (orgId: string) => {
    const org = organizations?.find((o) => o.id === orgId);
    return org?.name || "Sconosciuta";
  };

  // Filter out current organization from target options
  const availableOrganizations = organizations?.filter(
    (org) => org.id !== organizationId
  ) || [];

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold">Scenari di Business</h3>
        <Button onClick={() => setShowForm(true)} size="sm" data-testid="button-add-scenario">
          <Plus className="h-4 w-4 mr-2" />
          Nuovo Scenario
        </Button>
      </div>

      {loadingScenarios ? (
        <p className="text-muted-foreground">Caricamento...</p>
      ) : scenarios && scenarios.length > 0 ? (
        <div className="grid gap-4">
          {scenarios.map((scenario) => (
            <Card key={scenario.id}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-medium">
                    {relationshipTypeLabels[scenario.relationshipType]}
                  </CardTitle>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDelete(scenario)}
                    data-testid={`button-delete-scenario-${scenario.id}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex items-center space-x-2 text-sm">
                  <Building className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium">{organizationName}</span>
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium">
                    {getOrganizationName(scenario.targetOrganizationId)}
                  </span>
                </div>
                {scenario.notes && (
                  <p className="text-sm text-muted-foreground mt-2">{scenario.notes}</p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <p className="text-muted-foreground text-sm">Nessuno scenario di business configurato</p>
      )}

      {/* Create Scenario Dialog */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nuovo Scenario di Business</DialogTitle>
            <DialogDescription>
              Crea una relazione tra {organizationName} e un'altra organizzazione
            </DialogDescription>
          </DialogHeader>
          
          <Form {...form}>
            <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="targetOrganizationId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Organizzazione Target</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-target-organization">
                          <SelectValue placeholder="Seleziona organizzazione" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {availableOrganizations.map((org) => (
                          <SelectItem key={org.id} value={org.id}>
                            {org.name}
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
                name="relationshipType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tipo di Relazione</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-relationship-type">
                          <SelectValue placeholder="Seleziona tipo" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="cliente_fattura">Cliente Fattura</SelectItem>
                        <SelectItem value="cliente_servizio">Cliente Servizio</SelectItem>
                        <SelectItem value="cliente_timesheet">Cliente Timesheet</SelectItem>
                        <SelectItem value="fornitore">Fornitore</SelectItem>
                        <SelectItem value="partner">Partner</SelectItem>
                        <SelectItem value="subappaltatore">Subappaltatore</SelectItem>
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
                    <FormLabel>Note (opzionali)</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Aggiungi note o dettagli..."
                        {...field}
                        data-testid="input-scenario-notes"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="flex justify-end space-x-2 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowForm(false)}
                  data-testid="button-cancel-scenario"
                >
                  Annulla
                </Button>
                <Button type="submit" disabled={createMutation.isPending} data-testid="button-save-scenario">
                  {createMutation.isPending ? "Salvataggio..." : "Salva"}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Elimina Scenario</AlertDialogTitle>
            <AlertDialogDescription>
              Sei sicuro di voler eliminare questo scenario di business? Questa azione non può
              essere annullata.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete}>Elimina</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
