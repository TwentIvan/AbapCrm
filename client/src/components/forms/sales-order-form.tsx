import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, getQueryFn } from "@/lib/queryClient";
import { SalesOrder, Partner, Quote, Contact } from "@shared/schema";
import SalesOrderItemsEditor, { ItemForm } from "./sales-order-items-editor";
import { useState } from "react";
import { AlertCircle, FileText, Link2 } from "lucide-react";
import { useOrganization } from "@/contexts/organization-context";

const formSchema = z.object({
  partnerId: z.string().min(1, "Seleziona un cliente"),
  contactId: z.string().optional().nullable(),
  quoteId: z.string().optional().nullable(),
  quoteVersion: z.number().optional().nullable(),
  customerOrderReference: z.string().optional().nullable(),
  issueDate: z.string().optional(),
  dueDate: z.string().optional().nullable(),
  subtotal: z.string().optional(),
  discountPercent: z.string().optional(),
  discountAmount: z.string().optional(),
  taxes: z.string().optional(),
  total: z.string().optional(),
  currency: z.string().default("EUR"),
  status: z.enum(["draft", "sent", "accepted", "invoiced", "paid", "cancelled"]).default("draft"),
  isBillable: z.boolean().default(true),
  paymentTerms: z.string().optional().nullable(),
  deliveryMode: z.string().optional().nullable(),
  internalNotes: z.string().optional().nullable(),
  externalNotes: z.string().optional().nullable(),
});

type FormData = z.infer<typeof formSchema>;

interface SalesOrderFormProps {
  salesOrder?: SalesOrder;
  onSuccess: () => void;
}

