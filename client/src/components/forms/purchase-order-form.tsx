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
import { insertPurchaseOrderSchema, type PurchaseOrder, type Project, type Partner, type Organization, type ProjectAssignment } from "@shared/schema";
import { useOrganization } from "@/contexts/organization-context";
import { FileText, DollarSign, Calendar, Building2 } from "lucide-react";

// Form schema
const formSchema = insertPurchaseOrderSchema.extend({
  orderNumber: z.string().min(1, "Numero ordine richiesto"),
  vendorName: z.string().min(1, "Nome fornitore richiesto"),
  totalAmount: z.string().min(1, "Importo totale richiesto"),
  taxAmount: z.string().optional(),
  orderDate: z.string().min(1, "Data ordine richiesta"),
  expectedDeliveryDate: z.string().optional(),
  status: z.enum(["draft", "approved", "sent", "received", "cancelled"]).optional(),
  description: z.string().min(1, "Descrizione richiesta"),
  notes: z.string().optional(),
  termsAndConditions: z.string().optional(),
  vendorOrganizationId: z.string().optional(),
  vendorPartnerId: z.string().optional(),
  projectId: z.string().optional(),
  projectAssignmentId: z.string().optional(),
  currency: z.string().optional(),
}).omit({ userId: true, organizationId: true });

type PurchaseOrderFormData = z.infer<typeof formSchema>;

interface PurchaseOrderFormProps {
  purchaseOrder?: PurchaseOrder;
  onSuccess?: () => void;
}

