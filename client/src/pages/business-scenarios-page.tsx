import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { getQueryFn, apiRequest, queryClient } from "@/lib/queryClient";
import { useOrganization } from "@/contexts/organization-context";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Plus, Trash2, Building, ArrowRight, Edit, RefreshCw } from "lucide-react";
import Sidebar from "@/components/layout/sidebar";
import Header from "@/components/layout/header";

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

const relationshipTypeLabels: Record<string, string> = {
  cliente_fattura: "Cliente Fattura",
  cliente_servizio: "Cliente Servizio",
  cliente_timesheet: "Cliente Timesheet",
  fornitore: "Fornitore",
  partner: "Partner",
  subappaltatore: "Subappaltatore",
};

const relationshipTypeColors: Record<string, string> = {
  cliente_fattura: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100",
  cliente_servizio: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-100",
  cliente_timesheet: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-100",
  fornitore: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-100",
  partner: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-100",
  subappaltatore: "bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-100",
};

export default function BusinessScenariosPage() {
  const [showForm, setShowForm] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [scenarioToDelete, setScenarioToDelete] = useState<BusinessScenario | null>(null);
  const [editingScenario, setEditingScenario] = useState<BusinessScenario | null>(null);
  const { toast } = useToast();
  const { currentOrganizationId } = useOrganization();

  const { data: scenarios, isLoading: loadingScenarios } = useQuery<BusinessScenario[]>({
    queryKey: ["/api/business-scenarios"],
    queryFn: getQueryFn({ on401: "throw" }),
    enabled: !!currentOrganizationId,
  });

  const { data: organizations } = useQuery<Organization[]>({
    queryKey: ["/api/organizations"],
    queryFn: getQueryFn({ on401: "throw" }),
  });

  const form = useForm<BusinessScenarioFormData>({
    resolver: zodResolver(businessScenarioSchema),
    defaultValues: {
      sourceOrganizationId: "",
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
      queryClient.invalidateQueries({ queryKey: ["/api/business-scenarios"] });
      setShowForm(false);
      form.reset();
      toast({ title: "Creato", description: "Scenario di business creato con successo" });
    },
    onError: () => {
      toast({ title: "Errore", description: "Impossibile creare lo scenario", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<BusinessScenarioFormData> }) =>
      apiRequest("PUT", `/api/business-scenarios/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/business-scenarios"] });
      setShowForm(false);
      setEditingScenario(null);
      form.reset();
      toast({ title: "Aggiornato", description: "Scenario di business aggiornato con successo" });
    },
    onError: () => {
      toast({ title: "Errore", description: "Impossibile aggiornare lo scenario", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/business-scenarios/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/business-scenarios"] });
      setShowDeleteDialog(false);
      setScenarioToDelete(null);
      toast({ title: "Eliminato", description: "Scenario di business eliminato con successo" });
    },
    onError: () => {
      toast({ title: "Errore", description: "Impossibile eliminare lo scenario", variant: "destructive" });
    },
  });

  const handleSubmit = (data: BusinessScenarioFormData) => {
    if (editingScenario) {
      updateMutation.mutate({ id: editingScenario.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const handleEdit = (scenario: BusinessScenario) => {
    setEditingScenario(scenario);
    form.reset({
      sourceOrganizationId: scenario.sourceOrganizationId,
      targetOrganizationId: scenario.targetOrganizationId,
      relationshipType: scenario.relationshipType as any,
      notes: scenario.notes || "",
      isActive: scenario.isActive,
    });
    setShowForm(true);
  };

  const handleDelete = (scenario: BusinessScenario) => {
    setScenarioToDelete(scenario);
    setShowDeleteDialog(true);
  };

  const handleOpenForm = () => {
    setEditingScenario(null);
    form.reset({
      sourceOrganizationId: currentOrganizationId || "",
      targetOrganizationId: "",
      relationshipType: "cliente_fattura",
      notes: "",
      isActive: true,
    });
    setShowForm(true);
  };

  const getOrgName = (id: string) => organizations?.find(o => o.id === id)?.name || id;

  const groupedScenarios = scenarios?.reduce((acc, scenario) => {
    const sourceOrg = getOrgName(scenario.sourceOrganizationId);
    if (!acc[sourceOrg]) {
      acc[sourceOrg] = [];
    }
    acc[sourceOrg].push(scenario);
    return acc;
  }, {} as Record<string, BusinessScenario[]>) || {};

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex-1 flex flex-col">
        <Header title="Scenari di Business" subtitle="Gestisci le relazioni tra le tue organizzazioni" />
        <main className="flex-1 p-6 overflow-auto">
          <div className="max-w-6xl mx-auto space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-bold" data-testid="text-page-title">Scenari di Business</h1>
                <p className="text-muted-foreground">
                  Gestisci le relazioni tra le tue organizzazioni
                </p>
              </div>
              <Button onClick={handleOpenForm} data-testid="button-new-scenario">
                <Plus className="h-4 w-4 mr-2" />
                Nuovo Scenario
              </Button>
            </div>

            {loadingScenarios ? (
              <div className="text-center py-8 text-muted-foreground">Caricamento...</div>
            ) : Object.keys(groupedScenarios).length === 0 ? (
              <Card>
                <CardContent className="text-center py-12">
                  <Building className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                  <h3 className="text-lg font-medium mb-2">Nessuno scenario di business</h3>
                  <p className="text-muted-foreground mb-4">
                    Crea uno scenario per definire le relazioni tra le tue organizzazioni
                  </p>
                  <Button onClick={handleOpenForm} data-testid="button-new-scenario-empty">
                    <Plus className="h-4 w-4 mr-2" />
                    Crea il primo scenario
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-6">
                {Object.entries(groupedScenarios).map(([sourceOrg, orgScenarios]) => (
                  <Card key={sourceOrg}>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Building className="h-5 w-5" />
                        {sourceOrg}
                      </CardTitle>
                      <CardDescription>
                        {orgScenarios.length} relazion{orgScenarios.length === 1 ? 'e' : 'i'} definit{orgScenarios.length === 1 ? 'a' : 'e'}
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        {orgScenarios.map((scenario) => (
                          <div
                            key={scenario.id}
                            className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                            data-testid={`scenario-${scenario.id}`}
                          >
                            <div className="flex items-center gap-4">
                              <div className="flex items-center gap-2">
                                <Badge className={relationshipTypeColors[scenario.relationshipType]}>
                                  {relationshipTypeLabels[scenario.relationshipType]}
                                </Badge>
                                {!scenario.isActive && (
                                  <Badge variant="outline" className="text-muted-foreground">
                                    Inattivo
                                  </Badge>
                                )}
                              </div>
                              <ArrowRight className="h-4 w-4 text-muted-foreground" />
                              <span className="font-medium">{getOrgName(scenario.targetOrganizationId)}</span>
                              {scenario.notes && (
                                <span className="text-sm text-muted-foreground ml-2">
                                  ({scenario.notes})
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleEdit(scenario)}
                                data-testid={`button-edit-${scenario.id}`}
                              >
                                <Edit className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleDelete(scenario)}
                                className="text-destructive hover:text-destructive"
                                data-testid={`button-delete-${scenario.id}`}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </main>
      </div>

      <Dialog open={showForm} onOpenChange={(open) => {
        setShowForm(open);
        if (!open) {
          setEditingScenario(null);
          form.reset();
        }
      }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingScenario ? "Modifica Scenario" : "Nuovo Scenario di Business"}
            </DialogTitle>
            <DialogDescription>
              Definisci una relazione tra due organizzazioni
            </DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="sourceOrganizationId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Organizzazione Sorgente</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-source-org">
                          <SelectValue placeholder="Seleziona organizzazione" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {organizations?.map((org) => (
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
                name="targetOrganizationId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Organizzazione Target</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-target-org">
                          <SelectValue placeholder="Seleziona organizzazione" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {organizations
                          ?.filter(org => org.id !== form.watch("sourceOrganizationId"))
                          .map((org) => (
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
                    <FormLabel>Tipo Relazione</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-relationship-type">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {Object.entries(relationshipTypeLabels).map(([value, label]) => (
                          <SelectItem key={value} value={value}>
                            {label}
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
                        placeholder="Note aggiuntive..."
                        data-testid="input-notes"
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
                  <FormItem className="flex items-center justify-between rounded-lg border p-3">
                    <div className="space-y-0.5">
                      <FormLabel>Attivo</FormLabel>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        data-testid="switch-active"
                      />
                    </FormControl>
                  </FormItem>
                )}
              />

              <div className="flex justify-end gap-2 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setShowForm(false);
                    setEditingScenario(null);
                    form.reset();
                  }}
                  data-testid="button-cancel"
                >
                  Annulla
                </Button>
                <Button
                  type="submit"
                  disabled={createMutation.isPending || updateMutation.isPending}
                  data-testid="button-submit"
                >
                  {(createMutation.isPending || updateMutation.isPending) && (
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  )}
                  {editingScenario ? "Salva Modifiche" : "Crea Scenario"}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Conferma eliminazione</AlertDialogTitle>
            <AlertDialogDescription>
              Sei sicuro di voler eliminare questo scenario di business?
              {scenarioToDelete && (
                <span className="block mt-2 font-medium">
                  {getOrgName(scenarioToDelete.sourceOrganizationId)} → {getOrgName(scenarioToDelete.targetOrganizationId)}
                  <br />
                  <Badge className={relationshipTypeColors[scenarioToDelete.relationshipType]}>
                    {relationshipTypeLabels[scenarioToDelete.relationshipType]}
                  </Badge>
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">Annulla</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => scenarioToDelete && deleteMutation.mutate(scenarioToDelete.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete"
            >
              {deleteMutation.isPending ? "Eliminando..." : "Elimina"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
