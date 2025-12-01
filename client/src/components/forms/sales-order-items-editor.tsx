import { useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, getQueryFn } from "@/lib/queryClient";
import { SalesOrderItem, Project } from "@shared/schema";
import { Plus, Trash2, Save } from "lucide-react";

interface SalesOrderItemsEditorProps {
  salesOrderId?: string;
  orderStatus?: string;
  onTotalsChange: (subtotal: number, tax: number, total: number) => void;
  tempItems?: ItemForm[];
  onTempItemsChange?: (items: ItemForm[]) => void;
}

export interface ItemForm {
  id?: string;
  lineNumber: number;
  itemType: "service" | "package" | "expense";
  description: string;
  quantity: string;
  unitOfMeasure: string;
  unitPrice: string;
  discountPercent: string;
  vatPercent: string;
  vatAmount: string;
  lineTotal: string;
  customerOrderReference: string;
  customerOrderLineReference: string;
  projectId?: string;
  quoteItemId?: string;
  notes: string;
  isNew?: boolean;
  isModified?: boolean;
}

export default function SalesOrderItemsEditor({ 
  salesOrderId, 
  orderStatus,
  onTotalsChange, 
  tempItems, 
  onTempItemsChange 
}: SalesOrderItemsEditorProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [items, setItems] = useState<ItemForm[]>(tempItems || []);
  const [lastOrderId, setLastOrderId] = useState<string | undefined>(undefined);
  
  const isReadOnly = !!(orderStatus && orderStatus !== "draft");

  const { data: orderItems = [], isLoading } = useQuery<SalesOrderItem[]>({
    queryKey: ["/api/sales-orders", salesOrderId, "items"],
    queryFn: getQueryFn({ on401: "throw" }),
    enabled: !!salesOrderId,
  });

  const { data: projects = [] } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
    queryFn: getQueryFn({ on401: "throw" }),
  });

  useEffect(() => {
    if (tempItems && !salesOrderId) {
      setItems(tempItems);
    }
  }, [tempItems, salesOrderId]);

  useEffect(() => {
    if (salesOrderId && salesOrderId !== lastOrderId && !isLoading) {
      setLastOrderId(salesOrderId);
      if (orderItems.length > 0) {
        const loadedItems = orderItems.map(item => {
          const lineTotal = parseFloat(item.lineTotal) || 0;
          const vatPercent = "22";
          const vatAmount = (lineTotal * 0.22).toFixed(2);
          return {
            id: item.id,
            lineNumber: item.lineNumber,
            itemType: item.itemType as "service" | "package" | "expense",
            description: item.description,
            quantity: item.quantity,
            unitOfMeasure: item.unitOfMeasure || "ore",
            unitPrice: item.unitPrice,
            discountPercent: item.discountPercent || "0",
            vatPercent,
            vatAmount,
            lineTotal: item.lineTotal,
            customerOrderReference: item.customerOrderReference || "",
            customerOrderLineReference: item.customerOrderLineReference || "",
            projectId: item.projectId || undefined,
            quoteItemId: item.quoteItemId || undefined,
            notes: item.notes || "",
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
  }, [orderItems, salesOrderId, lastOrderId, isLoading]);

  const createMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", `/api/sales-orders/${salesOrderId}/items`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sales-orders", salesOrderId, "items"] });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => 
      apiRequest("PUT", `/api/sales-orders/${salesOrderId}/items/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sales-orders", salesOrderId, "items"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/sales-orders/${salesOrderId}/items/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sales-orders", salesOrderId, "items"] });
    },
  });

  const calculateLineAmounts = (quantity: string, unitPrice: string, discountPercent: string, vatPercent: string) => {
    const qty = parseFloat(quantity) || 0;
    const price = parseFloat(unitPrice) || 0;
    const discount = parseFloat(discountPercent) || 0;
    const vat = parseFloat(vatPercent) || 22;
    const grossTotal = qty * price;
    const discountAmount = grossTotal * (discount / 100);
    const lineTotal = grossTotal - discountAmount;
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
    if (onTempItemsChange && !salesOrderId) {
      onTempItemsChange(newItems);
    }
  };

  const addNewItem = () => {
    const newItem: ItemForm = {
      lineNumber: items.length + 1,
      itemType: "service",
      description: "",
      quantity: "1",
      unitOfMeasure: "ore",
      unitPrice: "0",
      discountPercent: "0",
      vatPercent: "22",
      vatAmount: "0.00",
      lineTotal: "0.00",
      customerOrderReference: "",
      customerOrderLineReference: "",
      notes: "",
      isNew: true,
      isModified: false,
    };
    updateItemsState([...items, newItem]);
  };

  const updateItem = (index: number, field: keyof ItemForm, value: string) => {
    const newItems = [...items];
    const item = { ...newItems[index], [field]: value, isModified: true };
    
    if (field === "quantity" || field === "unitPrice" || field === "discountPercent" || field === "vatPercent") {
      const amounts = calculateLineAmounts(
        field === "quantity" ? value : item.quantity,
        field === "unitPrice" ? value : item.unitPrice,
        field === "discountPercent" ? value : item.discountPercent,
        field === "vatPercent" ? value : item.vatPercent
      );
      item.lineTotal = amounts.lineTotal;
      item.vatAmount = amounts.vatAmount;
    }
    
    newItems[index] = item;
    updateItemsState(newItems);
  };

  const deleteItem = async (index: number) => {
    const item = items[index];
    if (item.id && salesOrderId) {
      try {
        await deleteMutation.mutateAsync(item.id);
        toast({ title: "Eliminata", description: "Riga eliminata" });
      } catch (error) {
        toast({ title: "Errore", description: "Errore nell'eliminazione", variant: "destructive" });
        return;
      }
    }
    const newItems = items.filter((_, i) => i !== index).map((item, i) => ({ ...item, lineNumber: i + 1 }));
    updateItemsState(newItems);
  };

  const saveItem = async (index: number) => {
    const item = items[index];
    if (!salesOrderId) {
      toast({ title: "Info", description: "Salva prima l'ordine" });
      return;
    }

    const dbItemType = item.itemType;
    const itemData = {
      lineNumber: item.lineNumber,
      itemType: dbItemType,
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
      toast({ title: "Salvata", description: "Riga salvata con successo" });
    } catch (error) {
      toast({ title: "Errore", description: "Errore nel salvataggio", variant: "destructive" });
    }
  };

  const formatCurrency = (value: string) => {
    const num = parseFloat(value) || 0;
    return `€ ${num.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  if (isReadOnly) {
    return (
      <div className="space-y-4">
        <div className="bg-yellow-50 border border-yellow-200 rounded-md p-3 text-yellow-800 text-sm">
          L'ordine non è in stato "Bozza" - le righe sono in sola lettura
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">#</TableHead>
              <TableHead>Descrizione</TableHead>
              <TableHead className="w-20">Qtà</TableHead>
              <TableHead className="w-20">U.M.</TableHead>
              <TableHead className="w-24">Prezzo</TableHead>
              <TableHead className="w-20">Sconto %</TableHead>
              <TableHead className="w-24">Importo</TableHead>
              <TableHead className="w-20">IVA %</TableHead>
              <TableHead className="w-32">Rif. Ord. Cliente</TableHead>
              <TableHead className="w-32">Rif. Pos. Ordine</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item, index) => (
              <TableRow key={item.id || index}>
                <TableCell>{item.lineNumber}</TableCell>
                <TableCell>{item.description}</TableCell>
                <TableCell>{item.quantity}</TableCell>
                <TableCell>{item.unitOfMeasure}</TableCell>
                <TableCell>{formatCurrency(item.unitPrice)}</TableCell>
                <TableCell>{item.discountPercent}%</TableCell>
                <TableCell className="font-medium">{formatCurrency(item.lineTotal)}</TableCell>
                <TableCell>{item.vatPercent}%</TableCell>
                <TableCell>{item.customerOrderReference || "-"}</TableCell>
                <TableCell>{item.customerOrderLineReference || "-"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h4 className="font-medium">Righe Ordine</h4>
        <Button type="button" size="sm" onClick={addNewItem} data-testid="button-add-order-item">
          <Plus className="h-4 w-4 mr-1" /> Aggiungi Riga
        </Button>
      </div>

      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">#</TableHead>
              <TableHead className="min-w-[200px]">Descrizione</TableHead>
              <TableHead className="w-20">Qtà</TableHead>
              <TableHead className="w-24">U.M.</TableHead>
              <TableHead className="w-24">Prezzo</TableHead>
              <TableHead className="w-20">Sc. %</TableHead>
              <TableHead className="w-24">Importo</TableHead>
              <TableHead className="w-20">IVA %</TableHead>
              <TableHead className="w-32">Rif. Ord. Cl.</TableHead>
              <TableHead className="w-32">Rif. Pos.</TableHead>
              <TableHead className="w-24">Azioni</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item, index) => (
              <TableRow 
                key={item.id || index}
                className={item.isModified || item.isNew ? "bg-yellow-50" : ""}
              >
                <TableCell>{item.lineNumber}</TableCell>
                <TableCell>
                  <Input
                    value={item.description}
                    onChange={(e) => updateItem(index, "description", e.target.value)}
                    placeholder="Descrizione..."
                    className="min-w-[180px]"
                    data-testid={`input-description-${index}`}
                  />
                </TableCell>
                <TableCell>
                  <Input
                    type="number"
                    value={item.quantity}
                    onChange={(e) => updateItem(index, "quantity", e.target.value)}
                    className="w-20"
                    data-testid={`input-quantity-${index}`}
                  />
                </TableCell>
                <TableCell>
                  <Select
                    value={item.unitOfMeasure}
                    onValueChange={(value) => updateItem(index, "unitOfMeasure", value)}
                  >
                    <SelectTrigger className="w-24" data-testid={`select-uom-${index}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ore">Ore</SelectItem>
                      <SelectItem value="giorni">Giorni</SelectItem>
                      <SelectItem value="mese">Mese</SelectItem>
                      <SelectItem value="pz">Pz</SelectItem>
                      <SelectItem value="pacchetto">Pacchetto</SelectItem>
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell>
                  <Input
                    type="number"
                    value={item.unitPrice}
                    onChange={(e) => updateItem(index, "unitPrice", e.target.value)}
                    className="w-24"
                    data-testid={`input-price-${index}`}
                  />
                </TableCell>
                <TableCell>
                  <Input
                    type="number"
                    value={item.discountPercent}
                    onChange={(e) => updateItem(index, "discountPercent", e.target.value)}
                    className="w-20"
                    data-testid={`input-discount-${index}`}
                  />
                </TableCell>
                <TableCell className="font-medium">
                  {formatCurrency(item.lineTotal)}
                </TableCell>
                <TableCell>
                  <Input
                    type="number"
                    value={item.vatPercent}
                    onChange={(e) => updateItem(index, "vatPercent", e.target.value)}
                    className="w-20"
                    data-testid={`input-vat-${index}`}
                  />
                </TableCell>
                <TableCell>
                  <Input
                    value={item.customerOrderReference}
                    onChange={(e) => updateItem(index, "customerOrderReference", e.target.value)}
                    placeholder="Rif. ordine"
                    className="w-32"
                    data-testid={`input-cust-order-ref-${index}`}
                  />
                </TableCell>
                <TableCell>
                  <Input
                    value={item.customerOrderLineReference}
                    onChange={(e) => updateItem(index, "customerOrderLineReference", e.target.value)}
                    placeholder="Rif. posizione"
                    className="w-32"
                    data-testid={`input-cust-line-ref-${index}`}
                  />
                </TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    {(item.isModified || item.isNew) && (
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        onClick={() => saveItem(index)}
                        className="h-8 w-8 text-green-600"
                        data-testid={`button-save-item-${index}`}
                      >
                        <Save className="h-4 w-4" />
                      </Button>
                    )}
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      onClick={() => deleteItem(index)}
                      className="h-8 w-8 text-red-600"
                      data-testid={`button-delete-item-${index}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {items.length === 0 && (
              <TableRow>
                <TableCell colSpan={11} className="text-center text-muted-foreground py-8">
                  Nessuna riga. Clicca "Aggiungi Riga" per iniziare.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex justify-end">
        <div className="bg-muted p-4 rounded-lg min-w-[300px]">
          <div className="flex justify-between py-1">
            <span>Totale imponibile:</span>
            <span className="font-medium">
              {formatCurrency(items.reduce((sum, item) => sum + parseFloat(item.lineTotal || "0"), 0).toFixed(2))}
            </span>
          </div>
          <div className="flex justify-between py-1">
            <span>IVA:</span>
            <span className="font-medium">
              {formatCurrency(items.reduce((sum, item) => sum + parseFloat(item.vatAmount || "0"), 0).toFixed(2))}
            </span>
          </div>
          <div className="flex justify-between py-1 border-t mt-2 pt-2">
            <span className="font-bold">TOTALE:</span>
            <span className="font-bold">
              {formatCurrency((
                items.reduce((sum, item) => sum + parseFloat(item.lineTotal || "0"), 0) +
                items.reduce((sum, item) => sum + parseFloat(item.vatAmount || "0"), 0)
              ).toFixed(2))}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