export default function PurchaseOrderForm({ purchaseOrder, onSuccess }: PurchaseOrderFormProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { currentOrganizationId } = useOrganization();

  const { data: projects = [] } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
    queryFn: getQueryFn({ on401: "throw" }),
    enabled: !!currentOrganizationId,
    staleTime: 5 * 60 * 1000,
  });

  const { data: partners = [] } = useQuery<Partner[]>({
    queryKey: ["/api/partners"],
    queryFn: getQueryFn({ on401: "throw" }),
    enabled: !!currentOrganizationId,
    staleTime: 5 * 60 * 1000,
  });

  const { data: organizations = [] } = useQuery<Organization[]>({
    queryKey: ["/api/organizations"],
    queryFn: getQueryFn({ on401: "throw" }),
    enabled: !!currentOrganizationId,
    staleTime: 5 * 60 * 1000,
  });

  const { data: assignments = [] } = useQuery<ProjectAssignment[]>({
    queryKey: ["/api/project-assignments"],
    queryFn: getQueryFn({ on401: "throw" }),
    enabled: !!currentOrganizationId,
    staleTime: 5 * 60 * 1000,
  });

  const form = useForm<PurchaseOrderFormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      orderNumber: purchaseOrder?.orderNumber || "",
      vendorName: purchaseOrder?.vendorName || "",
      vendorOrganizationId: purchaseOrder?.vendorOrganizationId || "",
      vendorPartnerId: purchaseOrder?.vendorPartnerId || "",
      projectId: purchaseOrder?.projectId || "",
      projectAssignmentId: purchaseOrder?.projectAssignmentId || "",
      totalAmount: purchaseOrder?.totalAmount || "",
      taxAmount: purchaseOrder?.taxAmount || "",
      currency: purchaseOrder?.currency || "EUR",
      orderDate: purchaseOrder?.orderDate ? new Date(purchaseOrder.orderDate).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
      expectedDeliveryDate: purchaseOrder?.expectedDeliveryDate ? new Date(purchaseOrder.expectedDeliveryDate).toISOString().split('T')[0] : "",
      status: purchaseOrder?.status || "draft",
      description: purchaseOrder?.description || "",
      notes: purchaseOrder?.notes || "",
      termsAndConditions: purchaseOrder?.termsAndConditions || "",
    },
  });

  const vendorOrganizationId = form.watch("vendorOrganizationId");
  const vendorPartnerId = form.watch("vendorPartnerId");
  const projectId = form.watch("projectId");

  // Reset vendorPartnerId when vendorOrganizationId is selected (mutual exclusion)
  useEffect(() => {
    if (vendorOrganizationId && vendorPartnerId) {
      form.setValue("vendorPartnerId", "");
    }
  }, [vendorOrganizationId, vendorPartnerId, form]);

  // Reset vendorOrganizationId when vendorPartnerId is selected (mutual exclusion)
  useEffect(() => {
    if (vendorPartnerId && vendorOrganizationId && !purchaseOrder) {
      form.setValue("vendorOrganizationId", "");
    }
  }, [vendorPartnerId, vendorOrganizationId, purchaseOrder, form]);

  // Auto-fill vendor name when organization or partner is selected
  useEffect(() => {
    if (vendorOrganizationId) {
      const org = organizations.find(o => o.id === vendorOrganizationId);
      if (org) {
        form.setValue("vendorName", org.name);
      }
    } else if (vendorPartnerId) {
      const partner = partners.find(p => p.id === vendorPartnerId);
      if (partner) {
        form.setValue("vendorName", partner.name);
      }
    }
  }, [vendorOrganizationId, vendorPartnerId, organizations, partners, form]);

  // Reset projectAssignmentId when project changes or is cleared
  useEffect(() => {
    if (projectId !== purchaseOrder?.projectId) {
      form.setValue("projectAssignmentId", "");
    }
  }, [projectId, purchaseOrder?.projectId, form]);

  // Filter assignments for selected project
  const projectAssignments = assignments.filter(a => a.projectId === projectId);

  const createMutation = useMutation({
    mutationFn: async (data: PurchaseOrderFormData) => {
      const payload = {
        ...data,
        totalAmount: parseFloat(data.totalAmount),
        taxAmount: data.taxAmount ? parseFloat(data.taxAmount) : 0,
        orderDate: data.orderDate ? new Date(data.orderDate).toISOString() : new Date().toISOString(),
        expectedDeliveryDate: data.expectedDeliveryDate ? new Date(data.expectedDeliveryDate).toISOString() : undefined,
        vendorOrganizationId: data.vendorOrganizationId || undefined,
        vendorPartnerId: data.vendorPartnerId || undefined,
        projectId: data.projectId || undefined,
        projectAssignmentId: data.projectAssignmentId || undefined,
      };
      return await apiRequest("POST", "/api/purchase-orders", payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/purchase-orders"] });
      toast({
        title: "Creato",
        description: "Ordine d'acquisto creato con successo.",
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
    mutationFn: async (data: PurchaseOrderFormData) => {
      const payload = {
        ...data,
        totalAmount: parseFloat(data.totalAmount),
        taxAmount: data.taxAmount ? parseFloat(data.taxAmount) : 0,
        orderDate: data.orderDate ? new Date(data.orderDate).toISOString() : new Date().toISOString(),
        expectedDeliveryDate: data.expectedDeliveryDate ? new Date(data.expectedDeliveryDate).toISOString() : undefined,
        vendorOrganizationId: data.vendorOrganizationId || undefined,
        vendorPartnerId: data.vendorPartnerId || undefined,
        projectId: data.projectId || undefined,
        projectAssignmentId: data.projectAssignmentId || undefined,
      };
      return await apiRequest("PUT", `/api/purchase-orders/${purchaseOrder?.id}`, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/purchase-orders"] });
      toast({
        title: "Aggiornato",
        description: "Ordine d'acquisto aggiornato con successo.",
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

  const onSubmit = (data: PurchaseOrderFormData) => {
    if (purchaseOrder) {
      updateMutation.mutate(data);
    } else {
      createMutation.mutate(data);
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        {/* Informazioni Base */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Informazioni Ordine
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <FormField
              control={form.control}
              name="orderNumber"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Numero Ordine</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="PO-2025-001" data-testid="input-order-number" />
                  </FormControl>
                  <FormDescription>Numero identificativo univoco dell'ordine</FormDescription>
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
                    <Textarea {...field} placeholder="Descrizione dell'ordine..." data-testid="input-description" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="projectId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Progetto Collegato</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value || ""} data-testid="select-project">
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Nessun progetto" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="">Nessun progetto</SelectItem>
                      {projects.map((project) => (
                        <SelectItem key={project.id} value={project.id}>
                          {project.projectName}
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
              name="projectAssignmentId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Assegnazione Progetto</FormLabel>
                  <Select 
                    onValueChange={field.onChange} 
                    value={field.value || ""} 
                    disabled={!projectId || projectAssignments.length === 0}
                    data-testid="select-assignment"
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Nessuna assegnazione" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="">Nessuna assegnazione</SelectItem>
                      {projectAssignments.map((assignment) => (
                        <SelectItem key={assignment.id} value={assignment.id}>
                          {assignment.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormDescription>
                    Seleziona prima un progetto per vedere le assegnazioni disponibili
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        {/* Fornitore */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              Informazioni Fornitore
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <FormField
              control={form.control}
              name="vendorOrganizationId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Organizzazione Fornitore</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value || ""} data-testid="select-vendor-org">
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Seleziona organizzazione" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="">Nessuna organizzazione</SelectItem>
                      {organizations.map((org) => (
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
              name="vendorPartnerId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Partner Fornitore</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value || ""} disabled={!!vendorOrganizationId} data-testid="select-vendor-partner">
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Seleziona partner" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="">Nessun partner</SelectItem>
                      {partners.map((partner) => (
                        <SelectItem key={partner.id} value={partner.id}>
                          {partner.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormDescription>
                    Disabilitato se è selezionata un'organizzazione
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="vendorName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nome Fornitore</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="Nome del fornitore" data-testid="input-vendor-name" />
                  </FormControl>
                  <FormDescription>
                    Compilato automaticamente se selezioni organizzazione o partner
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        {/* Importi */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <DollarSign className="h-5 w-5" />
              Importi e Valuta
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <FormField
                control={form.control}
                name="totalAmount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Importo Totale</FormLabel>
                    <FormControl>
                      <Input type="number" step="0.01" {...field} placeholder="0.00" data-testid="input-total-amount" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="taxAmount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Importo IVA</FormLabel>
                    <FormControl>
                      <Input type="number" step="0.01" {...field} placeholder="0.00" data-testid="input-tax-amount" />
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
                    <Select onValueChange={field.onChange} value={field.value} data-testid="select-currency">
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="EUR" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="EUR">EUR</SelectItem>
                        <SelectItem value="USD">USD</SelectItem>
                        <SelectItem value="GBP">GBP</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </CardContent>
        </Card>

        {/* Date e Stato */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Date e Stato
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="orderDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Data Ordine</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} data-testid="input-order-date" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="expectedDeliveryDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Data Consegna Prevista</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} data-testid="input-delivery-date" />
                    </FormControl>
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
                  <Select onValueChange={field.onChange} value={field.value} data-testid="select-status">
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Seleziona stato" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="draft">Bozza</SelectItem>
                      <SelectItem value="approved">Approvato</SelectItem>
                      <SelectItem value="sent">Inviato</SelectItem>
                      <SelectItem value="received">Ricevuto</SelectItem>
                      <SelectItem value="cancelled">Annullato</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        {/* Note e Termini */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Note e Termini
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Note</FormLabel>
                  <FormControl>
                    <Textarea {...field} placeholder="Note aggiuntive..." data-testid="input-notes" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="termsAndConditions"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Termini e Condizioni</FormLabel>
                  <FormControl>
                    <Textarea {...field} placeholder="Termini e condizioni dell'ordine..." data-testid="input-terms" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        <div className="flex justify-end gap-4">
          <Button type="submit" disabled={isPending} data-testid="button-submit">
            {isPending ? "Salvataggio..." : (purchaseOrder ? "Aggiorna" : "Crea")} Ordine
          </Button>
        </div>
      </form>
    </Form>
  );
}
