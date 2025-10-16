import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, getQueryFn } from "@/lib/queryClient";
import { insertProjectAssignmentSchema, type ProjectAssignment, type Project, type HumanResource } from "@shared/schema";
import { useOrganization } from "@/contexts/organization-context";
import { Users, DollarSign, Calendar, FileText } from "lucide-react";

// Form schema
const formSchema = insertProjectAssignmentSchema.extend({
  title: z.string().min(1, "Titolo richiesto"),
  projectId: z.string().min(1, "Progetto richiesto"),
  resourceId: z.string().min(1, "Risorsa richiesta"),
  engagementType: z.enum(["fixed", "hourly"]),
  startDate: z.string().min(1, "Data inizio richiesta"),
  endDate: z.string().optional(),
  fixedAmount: z.string().optional(),
  hourlyRate: z.string().optional(),
  estimatedHours: z.string().optional(),
  status: z.enum(["assigned", "active", "completed", "cancelled"]).optional(),
  currency: z.string().optional(),
  description: z.string().optional(),
  notes: z.string().optional(),
}).omit({ userId: true, organizationId: true });

type ProjectAssignmentFormData = z.infer<typeof formSchema>;

interface ProjectAssignmentFormProps {
  assignment?: ProjectAssignment;
  onSuccess?: () => void;
}

