import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, getQueryFn } from "@/lib/queryClient";
import { QuoteItem } from "@shared/schema";
import { Plus, Trash2, Save } from "lucide-react";

interface QuoteItemsEditorProps {
  quoteId: string;
  onTotalChange: (subtotal: number) => void;
}

interface ItemForm {
  id?: string;
  lineNumber: number;
  itemType: "service" | "package" | "expense";
  description: string;
  quantity: string;
  unitOfMeasure: string;
  unitPrice: string;
  discountPercent: string;
  lineTotal: string;
  notes: string;
  isNew?: boolean;
  isModified?: boolean;
}

export default function QuoteItemsEditor({ quoteId, onTotalChange }: QuoteItemsEditorProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [items, setItems] = useState<ItemForm[]>([]);
  const [initialized, setInitialized] = useState(false);

  const { data: quoteItems = [], isLoading } = useQuery<QuoteItem[]>({
    queryKey: ["/api/quotes", quoteId, "items"],
    queryFn: getQueryFn({ on401: "throw" }),
    enabled: !!quoteId,
  });

  if (!initialized && quoteItems.length > 0) {
    setItems(quoteItems.map(item => ({
      id: item.id,
      lineNumber: item.lineNumber,
      itemType: item.itemType as "service" | "package" | "expense",
      description: item.description,
      quantity: item.quantity,
      unitOfMeasure: item.unitOfMeasure || "ore",
      unitPrice: item.unitPrice,
      discountPercent: item.discountPercent || "0",
      lineTotal: item.lineTotal,
      notes: item.notes || "",
      isNew: false,
      isModified: false,
    })));
    setInitialized(true);
  }

  if (!initialized && quoteItems.length === 0 && !isLoading) {
    setInitialized(true);
  }

  const createMutation = useMutation({
    mutationFn: (data: Partial<ItemForm>) => apiRequest("POST", `/api/quotes/${quoteId}/items`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/quotes", quoteId, "items"] });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<ItemForm> }) => 
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

  const calculateLineTotal = (quantity: string, unitPrice: string, discountPercent: string): string => {
    const qty = parseFloat(quantity) || 0;
    const price = parseFloat(unitPrice) || 0;
    const discount = parseFloat(discountPercent) || 0;
    const gross = qty * price;
    const net = gross * (1 - discount / 100);
    return net.toFixed(2);
  };

  const updateSubtotal = (currentItems: ItemForm[]) => {
    const subtotal = currentItems.reduce((sum, item) => sum + parseFloat(item.lineTotal || "0"), 0);
    onTotalChange(subtotal);
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
      lineTotal: "0.00",
      notes: "",
      isNew: true,
      isModified: false,
    };
    setItems([...items, newItem]);
  };

  const updateItem = (index: number, field: keyof ItemForm, value: string) => {
    const updatedItems = [...items];
    updatedItems[index] = { ...updatedItems[index], [field]: value, isModified: true };
    
    if (field === "quantity" || field === "unitPrice" || field === "discountPercent") {
      updatedItems[index].lineTotal = calculateLineTotal(
        field === "quantity" ? value : updatedItems[index].quantity,
        field === "unitPrice" ? value : updatedItems[index].unitPrice,
        field === "discountPercent" ? value : updatedItems[index].discountPercent
      );
    }
    
    setItems(updatedItems);
    updateSubtotal(updatedItems);
  };

  const removeItem = async (index: number) => {
    const item = items[index];
    if (item.id && !item.isNew) {
      try {
        await deleteMutation.mutateAsync(item.id);
        toast({ title: "Riga eliminata", description: "La riga è stata eliminata con successo" });
      } catch (error) {
        toast({ title: "Errore", description: "Errore durante l'eliminazione", variant: "destructive" });
        return;
      }
    }
    const updatedItems = items.filter((_, i) => i !== index).map((item, i) => ({ ...item, lineNumber: i + 1 }));
    setItems(updatedItems);
    updateSubtotal(updatedItems);
  };

  const saveItem = async (index: number) => {
    const item = items[index];
    if (!item.description.trim()) {
      toast({ title: "Errore", description: "La descrizione è obbligatoria", variant: "destructive" });
      return;
    }

    const itemData = {
      lineNumber: item.lineNumber,
      itemType: item.itemType,
      description: item.description,
      quantity: item.quantity,
      unitOfMeasure: item.unitOfMeasure,
      unitPrice: item.unitPrice,
      discountPercent: item.discountPercent,
      lineTotal: item.lineTotal,
      notes: item.notes,
    };

    try {
      if (item.isNew) {
        const response = await createMutation.mutateAsync(itemData);
        const savedItem = await response.json();
        const updatedItems = [...items];
        updatedItems[index] = { ...updatedItems[index], id: savedItem.id, isNew: false, isModified: false };
        setItems(updatedItems);
        toast({ title: "Riga salvata", description: "La riga è stata creata con successo" });
      } else if (item.id) {
        await updateMutation.mutateAsync({ id: item.id, data: itemData });
        const updatedItems = [...items];
        updatedItems[index] = { ...updatedItems[index], isModified: false };
        setItems(updatedItems);
        toast({ title: "Riga aggiornata", description: "La riga è stata aggiornata con successo" });
      }
    } catch (error) {
      toast({ title: "Errore", description: "Errore durante il salvataggio", variant: "destructive" });
    }
  };

  if (isLoading) {
    return <div className="p-4 text-center text-gray-500">Caricamento righe...</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-medium">Righe Offerta</h3>
        <Button type="button" onClick={addNewItem} size="sm" data-testid="button-add-item">
          <Plus className="w-4 h-4 mr-1" />
          Aggiungi Riga
        </Button>
      </div>

      {items.length === 0 ? (
        <div className="p-8 text-center text-gray-500 border-2 border-dashed rounded-lg">
          Nessuna riga. Clicca "Aggiungi Riga" per iniziare.
        </div>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">#</TableHead>
                <TableHead className="w-24">Tipo</TableHead>
                <TableHead>Descrizione</TableHead>
                <TableHead className="w-20">Qtà</TableHead>
                <TableHead className="w-16">U.M.</TableHead>
                <TableHead className="w-24">Prezzo</TableHead>
                <TableHead className="w-20">Sc.%</TableHead>
                <TableHead className="w-24">Totale</TableHead>
                <TableHead className="w-20">Azioni</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item, index) => (
                <TableRow key={index} className={item.isNew || item.isModified ? "bg-yellow-50" : ""}>
                  <TableCell className="font-medium">{item.lineNumber}</TableCell>
                  <TableCell>
                    <Select 
                      value={item.itemType} 
                      onValueChange={(val) => updateItem(index, "itemType", val as any)}
                    >
                      <SelectTrigger className="h-8" data-testid={`select-item-type-${index}`}>
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
                    <Input 
                      value={item.description}
                      onChange={(e) => updateItem(index, "description", e.target.value)}
                      placeholder="Descrizione..."
                      className="h-8"
                      data-testid={`input-description-${index}`}
                    />
                  </TableCell>
                  <TableCell>
                    <Input 
                      type="number"
                      step="0.01"
                      value={item.quantity}
                      onChange={(e) => updateItem(index, "quantity", e.target.value)}
                      className="h-8 w-16"
                      data-testid={`input-quantity-${index}`}
                    />
                  </TableCell>
                  <TableCell>
                    <Select 
                      value={item.unitOfMeasure} 
                      onValueChange={(val) => updateItem(index, "unitOfMeasure", val)}
                    >
                      <SelectTrigger className="h-8 w-14" data-testid={`select-unit-${index}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ore">ore</SelectItem>
                        <SelectItem value="giorni">gg</SelectItem>
                        <SelectItem value="pz">pz</SelectItem>
                        <SelectItem value="mese">mese</SelectItem>
                        <SelectItem value="pacchetto">pkt</SelectItem>
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <Input 
                      type="number"
                      step="0.01"
                      value={item.unitPrice}
                      onChange={(e) => updateItem(index, "unitPrice", e.target.value)}
                      className="h-8 w-20"
                      data-testid={`input-unit-price-${index}`}
                    />
                  </TableCell>
                  <TableCell>
                    <Input 
                      type="number"
                      step="0.01"
                      value={item.discountPercent}
                      onChange={(e) => updateItem(index, "discountPercent", e.target.value)}
                      className="h-8 w-16"
                      data-testid={`input-discount-${index}`}
                    />
                  </TableCell>
                  <TableCell className="font-medium">
                    €{item.lineTotal}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      {(item.isNew || item.isModified) && (
                        <Button 
                          type="button" 
                          variant="ghost" 
                          size="sm"
                          onClick={() => saveItem(index)}
                          data-testid={`button-save-item-${index}`}
                        >
                          <Save className="w-4 h-4 text-green-600" />
                        </Button>
                      )}
                      <Button 
                        type="button" 
                        variant="ghost" 
                        size="sm"
                        onClick={() => removeItem(index)}
                        data-testid={`button-delete-item-${index}`}
                      >
                        <Trash2 className="w-4 h-4 text-red-500" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <div className="flex justify-end p-2 bg-gray-50 rounded">
        <div className="text-lg font-bold">
          Subtotale: €{items.reduce((sum, item) => sum + parseFloat(item.lineTotal || "0"), 0).toFixed(2)}
        </div>
      </div>
    </div>
  );
}
