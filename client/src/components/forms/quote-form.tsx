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
import { useToast } from "@/hooks/use-toast";
import { apiRequest, getQueryFn } from "@/lib/queryClient";
import { Quote, Partner } from "@shared/schema";
import QuoteItemsEditor, { ItemForm } from "./quote-items-editor";
import { useState } from "react";

const formSchema = z.object({
  partnerId: z.string().min(1, "Seleziona un cliente"),
  contactId: z.string().optional().nullable(),
  issueDate: z.string().optional(),
  validFrom: z.string().optional(),
  validTo: z.string().min(1, "La data di scadenza è obbligatoria"),
  subtotal: z.string().optional(),
  discountPercent: z.string().optional(),
  discountAmount: z.string().optional(),
  taxes: z.string().optional(),
  total: z.string().optional(),
  currency: z.string().default("EUR"),
  status: z.enum(["draft", "sent", "accepted", "rejected", "expired", "cancelled"]).default("draft"),
  paymentTerms: z.string().optional().nullable(),
  deliveryMode: z.string().optional().nullable(),
  specialConditions: z.string().optional().nullable(),
  internalNotes: z.string().optional().nullable(),
  externalNotes: z.string().optional().nullable(),
});

type FormData = z.infer<typeof formSchema>;

interface QuoteFormProps {
  quote?: Quote;
  onSuccess: () => void;
}