export default function ProjectAssignmentForm({ assignment, onSuccess }: ProjectAssignmentFormProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { currentOrganizationId } = useOrganization();

  const { data: projects = [] } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
    queryFn: getQueryFn({ on401: "throw" }),
    enabled: !!currentOrganizationId,
    staleTime: 5 * 60 * 1000,
  });

  const { data: resources = [] } = useQuery<HumanResource[]>({
    queryKey: ["/api/human-resources"],
    queryFn: getQueryFn({ on401: "throw" }),
    enabled: !!currentOrganizationId,
    staleTime: 5 * 60 * 1000,
  });

  const form = useForm<ProjectAssignmentFormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      title: assignment?.title || "",
      description: assignment?.description || "",
      projectId: assignment?.projectId || "",
      resourceId: assignment?.resourceId || "",
      engagementType: assignment?.engagementType || "fixed",
      fixedAmount: assignment?.fixedAmount || "",
      hourlyRate: assignment?.hourlyRate || "",
      estimatedHours: assignment?.estimatedHours || "",
      currency: assignment?.currency || "EUR",
      status: assignment?.status || "assigned",
      startDate: assignment?.startDate ? new Date(assignment.startDate).toISOString().split('T')[0] : "",
      endDate: assignment?.endDate ? new Date(assignment.endDate).toISOString().split('T')[0] : "",
      notes: assignment?.notes || "",
    },
  });

  const engagementType = form.watch("engagementType");

  const createMutation = useMutation({
    mutationFn: async (data: ProjectAssignmentFormData) => {
      const payload = {
        ...data,
        fixedAmount: data.fixedAmount ? parseFloat(data.fixedAmount) : undefined,
        hourlyRate: data.hourlyRate ? parseFloat(data.hourlyRate) : undefined,
        estimatedHours: data.estimatedHours ? parseFloat(data.estimatedHours) : undefined,
        startDate: data.startDate ? new Date(data.startDate).toISOString() : undefined,
        endDate: data.endDate ? new Date(data.endDate).toISOString() : undefined,
      };
      return await apiRequest("POST", "/api/project-assignments", payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/project-assignments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/purchase-orders"] }); // Invalidate POs too
      toast({
        title: "Creato",
        description: "Assegnazione creata con successo. Purchase Order generato automaticamente.",
      });
      form.reset();
      onSuccess?.();
    },
    onError: (error: Error) => {
      toast({
        title: "Errore",
        description: error.message || "Errore durante la creazione",
        variant: "destructive",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: ProjectAssignmentFormData) => {
      const payload = {
        ...data,
        fixedAmount: data.fixedAmount ? parseFloat(data.fixedAmount) : undefined,
        hourlyRate: data.hourlyRate ? parseFloat(data.hourlyRate) : undefined,
        estimatedHours: data.estimatedHours ? parseFloat(data.estimatedHours) : undefined,
        startDate: data.startDate ? new Date(data.startDate).toISOString() : undefined,
        endDate: data.endDate ? new Date(data.endDate).toISOString() : undefined,
      };
      return await apiRequest("PUT", `/api/project-assignments/${assignment?.id}`, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/project-assignments"] });
      toast({
        title: "Aggiornato",
        description: "Assegnazione aggiornata con successo",
      });
      onSuccess?.();
    },
    onError: (error: Error) => {
      toast({
        title: "Errore",
        description: error.message || "Errore durante l'aggiornamento",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: ProjectAssignmentFormData) => {
    if (assignment) {
      updateMutation.mutate(data);
    } else {
      createMutation.mutate(data);
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        {/* Basic Info */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Informazioni Base
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Titolo *</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="Es: Sviluppo Feature X" data-testid="input-title" />
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
                  <FormLabel>Descrizione</FormLabel>
                  <FormControl>
                    <Textarea {...field} rows={3} placeholder="Descrizione dettagliata..." data-testid="input-description" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        {/* Assignment Details */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Dettagli Assegnazione
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="projectId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Progetto *</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-project">
                          <SelectValue placeholder="Seleziona progetto" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {projects.map((project) => (
                          <SelectItem key={project.id} value={project.id}>
                            {project.name}
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
                name="resourceId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Risorsa *</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-resource">
                          <SelectValue placeholder="Seleziona risorsa" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {resources.map((resource) => (
                          <SelectItem key={resource.id} value={resource.id}>
                            {resource.name} ({resource.role})
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
              name="status"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Stato</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger data-testid="select-status">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="assigned">Assegnato</SelectItem>
                      <SelectItem value="active">Attivo</SelectItem>
                      <SelectItem value="completed">Completato</SelectItem>
                      <SelectItem value="cancelled">Annullato</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        {/* Compensation */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <DollarSign className="h-5 w-5" />
              Compenso
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <FormField
              control={form.control}
              name="engagementType"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tipo di Compenso *</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger data-testid="select-engagement-type">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="fixed">Importo Fisso</SelectItem>
                      <SelectItem value="hourly">Tariffa Oraria</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormDescription>
                    Importo Fisso: Prezzo unico per il progetto. Tariffa Oraria: Pagamento in base alle ore lavorate.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            {engagementType === "fixed" && (
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="fixedAmount"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Importo Fisso</FormLabel>
                      <FormControl>
                        <Input {...field} type="number" step="0.01" placeholder="0.00" data-testid="input-fixed-amount" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="currency"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Valuta</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-currency">
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="EUR">EUR (€)</SelectItem>
                          <SelectItem value="USD">USD ($)</SelectItem>
                          <SelectItem value="GBP">GBP (£)</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            )}

            {engagementType === "hourly" && (
              <div className="grid grid-cols-3 gap-4">
                <FormField
                  control={form.control}
                  name="hourlyRate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Tariffa Oraria</FormLabel>
                      <FormControl>
                        <Input {...field} type="number" step="0.01" placeholder="0.00" data-testid="input-hourly-rate" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="estimatedHours"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Ore Stimate</FormLabel>
                      <FormControl>
                        <Input {...field} type="number" step="0.5" placeholder="0" data-testid="input-estimated-hours" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="currency"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Valuta</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-currency">
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="EUR">EUR (€)</SelectItem>
                          <SelectItem value="USD">USD ($)</SelectItem>
                          <SelectItem value="GBP">GBP (£)</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            )}
          </CardContent>
        </Card>

        {/* Dates */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Date
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="startDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Data Inizio *</FormLabel>
                    <FormControl>
                      <Input {...field} type="date" data-testid="input-start-date" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="endDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Data Fine</FormLabel>
                    <FormControl>
                      <Input {...field} type="date" data-testid="input-end-date" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </CardContent>
        </Card>

        {/* Notes */}
        <Card>
          <CardHeader>
            <CardTitle>Note</CardTitle>
          </CardHeader>
          <CardContent>
            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormControl>
                    <Textarea {...field} rows={4} placeholder="Note aggiuntive..." data-testid="input-notes" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        {/* Submit */}
        <div className="flex justify-end gap-2">
          <Button
            type="submit"
            disabled={isPending}
            data-testid="button-save"
          >
            {isPending ? "Salvando..." : assignment ? "Aggiorna" : "Crea Assegnazione"}
          </Button>
        </div>
      </form>
    </Form>
  );
}
