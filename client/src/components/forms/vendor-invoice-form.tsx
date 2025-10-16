import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, getQueryFn } from "@/lib/queryClient";
import { insertVendorInvoiceSchema, type VendorInvoice, type Project, type Organization, type PurchaseOrder, type Partner } from "@shared/schema";
import { useOrganization } from "@/contexts/organization-context";
import { FileText, DollarSign, Calendar, Building2 } from "lucide-react";

// Form schema - extend to use strings for date fields (HTML date inputs)
const formSchema = insertVendorInvoiceSchema.omit({ 
  organizationId: true 
}).extend({
  invoiceDate: z.string().min(1, "Data fattura richiesta"),
  dueDate: z.string().min(1, "Data scadenza richiesta"),
  paidDate: z.string().optional(),
});

type VendorInvoiceFormData = z.infer<typeof formSchema>;

interface VendorInvoiceFormProps {
  vendorInvoice?: VendorInvoice;
  onSuccess: () => void;
}

const formatDateToISO = (date: Date | string): string => {
  if (!date) return "";
  const d = date instanceof Date ? date : new Date(date);
  return d.toISOString().split('T')[0];
};

export default function VendorInvoiceForm({ vendorInvoice, onSuccess }: VendorInvoiceFormProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { currentOrganizationId } = useOrganization();

  const { data: projects = [] } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
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

  const { data: purchaseOrders = [] } = useQuery<PurchaseOrder[]>({
    queryKey: ["/api/purchase-orders"],
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

  const form = useForm<VendorInvoiceFormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      invoiceNumber: vendorInvoice?.invoiceNumber || "",
      vendorOrganizationId: vendorInvoice?.vendorOrganizationId || "",
      vendorPartnerId: vendorInvoice?.vendorPartnerId || "",
      vendorName: vendorInvoice?.vendorName || "",
      projectId: vendorInvoice?.projectId || "",
      purchaseOrderId: vendorInvoice?.purchaseOrderId || "",
      invoiceDate: vendorInvoice?.invoiceDate ? formatDateToISO(vendorInvoice.invoiceDate) : "",
      dueDate: vendorInvoice?.dueDate ? formatDateToISO(vendorInvoice.dueDate) : "",
      subtotal: vendorInvoice?.subtotal || "",
      taxAmount: vendorInvoice?.taxAmount || "",
      totalAmount: vendorInvoice?.totalAmount || "",
      currency: vendorInvoice?.currency || "EUR",
      status: vendorInvoice?.status || "received",
      paidDate: vendorInvoice?.paidDate ? formatDateToISO(vendorInvoice.paidDate) : "",
      description: vendorInvoice?.description || "",
      attachmentUrl: vendorInvoice?.attachmentUrl || "",
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
    if (vendorPartnerId && vendorOrganizationId && !vendorInvoice) {
      form.setValue("vendorOrganizationId", "");
    }
  }, [vendorPartnerId, vendorOrganizationId, vendorInvoice, form]);

  // Auto-fill vendor name when vendor organization or partner is selected
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

  // Reset purchaseOrderId when project changes or is cleared
  useEffect(() => {
    if (projectId !== vendorInvoice?.projectId) {
      form.setValue("purchaseOrderId", "");
    }
  }, [projectId, vendorInvoice?.projectId, form]);

  // Filter purchase orders for selected project
  const projectPurchaseOrders = purchaseOrders.filter(po => po.projectId === projectId);

  const createMutation = useMutation({
    mutationFn: async (data: VendorInvoiceFormData) => {
      const payload = {
        ...data,
        subtotal: data.subtotal ? parseFloat(data.subtotal as any) : 0,
        taxAmount: data.taxAmount ? parseFloat(data.taxAmount as any) : 0,
        totalAmount: data.totalAmount ? parseFloat(data.totalAmount as any) : 0,
        vendorOrganizationId: data.vendorOrganizationId || null,
        vendorPartnerId: data.vendorPartnerId || null,
        projectId: data.projectId || null,
        purchaseOrderId: data.purchaseOrderId || null,
        paidDate: data.paidDate || null,
        description: data.description || null,
        attachmentUrl: data.attachmentUrl || null,
      };
      return await apiRequest("POST", "/api/vendor-invoices", payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/vendor-invoices"] });
      toast({ title: "Successo", description: "Fattura fornitore creata con successo" });
      onSuccess();
    },
    onError: (error: any) => {
      toast({
        title: "Errore",
        description: error.message || "Errore durante la creazione della fattura",
        variant: "destructive"
      });
    }
  });

  const updateMutation = useMutation({
    mutationFn: async (data: VendorInvoiceFormData) => {
      const payload = {
        ...data,
        subtotal: data.subtotal ? parseFloat(data.subtotal as any) : 0,
        taxAmount: data.taxAmount ? parseFloat(data.taxAmount as any) : 0,
        totalAmount: data.totalAmount ? parseFloat(data.totalAmount as any) : 0,
        vendorOrganizationId: data.vendorOrganizationId || null,
        vendorPartnerId: data.vendorPartnerId || null,
        projectId: data.projectId || null,
        purchaseOrderId: data.purchaseOrderId || null,
        paidDate: data.paidDate || null,
        description: data.description || null,
        attachmentUrl: data.attachmentUrl || null,
      };
      return await apiRequest("PATCH", `/api/vendor-invoices/${vendorInvoice!.id}`, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/vendor-invoices"] });
      toast({ title: "Successo", description: "Fattura fornitore aggiornata con successo" });
      onSuccess();
    },
    onError: (error: any) => {
      toast({
        title: "Errore",
        description: error.message || "Errore durante l'aggiornamento della fattura",
        variant: "destructive"
      });
    }
  });

  const onSubmit = (data: VendorInvoiceFormData) => {
    if (vendorInvoice) {
      updateMutation.mutate(data);
    } else {
      createMutation.mutate(data);
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        {/* Informazioni Fattura */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Informazioni Fattura
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="invoiceNumber"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Numero Fattura *</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="FT-2025-001" data-testid="input-invoice-number" />
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
                  <FormLabel>Stato *</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value || "received"} data-testid="select-status">
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Seleziona stato" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="received">Ricevuta</SelectItem>
                      <SelectItem value="approved">Approvata</SelectItem>
                      <SelectItem value="paid">Pagata</SelectItem>
                    </SelectContent>
                  </Select>
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
              name="purchaseOrderId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Ordine d'Acquisto</FormLabel>
                  <Select 
                    onValueChange={field.onChange} 
                    value={field.value || ""} 
                    disabled={!projectId || projectPurchaseOrders.length === 0}
                    data-testid="select-purchase-order"
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Nessun ordine" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="">Nessun ordine</SelectItem>
                      {projectPurchaseOrders.map((po) => (
                        <SelectItem key={po.id} value={po.id}>
                          {po.orderNumber}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormDescription>
                    Seleziona prima un progetto per vedere gli ordini disponibili
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
              Fornitore
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="vendorOrganizationId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Organizzazione Fornitore</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value || ""} data-testid="select-vendor-organization">
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
                  <FormDescription>
                    Seleziona organizzazione o partner fornitore
                  </FormDescription>
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
                  <Select onValueChange={field.onChange} value={field.value || ""} data-testid="select-vendor-partner">
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
                    Seleziona organizzazione o partner fornitore
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
                  <FormLabel>Nome Fornitore *</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="Nome fornitore" data-testid="input-vendor-name" />
                  </FormControl>
                  <FormDescription>
                    Auto-compilato dalla selezione organizzazione
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
              Importi
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="subtotal"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Importo Imponibile *</FormLabel>
                  <FormControl>
                    <Input 
                      {...field} 
                      type="number" 
                      step="0.01" 
                      placeholder="0.00" 
                      data-testid="input-subtotal"
                    />
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
                    <Input 
                      {...field} 
                      type="number" 
                      step="0.01" 
                      placeholder="0.00" 
                      data-testid="input-tax"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="totalAmount"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Importo Totale *</FormLabel>
                  <FormControl>
                    <Input 
                      {...field} 
                      type="number" 
                      step="0.01" 
                      placeholder="0.00" 
                      data-testid="input-total"
                    />
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
                  <FormLabel>Valuta *</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value || "EUR"} data-testid="select-currency">
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Seleziona valuta" />
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
          </CardContent>
        </Card>

        {/* Date */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Date e Pagamento
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="invoiceDate"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Data Fattura *</FormLabel>
                  <FormControl>
                    <Input 
                      {...field} 
                      type="date" 
                      value={field.value || ''}
                      data-testid="input-invoice-date" 
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="dueDate"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Data Scadenza *</FormLabel>
                  <FormControl>
                    <Input 
                      {...field} 
                      type="date" 
                      value={field.value || ''}
                      data-testid="input-due-date" 
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="paidDate"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Data Pagamento</FormLabel>
                  <FormControl>
                    <Input 
                      {...field} 
                      type="date" 
                      value={field.value || ''}
                      data-testid="input-payment-date" 
                    />
                  </FormControl>
                  <FormDescription>
                    Compila quando la fattura viene pagata
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="attachmentUrl"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Allegato PDF</FormLabel>
                  <FormControl>
                    <Input {...field} value={field.value || ''} placeholder="/path/to/invoice.pdf" data-testid="input-attachment" />
                  </FormControl>
                  <FormDescription>
                    URL o percorso file PDF della fattura
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        {/* Descrizione */}
        <Card>
          <CardHeader>
            <CardTitle>Descrizione e Note</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Descrizione *</FormLabel>
                  <FormControl>
                    <Textarea 
                      {...field} 
                      placeholder="Descrizione della fattura..."
                      className="min-h-[100px]"
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
                  <FormLabel>Note Aggiuntive</FormLabel>
                  <FormControl>
                    <Textarea 
                      {...field} 
                      value={field.value || ''}
                      placeholder="Note opzionali..."
                      className="min-h-[80px]"
                      data-testid="input-notes"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        <div className="flex justify-end gap-2">
          <Button type="submit" disabled={isPending} data-testid="button-submit">
            {isPending ? "Salvataggio..." : vendorInvoice ? "Aggiorna" : "Crea"}
          </Button>
        </div>
      </form>
    </Form>
  );
}
