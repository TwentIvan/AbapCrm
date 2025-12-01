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

  const getItemTypeLabel = (type: string) => {
    switch (type) {
      case "service": return "Servizio";
      case "package": return "Pacchetto";
      case "expense": return "Spesa";
      default: return type;
    }
  };

  const getProjectName = (projectId?: string) => {
    if (!projectId) return "-";
    const project = projects.find(p => p.id === projectId);
    return project?.name || "-";
  };

  if (isReadOnly) {
    return (
      <div className="space-y-4">
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-amber-800 text-sm">
          <strong>Attenzione:</strong> L'ordine non è in stato "Bozza" - le righe sono in sola lettura.
        </div>
        <div className="border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-gray-50">
                <TableHead className="w-10">#</TableHead>
                <TableHead className="w-28">Tipo</TableHead>
                <TableHead className="w-40">Progetto</TableHead>
                <TableHead>Descrizione</TableHead>
                <TableHead className="w-20 text-right">Qtà</TableHead>
                <TableHead className="w-28 text-right">Prezzo</TableHead>
                <TableHead className="w-20 text-right">IVA %</TableHead>
                <TableHead className="w-28 text-right">IVA €</TableHead>
                <TableHead className="w-28 text-right">Totale</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item, index) => (
                <TableRow key={item.id || index}>
                  <TableCell className="font-medium text-gray-500">{item.lineNumber}</TableCell>
                  <TableCell>{getItemTypeLabel(item.itemType)}</TableCell>
                  <TableCell>{getProjectName(item.projectId)}</TableCell>
                  <TableCell>{item.description}</TableCell>
                  <TableCell className="text-right">{item.quantity}</TableCell>
                  <TableCell className="text-right">€{parseFloat(item.unitPrice).toFixed(2)}</TableCell>
                  <TableCell className="text-right">{item.vatPercent}%</TableCell>
                  <TableCell className="text-right">€{parseFloat(item.vatAmount).toFixed(2)}</TableCell>
                  <TableCell className="text-right font-medium">€{parseFloat(item.lineTotal).toFixed(2)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <div className="flex justify-end">
          <div className="bg-gray-50 p-4 rounded-lg space-y-1 text-sm min-w-[200px]">
            <div className="flex justify-between">
              <span className="text-gray-600">Imponibile:</span>
              <span className="font-medium">€{items.reduce((sum, item) => sum + parseFloat(item.lineTotal || "0"), 0).toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">IVA:</span>
              <span className="font-medium">€{items.reduce((sum, item) => sum + parseFloat(item.vatAmount || "0"), 0).toFixed(2)}</span>
            </div>
            <div className="flex justify-between pt-2 border-t">
              <span className="font-bold">Totale:</span>
              <span className="font-bold">€{(
                items.reduce((sum, item) => sum + parseFloat(item.lineTotal || "0"), 0) +
                items.reduce((sum, item) => sum + parseFloat(item.vatAmount || "0"), 0)
              ).toFixed(2)}</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <Button type="button" variant="outline" size="sm" onClick={addNewItem} data-testid="button-add-order-item">
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
                <TableHead className="w-28">Tipo</TableHead>
                <TableHead className="w-40">Progetto</TableHead>
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
                <TableRow 
                  key={item.id || index}
                  className={item.isModified || item.isNew ? "bg-yellow-50" : ""}
                >
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
                        <SelectItem value="service">Servizio</SelectItem>
                        <SelectItem value="package">Pacchetto</SelectItem>
                        <SelectItem value="expense">Spesa</SelectItem>
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <Select 
                      value={item.projectId || "__none__"} 
                      onValueChange={(val) => updateItem(index, "projectId", val === "__none__" ? "" : val)}
                    >
                      <SelectTrigger className="h-8 text-xs" data-testid={`select-project-${index}`}>
                        <SelectValue placeholder="Seleziona..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">Nessuno</SelectItem>
                        {projects.map((p) => (
                          <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <Input
                      value={item.description}
                      onChange={(e) => updateItem(index, "description", e.target.value)}
                      placeholder="Descrizione..."
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
                      data-testid={`input-price-${index}`}
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
                      {(item.isModified || item.isNew) && salesOrderId && (
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          onClick={() => saveItem(index)}
                          className="h-7 w-7"
                          data-testid={`button-save-item-${index}`}
                        >
                          <Save className="h-3.5 w-3.5 text-green-600" />
                        </Button>
                      )}
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        onClick={() => deleteItem(index)}
                        className="h-7 w-7"
                        data-testid={`button-delete-item-${index}`}
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
