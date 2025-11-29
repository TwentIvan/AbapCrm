import { useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, getQueryFn } from "@/lib/queryClient";
import { QuoteItem, RateAgreement, Project } from "@shared/schema";
import { Plus, Trash2, Save } from "lucide-react";

interface QuoteItemsEditorProps {
  quoteId?: string;
  onTotalsChange: (subtotal: number, tax: number, total: number) => void;
  tempItems?: ItemForm[];
  onTempItemsChange?: (items: ItemForm[]) => void;
}

export interface ItemForm {
  id?: string;
  lineNumber: number;
  itemType: "manual" | "rate_agreement" | "project";
  referenceId?: string;
  description: string;
  quantity: string;
  unitPrice: string;
  vatPercent: string;
  vatAmount: string;
  lineTotal: string;
  isNew?: boolean;
  isModified?: boolean;
}

export default function QuoteItemsEditor({ 
  quoteId, 
  onTotalsChange, 
  tempItems, 
  onTempItemsChange 
}: QuoteItemsEditorProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [items, setItems] = useState<ItemForm[]>(tempItems || []);
  const [lastQuoteId, setLastQuoteId] = useState<string | undefined>(undefined);

  const { data: quoteItems = [], isLoading } = useQuery<QuoteItem[]>({
    queryKey: ["/api/quotes", quoteId, "items"],
    queryFn: getQueryFn({ on401: "throw" }),
    enabled: !!quoteId,
  });

  const { data: rateAgreements = [] } = useQuery<RateAgreement[]>({
    queryKey: ["/api/rate-agreements"],
    queryFn: getQueryFn({ on401: "throw" }),
  });

  const { data: projects = [] } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
    queryFn: getQueryFn({ on401: "throw" }),
  });

  useEffect(() => {
    if (tempItems && !quoteId) {
      setItems(tempItems);
    }
  }, [tempItems, quoteId]);

  useEffect(() => {
    if (quoteId && quoteId !== lastQuoteId && !isLoading) {
      setLastQuoteId(quoteId);
      if (quoteItems.length > 0) {
        const loadedItems = quoteItems.map(item => {
          const lineTotal = parseFloat(item.lineTotal) || 0;
          const vatPercent = "22";
          const vatAmount = (lineTotal * 0.22).toFixed(2);
          return {
            id: item.id,
            lineNumber: item.lineNumber,
            itemType: (item.itemType as "manual" | "rate_agreement" | "project") || "manual",
            referenceId: item.rateAgreementId || item.projectId || undefined,
            description: item.description,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            vatPercent,
            vatAmount,
            lineTotal: item.lineTotal,
            isNew: false,
            isModified: false,
          };
        });
        setItems(loadedItems);
        recalculateTotals(loadedItems);
      } else {
        setItems([]);
      }
    }
  }, [quoteItems, quoteId, lastQuoteId, isLoading]);

  const createMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", `/api/quotes/${quoteId}/items`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/quotes", quoteId, "items"] });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => 
      apiRequest("PUT", `/api/quotes/${quoteId}/items/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/quotes", quoteId, "items"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/quotes/${quoteId}/items/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/quotes", quoteId, "items"] });
    },
  });

  const calculateLineAmounts = (quantity: string, unitPrice: string, vatPercent: string) => {
    const qty = parseFloat(quantity) || 0;
    const price = parseFloat(unitPrice) || 0;
    const vat = parseFloat(vatPercent) || 22;
    const lineTotal = qty * price;
    const vatAmount = lineTotal * (vat / 100);
    return { lineTotal: lineTotal.toFixed(2), vatAmount: vatAmount.toFixed(2) };
  };

  const recalculateTotals = (itemsList: ItemForm[]) => {
    const subtotal = itemsList.reduce((sum, item) => sum + parseFloat(item.lineTotal || "0"), 0);
    const tax = itemsList.reduce((sum, item) => sum + parseFloat(item.vatAmount || "0"), 0);
    const total = subtotal + tax;
    onTotalsChange(subtotal, tax, total);
  };

  const updateItemsState = (newItems: ItemForm[]) => {
    setItems(newItems);
    recalculateTotals(newItems);
    if (onTempItemsChange && !quoteId) {
      onTempItemsChange(newItems);
    }
  };

  const addNewItem = () => {
    const newItem: ItemForm = {
      lineNumber: items.length + 1,
      itemType: "manual",
      description: "",
      quantity: "1",
      unitPrice: "0",
      vatPercent: "22",
      vatAmount: "0.00",
      lineTotal: "0.00",
      isNew: true,
      isModified: false,
    };
    updateItemsState([...items, newItem]);
  };

  const updateItem = (index: number, field: keyof ItemForm, value: string) => {
    const newItems = [...items];
    const item = { ...newItems[index], [field]: value, isModified: true };
    
    if (field === "quantity" || field === "unitPrice" || field === "vatPercent") {
      const amounts = calculateLineAmounts(
        field === "quantity" ? value : item.quantity,
        field === "unitPrice" ? value : item.unitPrice,
        field === "vatPercent" ? value : item.vatPercent
      );
      item.lineTotal = amounts.lineTotal;
      item.vatAmount = amounts.vatAmount;
    }

    if (field === "itemType") {
      item.referenceId = undefined;
      if (value === "manual") {
        item.description = "";
        item.unitPrice = "0";
      }
    }

    if (field === "referenceId") {
      if (item.itemType === "rate_agreement") {
        const agreement = rateAgreements.find(a => a.id === value);
        if (agreement) {
          const dailyRate = (parseFloat(agreement.hourlyRate) * 8).toFixed(2);
          item.description = `Consulenza: ${agreement.name}`;
          item.unitPrice = dailyRate;
          const amounts = calculateLineAmounts(item.quantity, dailyRate, item.vatPercent);
          item.lineTotal = amounts.lineTotal;
          item.vatAmount = amounts.vatAmount;
        }
      } else if (item.itemType === "project") {
        const project = projects.find(p => p.id === value);
        if (project) {
          const estimatedDays = project.estimatedEffort ? Math.ceil(project.estimatedEffort / 8) : 1;
          const budget = project.budget ? parseFloat(project.budget) : 0;
          const unitPrice = budget > 0 && estimatedDays > 0 ? (budget / estimatedDays).toFixed(2) : "0";
          item.description = `Progetto: ${project.name}`;
          item.quantity = estimatedDays.toString();
          item.unitPrice = unitPrice;
          const amounts = calculateLineAmounts(item.quantity, unitPrice, item.vatPercent);
          item.lineTotal = amounts.lineTotal;
          item.vatAmount = amounts.vatAmount;
        }
      }
    }
    
    newItems[index] = item;
    updateItemsState(newItems);
  };

  const deleteItem = async (index: number) => {
    const item = items[index];
    if (item.id && quoteId) {
      await deleteMutation.mutateAsync(item.id);
    }
    const newItems = items.filter((_, i) => i !== index).map((item, i) => ({
      ...item,
      lineNumber: i + 1
    }));
    updateItemsState(newItems);
  };

  const saveItem = async (index: number) => {
    const item = items[index];
    if (!quoteId) {
      toast({ title: "Avviso", description: "Salva prima l'offerta", variant: "default" });
      return;
    }

    const itemData = {
      lineNumber: item.lineNumber,
      itemType: item.itemType,
      description: item.description,
      quantity: item.quantity,
      unitOfMeasure: "giorni",
      unitPrice: item.unitPrice,
      discountPercent: "0",
      lineTotal: item.lineTotal,
      rateAgreementId: item.itemType === "rate_agreement" ? item.referenceId : null,
      projectId: item.itemType === "project" ? item.referenceId : null,
    };

    try {
      if (item.id) {
        await updateMutation.mutateAsync({ id: item.id, data: itemData });
      } else {
        await createMutation.mutateAsync(itemData);
      }
      
      const newItems = [...items];
      newItems[index] = { ...item, isNew: false, isModified: false };
      setItems(newItems);
      toast({ title: "Salvato", description: "Riga salvata" });
    } catch (error) {
      toast({ title: "Errore", description: "Impossibile salvare", variant: "destructive" });
    }
  };

  if (isLoading && quoteId) {
    return <div className="p-4 text-center text-gray-500">Caricamento...</div>;
  }

  const subtotal = items.reduce((sum, item) => sum + parseFloat(item.lineTotal || "0"), 0);
  const totalVat = items.reduce((sum, item) => sum + parseFloat(item.vatAmount || "0"), 0);
  const grandTotal = subtotal + totalVat;

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <Button type="button" variant="outline" size="sm" onClick={addNewItem} data-testid="button-add-item">
          <Plus className="h-4 w-4 mr-1" /> Nuova Riga
        </Button>
      </div>

      {items.length === 0 ? (
        <div className="p-8 text-center text-gray-500 border-2 border-dashed rounded-lg">
          Nessuna riga. Clicca "Nuova Riga" per iniziare.
        </div>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-gray-50">
                <TableHead className="w-10">#</TableHead>
                <TableHead className="w-32">Tipo</TableHead>
                <TableHead className="w-40">Riferimento</TableHead>
                <TableHead>Descrizione</TableHead>
                <TableHead className="w-20 text-right">Qtà</TableHead>
                <TableHead className="w-28 text-right">Prezzo</TableHead>
                <TableHead className="w-20 text-right">IVA %</TableHead>
                <TableHead className="w-28 text-right">IVA €</TableHead>
                <TableHead className="w-28 text-right">Totale</TableHead>
                <TableHead className="w-20"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item, index) => (
                <TableRow key={index} className={item.isModified || item.isNew ? "bg-yellow-50" : ""}>
                  <TableCell className="font-medium text-gray-500">{item.lineNumber}</TableCell>
                  <TableCell>
                    <Select 
                      value={item.itemType} 
                      onValueChange={(val) => updateItem(index, "itemType", val)}
                    >
                      <SelectTrigger className="h-8 text-xs" data-testid={`select-type-${index}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="manual">Manuale</SelectItem>
                        <SelectItem value="rate_agreement">Accordo</SelectItem>
                        <SelectItem value="project">Progetto</SelectItem>
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    {item.itemType === "rate_agreement" ? (
                      <Select 
                        value={item.referenceId || ""} 
                        onValueChange={(val) => updateItem(index, "referenceId", val)}
                      >
                        <SelectTrigger className="h-8 text-xs" data-testid={`select-ref-${index}`}>
                          <SelectValue placeholder="Seleziona..." />
                        </SelectTrigger>
                        <SelectContent>
                          {rateAgreements.map((a) => (
                            <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : item.itemType === "project" ? (
                      <Select 
                        value={item.referenceId || ""} 
                        onValueChange={(val) => updateItem(index, "referenceId", val)}
                      >
                        <SelectTrigger className="h-8 text-xs" data-testid={`select-ref-${index}`}>
                          <SelectValue placeholder="Seleziona..." />
                        </SelectTrigger>
                        <SelectContent>
                          {projects.map((p) => (
                            <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <span className="text-xs text-gray-400">-</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Input
                      value={item.description}
                      onChange={(e) => updateItem(index, "description", e.target.value)}
                      placeholder="Descrizione"
                      className="h-8 text-sm"
                      data-testid={`input-description-${index}`}
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      value={item.quantity}
                      onChange={(e) => updateItem(index, "quantity", e.target.value)}
                      className="h-8 text-sm text-right"
                      data-testid={`input-quantity-${index}`}
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      step="0.01"
                      value={item.unitPrice}
                      onChange={(e) => updateItem(index, "unitPrice", e.target.value)}
                      className="h-8 text-sm text-right"
                      data-testid={`input-unit-price-${index}`}
                    />
                  </TableCell>
                  <TableCell>
                    <Select 
                      value={item.vatPercent} 
                      onValueChange={(val) => updateItem(index, "vatPercent", val)}
                    >
                      <SelectTrigger className="h-8 text-xs" data-testid={`select-vat-${index}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="0">0%</SelectItem>
                        <SelectItem value="4">4%</SelectItem>
                        <SelectItem value="10">10%</SelectItem>
                        <SelectItem value="22">22%</SelectItem>
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell className="text-right text-sm">
                    €{parseFloat(item.vatAmount).toFixed(2)}
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    €{parseFloat(item.lineTotal).toFixed(2)}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      {(item.isNew || item.isModified) && quoteId && (
                        <Button 
                          type="button"
                          size="icon" 
                          variant="ghost"
                          className="h-7 w-7"
                          onClick={() => saveItem(index)}
                          data-testid={`button-save-${index}`}
                        >
                          <Save className="h-3.5 w-3.5 text-green-600" />
                        </Button>
                      )}
                      <Button 
                        type="button"
                        size="icon" 
                        variant="ghost"
                        className="h-7 w-7"
                        onClick={() => deleteItem(index)}
                        data-testid={`button-delete-${index}`}
                      >
                        <Trash2 className="h-3.5 w-3.5 text-red-500" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {items.length > 0 && (
        <div className="flex justify-end">
          <div className="bg-gray-50 p-4 rounded-lg space-y-1 text-sm min-w-[200px]">
            <div className="flex justify-between">
              <span className="text-gray-600">Imponibile:</span>
              <span className="font-medium">€{subtotal.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">IVA:</span>
              <span className="font-medium">€{totalVat.toFixed(2)}</span>
            </div>
            <div className="flex justify-between border-t pt-1 mt-1">
              <span className="font-semibold">Totale:</span>
              <span className="font-bold text-lg">€{grandTotal.toFixed(2)}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
