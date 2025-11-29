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
  onTotalChange: (subtotal: number) => void;
  tempItems?: ItemForm[];
  onTempItemsChange?: (items: ItemForm[]) => void;
}

export interface ItemForm {
  id?: string;
  lineNumber: number;
  description: string;
  quantity: string;
  unitPrice: string;
  lineTotal: string;
  isNew?: boolean;
  isModified?: boolean;
}

export default function QuoteItemsEditor({ 
  quoteId, 
  onTotalChange, 
  tempItems, 
  onTempItemsChange 
}: QuoteItemsEditorProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [items, setItems] = useState<ItemForm[]>(tempItems || []);
  const [initialized, setInitialized] = useState(false);

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
    if (tempItems) {
      setItems(tempItems);
    }
  }, [tempItems]);

  useEffect(() => {
    if (!initialized && quoteId && quoteItems.length > 0) {
      setItems(quoteItems.map(item => ({
        id: item.id,
        lineNumber: item.lineNumber,
        description: item.description,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        lineTotal: item.lineTotal,
        isNew: false,
        isModified: false,
      })));
      setInitialized(true);
    }
  }, [quoteItems, quoteId, initialized]);

  useEffect(() => {
    if (!initialized && quoteId && quoteItems.length === 0 && !isLoading) {
      setInitialized(true);
    }
  }, [quoteItems, quoteId, isLoading, initialized]);

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

  const calculateLineTotal = (quantity: string, unitPrice: string): string => {
    const qty = parseFloat(quantity) || 0;
    const price = parseFloat(unitPrice) || 0;
    return (qty * price).toFixed(2);
  };

  const updateItemsState = (newItems: ItemForm[]) => {
    setItems(newItems);
    const subtotal = newItems.reduce((sum, item) => sum + parseFloat(item.lineTotal || "0"), 0);
    onTotalChange(subtotal);
    if (onTempItemsChange && !quoteId) {
      onTempItemsChange(newItems);
    }
  };

  const addNewItem = () => {
    const newItem: ItemForm = {
      lineNumber: items.length + 1,
      description: "",
      quantity: "1",
      unitPrice: "0",
      lineTotal: "0.00",
      isNew: true,
      isModified: false,
    };
    updateItemsState([...items, newItem]);
  };

  const addFromRateAgreement = (agreementId: string) => {
    const agreement = rateAgreements.find(a => a.id === agreementId);
    if (!agreement) return;

    const dailyRate = (parseFloat(agreement.hourlyRate) * 8).toFixed(2);
    const newItem: ItemForm = {
      lineNumber: items.length + 1,
      description: `Consulenza: ${agreement.name}`,
      quantity: "1",
      unitPrice: dailyRate,
      lineTotal: dailyRate,
      isNew: true,
      isModified: false,
    };
    updateItemsState([...items, newItem]);
    toast({ title: "Aggiunto", description: `Tariffa giornaliera: €${dailyRate}` });
  };

  const addFromProject = (projectId: string) => {
    const project = projects.find(p => p.id === projectId);
    if (!project) return;

    const estimatedDays = project.estimatedEffort ? Math.ceil(project.estimatedEffort / 8) : 1;
    const budget = project.budget ? parseFloat(project.budget) : 0;
    const unitPrice = budget > 0 && estimatedDays > 0 ? (budget / estimatedDays).toFixed(2) : "0";
    const lineTotal = budget > 0 ? budget.toFixed(2) : "0.00";

    const newItem: ItemForm = {
      lineNumber: items.length + 1,
      description: `Progetto: ${project.name}`,
      quantity: estimatedDays.toString(),
      unitPrice,
      lineTotal,
      isNew: true,
      isModified: false,
    };
    updateItemsState([...items, newItem]);
    toast({ title: "Aggiunto", description: `${estimatedDays} giornate` });
  };

  const updateItem = (index: number, field: keyof ItemForm, value: string) => {
    const newItems = [...items];
    const item = { ...newItems[index], [field]: value, isModified: true };
    
    if (field === "quantity" || field === "unitPrice") {
      item.lineTotal = calculateLineTotal(
        field === "quantity" ? value : item.quantity,
        field === "unitPrice" ? value : item.unitPrice
      );
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
      itemType: "service",
      description: item.description,
      quantity: item.quantity,
      unitOfMeasure: "giorni",
      unitPrice: item.unitPrice,
      discountPercent: "0",
      lineTotal: item.lineTotal,
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

  return (
    <div className="space-y-4">
      <div className="flex gap-2 flex-wrap">
        <Button type="button" variant="outline" size="sm" onClick={addNewItem} data-testid="button-add-item">
          <Plus className="h-4 w-4 mr-1" /> Nuova Riga
        </Button>
        
        <Select onValueChange={addFromRateAgreement}>
          <SelectTrigger className="w-[200px]" data-testid="select-rate-agreement">
            <SelectValue placeholder="+ Da Accordo Tariffario" />
          </SelectTrigger>
          <SelectContent>
            {rateAgreements.map((agreement) => (
              <SelectItem key={agreement.id} value={agreement.id}>
                {agreement.name} (€{(parseFloat(agreement.hourlyRate) * 8).toFixed(0)}/gg)
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select onValueChange={addFromProject}>
          <SelectTrigger className="w-[200px]" data-testid="select-project">
            <SelectValue placeholder="+ Da Progetto" />
          </SelectTrigger>
          <SelectContent>
            {projects.map((project) => (
              <SelectItem key={project.id} value={project.id}>
                {project.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {items.length === 0 ? (
        <div className="p-8 text-center text-gray-500 border-2 border-dashed rounded-lg">
          Nessuna riga. Usa i pulsanti sopra per aggiungere righe.
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">#</TableHead>
              <TableHead>Descrizione</TableHead>
              <TableHead className="w-24">Qtà</TableHead>
              <TableHead className="w-32">Prezzo Unit.</TableHead>
              <TableHead className="w-32">Totale</TableHead>
              <TableHead className="w-24"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item, index) => (
              <TableRow key={index} className={item.isModified || item.isNew ? "bg-yellow-50" : ""}>
                <TableCell className="font-medium">{item.lineNumber}</TableCell>
                <TableCell>
                  <Input
                    value={item.description}
                    onChange={(e) => updateItem(index, "description", e.target.value)}
                    placeholder="Descrizione"
                    className="border-0 p-0 h-auto focus-visible:ring-0"
                    data-testid={`input-description-${index}`}
                  />
                </TableCell>
                <TableCell>
                  <Input
                    type="number"
                    value={item.quantity}
                    onChange={(e) => updateItem(index, "quantity", e.target.value)}
                    className="border-0 p-0 h-auto w-full focus-visible:ring-0"
                    data-testid={`input-quantity-${index}`}
                  />
                </TableCell>
                <TableCell>
                  <Input
                    type="number"
                    value={item.unitPrice}
                    onChange={(e) => updateItem(index, "unitPrice", e.target.value)}
                    className="border-0 p-0 h-auto w-full focus-visible:ring-0"
                    data-testid={`input-unit-price-${index}`}
                  />
                </TableCell>
                <TableCell className="font-medium">
                  €{parseFloat(item.lineTotal).toFixed(2)}
                </TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    {(item.isNew || item.isModified) && quoteId && (
                      <Button 
                        type="button"
                        size="icon" 
                        variant="ghost" 
                        onClick={() => saveItem(index)}
                        data-testid={`button-save-${index}`}
                      >
                        <Save className="h-4 w-4 text-green-600" />
                      </Button>
                    )}
                    <Button 
                      type="button"
                      size="icon" 
                      variant="ghost" 
                      onClick={() => deleteItem(index)}
                      data-testid={`button-delete-${index}`}
                    >
                      <Trash2 className="h-4 w-4 text-red-500" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <div className="flex justify-end pt-4 border-t">
        <div className="text-lg font-semibold">
          Subtotale: €{items.reduce((sum, item) => sum + parseFloat(item.lineTotal || "0"), 0).toFixed(2)}
        </div>
      </div>
    </div>
  );
}