export default function SalesOrderForm({ salesOrder, onSuccess }: SalesOrderFormProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [tempItems, setTempItems] = useState<ItemForm[]>([]);
  const { currentOrganizationId } = useOrganization();

  const { data: partners = [] } = useQuery<Partner[]>({
    queryKey: ["/api/partners"],
    queryFn: getQueryFn({ on401: "throw" }),
    enabled: !!currentOrganizationId,
  });

  const { data: quotes = [] } = useQuery<Quote[]>({
    queryKey: ["/api/quotes"],
    queryFn: getQueryFn({ on401: "throw" }),
    enabled: !!currentOrganizationId,
  });

  const { data: contacts = [] } = useQuery<Contact[]>({
    queryKey: ["/api/contacts"],
    queryFn: getQueryFn({ on401: "throw" }),
    enabled: !!currentOrganizationId,
  });

  const today = new Date().toISOString().split('T')[0];
  const thirtyDaysLater = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      partnerId: salesOrder?.partnerId || "",
      contactId: salesOrder?.contactId || null,
      quoteId: salesOrder?.quoteId || null,
      quoteVersion: salesOrder?.quoteVersion || null,
      customerOrderReference: salesOrder?.customerOrderReference || "",
      issueDate: salesOrder?.issueDate ? new Date(salesOrder.issueDate).toISOString().split('T')[0] : today,
      dueDate: salesOrder?.dueDate ? new Date(salesOrder.dueDate).toISOString().split('T')[0] : thirtyDaysLater,
      subtotal: salesOrder?.subtotal || "0",
      discountPercent: salesOrder?.discountPercent || "0",
      discountAmount: salesOrder?.discountAmount || "0",
      taxes: salesOrder?.taxes || "0",
      total: salesOrder?.total || "0",
      currency: salesOrder?.currency || "EUR",
      status: salesOrder?.status as any || "draft",
      isBillable: salesOrder?.isBillable ?? true,
      paymentTerms: salesOrder?.paymentTerms || "",
      deliveryMode: salesOrder?.deliveryMode || "",
      internalNotes: salesOrder?.internalNotes || "",
      externalNotes: salesOrder?.externalNotes || "",
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: FormData): Promise<SalesOrder> => {
      const response = await apiRequest("POST", "/api/sales-orders", data);
      const createdOrder = await response.json();
      return createdOrder as SalesOrder;
    },
    onSuccess: async (createdOrder: SalesOrder) => {
      if (tempItems.length > 0 && createdOrder?.id) {
        try {
          for (const item of tempItems) {
            await apiRequest("POST", `/api/sales-orders/${createdOrder.id}/items`, {
              lineNumber: item.lineNumber,
              itemType: item.itemType,
              description: item.description,
              quantity: item.quantity,
              unitOfMeasure: item.unitOfMeasure,
              unitPrice: item.unitPrice,
              discountPercent: item.discountPercent,
              lineTotal: item.lineTotal,
              customerOrderReference: item.customerOrderReference || null,
              customerOrderLineReference: item.customerOrderLineReference || null,
              projectId: item.projectId || null,
              quoteItemId: item.quoteItemId || null,
              notes: item.notes || null,
            });
          }
        } catch (error) {
          console.error("Errore nel salvataggio delle righe:", error);
        }
      }
      queryClient.invalidateQueries({ queryKey: ["/api/sales-orders"] });
      toast({ title: "Creato", description: "Ordine di vendita creato con successo" });
      onSuccess();
    },
    onError: (error: any) => {
      toast({ 
        title: "Errore", 
        description: error?.message || "Errore nella creazione dell'ordine", 
        variant: "destructive" 
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: (data: FormData) => apiRequest("PUT", `/api/sales-orders/${salesOrder!.id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sales-orders"] });
      toast({ title: "Aggiornato", description: "Ordine aggiornato con successo" });
      onSuccess();
    },
    onError: (error: any) => {
      toast({ 
        title: "Errore", 
        description: error?.message || "Errore nell'aggiornamento dell'ordine", 
        variant: "destructive" 
      });
    },
  });

  const isPending = createMutation.isPending || updateMutation.isPending;

  const normalizeData = (data: FormData) => {
    return {
      ...data,
      contactId: data.contactId === "__none__" ? null : data.contactId,
      quoteId: data.quoteId === "__none__" ? null : data.quoteId,
      deliveryMode: data.deliveryMode === "__none__" ? null : data.deliveryMode,
    };
  };

  const onSubmit = (data: FormData) => {
    if (isPending) return;
    
    const normalizedData = normalizeData(data);
    
    if (salesOrder) {
      updateMutation.mutate(normalizedData);
    } else {
      createMutation.mutate(normalizedData);
    }
  };

  const handleTotalsChange = (subtotal: number, tax: number, total: number) => {
    form.setValue("subtotal", subtotal.toFixed(2));
    form.setValue("taxes", tax.toFixed(2));
    form.setValue("total", total.toFixed(2));
  };

  const selectedPartnerId = form.watch("partnerId");
  const selectedQuoteId = form.watch("quoteId");
  const isBillable = form.watch("isBillable");

  const partnerContacts = contacts.filter(c => c.partnerId === selectedPartnerId);
  const selectedQuote = quotes.find(q => q.id === selectedQuoteId);
  const acceptedQuotes = quotes.filter(q => q.status === "accepted");

  const subtotal = parseFloat(form.watch("subtotal") || "0");
  const taxes = parseFloat(form.watch("taxes") || "0");
  const total = parseFloat(form.watch("total") || "0");

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        {!isBillable && (
          <div className="bg-red-50 border border-red-200 rounded-md p-3 flex items-center gap-2 text-red-800">
            <AlertCircle className="h-5 w-5" />
            <span className="text-sm font-medium">
              Questo ordine non è fatturabile (l'offerta collegata non è più in stato "accettata")
            </span>
          </div>
        )}

        {salesOrder && (
          <div className="flex items-center justify-between bg-muted p-3 rounded-lg">
            <div>
              <span className="text-sm text-muted-foreground">Numero Ordine:</span>
              <span className="ml-2 font-medium">{salesOrder.orderNumber}</span>
            </div>
            {selectedQuote && (
              <div className="flex items-center gap-2">
                <Link2 className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm">
                  Offerta: <strong>{selectedQuote.quoteNumber}</strong> v{salesOrder.quoteVersion || selectedQuote.version}
                </span>
              </div>
            )}
          </div>
        )}

        <Tabs defaultValue="details" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="details" data-testid="tab-details">Dettagli</TabsTrigger>
            <TabsTrigger value="items" data-testid="tab-items">Righe</TabsTrigger>
            <TabsTrigger value="notes" data-testid="tab-notes">Note</TabsTrigger>
          </TabsList>

          <TabsContent value="details" className="space-y-4 mt-4">
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="partnerId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Cliente *</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value || ""}>
                      <FormControl>
                        <SelectTrigger data-testid="select-partner">
                          <SelectValue placeholder="Seleziona cliente" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {partners.map((partner) => (
                          <SelectItem key={partner.id} value={partner.id}>
                            {partner.name}
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
                        <SelectItem value="draft">Bozza</SelectItem>
                        <SelectItem value="sent">Inviato</SelectItem>
                        <SelectItem value="accepted">Confermato</SelectItem>
                        <SelectItem value="invoiced">Fatturato</SelectItem>
                        <SelectItem value="paid">Pagato</SelectItem>
                        <SelectItem value="cancelled">Annullato</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="contactId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Contatto</FormLabel>
                    <Select 
                      onValueChange={(val) => field.onChange(val === "__none__" ? null : val)} 
                      value={field.value || "__none__"}
                    >
                      <FormControl>
                        <SelectTrigger data-testid="select-contact">
                          <SelectValue placeholder="Seleziona contatto" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="__none__">Nessuno</SelectItem>
                        {partnerContacts.map((contact) => (
                          <SelectItem key={contact.id} value={contact.id}>
                            {contact.name}
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
                name="quoteId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Offerta di Origine</FormLabel>
                    <Select onValueChange={(value) => {
                      field.onChange(value === "__none__" ? null : value);
                      const quote = quotes.find(q => q.id === value);
                      if (quote) {
                        form.setValue("quoteVersion", quote.version);
                        form.setValue("partnerId", quote.partnerId);
                        if (quote.contactId) form.setValue("contactId", quote.contactId);
                      }
                    }} value={field.value || "__none__"}>
                      <FormControl>
                        <SelectTrigger data-testid="select-quote">
                          <SelectValue placeholder="Collega un'offerta" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="__none__">Nessuna</SelectItem>
                        {acceptedQuotes.map((quote) => (
                          <SelectItem key={quote.id} value={quote.id}>
                            {quote.quoteNumber} - v{quote.version}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-3 gap-4">
              <FormField
                control={form.control}
                name="customerOrderReference"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Rif. Ordine Cliente</FormLabel>
                    <FormControl>
                      <Input 
                        {...field} 
                        value={field.value || ""} 
                        placeholder="N. ordine cliente"
                        data-testid="input-customer-order-ref"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="issueDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Data Ordine</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} data-testid="input-issue-date" />
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
                    <FormLabel>Data Consegna</FormLabel>
                    <FormControl>
                      <Input 
                        type="date" 
                        {...field} 
                        value={field.value || ""} 
                        data-testid="input-due-date" 
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="paymentTerms"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Termini di Pagamento</FormLabel>
                    <FormControl>
                      <Input 
                        {...field} 
                        value={field.value || ""} 
                        placeholder="Es: 30gg FM"
                        data-testid="input-payment-terms"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="deliveryMode"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Modalità Consegna</FormLabel>
                    <Select 
                      onValueChange={(val) => field.onChange(val === "__none__" ? null : val)} 
                      value={field.value || "__none__"}
                    >
                      <FormControl>
                        <SelectTrigger data-testid="select-delivery-mode">
                          <SelectValue placeholder="Seleziona modalità" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="__none__">Non specificato</SelectItem>
                        <SelectItem value="remote">Remoto</SelectItem>
                        <SelectItem value="on-site">On-site</SelectItem>
                        <SelectItem value="hybrid">Ibrido</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="bg-muted p-4 rounded-lg">
              <div className="grid grid-cols-4 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">Imponibile:</span>
                  <span className="ml-2 font-medium">€ {subtotal.toLocaleString('it-IT', { minimumFractionDigits: 2 })}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">IVA:</span>
                  <span className="ml-2 font-medium">€ {taxes.toLocaleString('it-IT', { minimumFractionDigits: 2 })}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Totale:</span>
                  <span className="ml-2 font-bold">€ {total.toLocaleString('it-IT', { minimumFractionDigits: 2 })}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Valuta:</span>
                  <span className="ml-2">{form.watch("currency")}</span>
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="items" className="mt-4">
            <SalesOrderItemsEditor
              salesOrderId={salesOrder?.id}
              orderStatus={salesOrder?.status}
              onTotalsChange={handleTotalsChange}
              tempItems={!salesOrder ? tempItems : undefined}
              onTempItemsChange={!salesOrder ? setTempItems : undefined}
            />
          </TabsContent>

          <TabsContent value="notes" className="space-y-4 mt-4">
            <FormField
              control={form.control}
              name="internalNotes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Note Interne</FormLabel>
                  <FormControl>
                    <Textarea 
                      {...field} 
                      value={field.value || ""} 
                      placeholder="Note interne (non visibili al cliente)"
                      rows={4}
                      data-testid="textarea-internal-notes"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="externalNotes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Note Esterne</FormLabel>
                  <FormControl>
                    <Textarea 
                      {...field} 
                      value={field.value || ""} 
                      placeholder="Note visibili al cliente"
                      rows={4}
                      data-testid="textarea-external-notes"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </TabsContent>
        </Tabs>

        <div className="flex justify-end gap-2 pt-4 border-t">
          <Button type="submit" disabled={isPending} data-testid="button-save-order">
            {isPending ? "Salvataggio..." : salesOrder ? "Aggiorna" : "Crea Ordine"}
          </Button>
        </div>
      </form>
    </Form>
  );
}