export default function QuoteForm({ quote, onSuccess }: QuoteFormProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [tempItems, setTempItems] = useState<ItemForm[]>([]);

  const { data: partners = [] } = useQuery<Partner[]>({
    queryKey: ["/api/partners"],
    queryFn: getQueryFn({ on401: "throw" }),
  });

  const today = new Date().toISOString().split('T')[0];
  const thirtyDaysLater = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      partnerId: quote?.partnerId || "",
      contactId: quote?.contactId || null,
      issueDate: quote?.issueDate ? new Date(quote.issueDate).toISOString().split('T')[0] : today,
      validFrom: quote?.validFrom ? new Date(quote.validFrom).toISOString().split('T')[0] : today,
      validTo: quote?.validTo ? new Date(quote.validTo).toISOString().split('T')[0] : thirtyDaysLater,
      subtotal: quote?.subtotal || "0",
      discountPercent: quote?.discountPercent || "0",
      discountAmount: quote?.discountAmount || "0",
      taxes: quote?.taxes || "0",
      total: quote?.total || "0",
      currency: quote?.currency || "EUR",
      status: quote?.status as any || "draft",
      paymentTerms: quote?.paymentTerms || "",
      deliveryMode: quote?.deliveryMode || "",
      specialConditions: quote?.specialConditions || "",
      internalNotes: quote?.internalNotes || "",
      externalNotes: quote?.externalNotes || "",
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: FormData): Promise<Quote> => {
      const response = await apiRequest("POST", "/api/quotes", data);
      return response as unknown as Quote;
    },
    onSuccess: async (createdQuote: Quote) => {
      if (tempItems.length > 0 && createdQuote?.id) {
        try {
          for (const item of tempItems) {
            await apiRequest("POST", `/api/quotes/${createdQuote.id}/items`, {
              lineNumber: item.lineNumber,
              itemType: item.itemType,
              description: item.description,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              lineTotal: item.lineTotal,
              unitOfMeasure: "giorni",
              discountPercent: "0",
              rateAgreementId: item.itemType === "rate_agreement" ? item.referenceId : null,
              projectId: item.itemType === "project" ? item.referenceId : null,
            });
          }
        } catch (error) {
          console.error("Errore nel salvataggio delle righe:", error);
        }
      }
      queryClient.invalidateQueries({ queryKey: ["/api/quotes"] });
      toast({ title: "Creata", description: "Offerta creata con successo" });
      onSuccess();
    },
    onError: (error: any) => {
      toast({ 
        title: "Errore", 
        description: error?.message || "Errore nella creazione dell'offerta", 
        variant: "destructive" 
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: (data: FormData) => apiRequest("PUT", `/api/quotes/${quote!.id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/quotes"] });
      toast({ title: "Aggiornata", description: "Offerta aggiornata con successo" });
      onSuccess();
    },
    onError: (error: any) => {
      toast({ 
        title: "Errore", 
        description: error?.message || "Errore nell'aggiornamento dell'offerta", 
        variant: "destructive" 
      });
    },
  });

  const isPending = createMutation.isPending || updateMutation.isPending;

  const onSubmit = (data: FormData) => {
    if (isPending) return;
    
    if (quote) {
      updateMutation.mutate(data);
    } else {
      createMutation.mutate(data);
    }
  };

  const handleTotalsChange = (subtotal: number, tax: number, total: number) => {
    form.setValue("subtotal", subtotal.toFixed(2));
    form.setValue("taxes", tax.toFixed(2));
    form.setValue("total", total.toFixed(2));
  };

  const subtotal = parseFloat(form.watch("subtotal") || "0");
  const taxes = parseFloat(form.watch("taxes") || "0");
  const total = parseFloat(form.watch("total") || "0");

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
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
                        <SelectItem value="sent">Inviata</SelectItem>
                        <SelectItem value="accepted">Accettata</SelectItem>
                        <SelectItem value="rejected">Rifiutata</SelectItem>
                        <SelectItem value="expired">Scaduta</SelectItem>
                        <SelectItem value="cancelled">Annullata</SelectItem>
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
                name="issueDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Data Emissione</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} value={field.value || ""} data-testid="input-issue-date" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="validFrom"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Valido Da</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} value={field.value || ""} data-testid="input-valid-from" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="validTo"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Scadenza *</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} value={field.value || ""} data-testid="input-valid-to" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-3 gap-4">
              <FormField
                control={form.control}
                name="paymentTerms"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Termini di Pagamento</FormLabel>
                    <FormControl>
                      <Input {...field} value={field.value || ""} placeholder="es. 30 gg DF" data-testid="input-payment-terms" />
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
                    <FormLabel>Modalità di Consegna</FormLabel>
                    <FormControl>
                      <Input {...field} value={field.value || ""} placeholder="es. Remoto, On-site" data-testid="input-delivery-mode" />
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
                        <SelectItem value="EUR">EUR</SelectItem>
                        <SelectItem value="USD">USD</SelectItem>
                        <SelectItem value="GBP">GBP</SelectItem>
                        <SelectItem value="CHF">CHF</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {quote && (
              <div className="p-3 bg-blue-50 rounded-lg text-sm">
                <span className="font-medium">Offerta #{quote.quoteNumber}</span>
                <span className="ml-4 text-gray-500">v{quote.version}</span>
              </div>
            )}

            <div className="p-4 bg-gray-50 rounded-lg">
              <div className="grid grid-cols-3 gap-4 text-sm">
                <div>
                  <span className="text-gray-500">Imponibile:</span>
                  <span className="ml-2 font-medium">€{subtotal.toFixed(2)}</span>
                </div>
                <div>
                  <span className="text-gray-500">IVA:</span>
                  <span className="ml-2 font-medium">€{taxes.toFixed(2)}</span>
                </div>
                <div>
                  <span className="text-gray-500">Totale:</span>
                  <span className="ml-2 font-bold text-lg">€{total.toFixed(2)}</span>
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="items" className="mt-4">
            <QuoteItemsEditor 
              quoteId={quote?.id} 
              onTotalsChange={handleTotalsChange}
              tempItems={!quote ? tempItems : undefined}
              onTempItemsChange={!quote ? setTempItems : undefined}
            />
          </TabsContent>

          <TabsContent value="notes" className="space-y-4 mt-4">
            <FormField
              control={form.control}
              name="externalNotes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Note Esterne (visibili al cliente)</FormLabel>
                  <FormControl>
                    <Textarea 
                      {...field} 
                      value={field.value || ""} 
                      placeholder="Queste note saranno visibili al cliente..." 
                      rows={4}
                      data-testid="textarea-external-notes" 
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="internalNotes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Note Interne (non visibili al cliente)</FormLabel>
                  <FormControl>
                    <Textarea 
                      {...field} 
                      value={field.value || ""} 
                      placeholder="Note solo per uso interno..." 
                      rows={4}
                      data-testid="textarea-internal-notes" 
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </TabsContent>
        </Tabs>

        <div className="flex justify-end gap-4 pt-4 border-t">
          <Button type="submit" disabled={isPending} data-testid="button-submit-quote">
            {isPending ? "Salvataggio..." : quote ? "Aggiorna Offerta" : "Crea Offerta"}
          </Button>
        </div>
      </form>
    </Form>
  );
}
