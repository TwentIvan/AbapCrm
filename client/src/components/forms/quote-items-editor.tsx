import { useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, getQueryFn } from "@/lib/queryClient";
import { QuoteItem, RateAgreement, Project } from "@shared/schema";
import { Plus, Trash2, Save, Calculator, FileText, Briefcase } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface QuoteItemsEditorProps {
  quoteId?: string;
  onTotalChange: (subtotal: number) => void;
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
  lineTotal: string;
  notes: string;
  rateAgreementId?: string | null;
  projectId?: string | null;
  humanResourceId?: string | null;
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
        itemType: item.itemType as "service" | "package" | "expense",
        description: item.description,
        quantity: item.quantity,
        unitOfMeasure: item.unitOfMeasure || "ore",
        unitPrice: item.unitPrice,
        discountPercent: item.discountPercent || "0",
        lineTotal: item.lineTotal,
        notes: item.notes || "",
        rateAgreementId: item.rateAgreementId,
        projectId: item.projectId,
        humanResourceId: item.humanResourceId,
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
      itemType: "service",
      description: "",
      quantity: "1",
      unitOfMeasure: "giorni",
      unitPrice: "0",
      discountPercent: "0",
      lineTotal: "0.00",
      notes: "",
      rateAgreementId: null,
      projectId: null,
      isNew: true,
      isModified: false,
    };
    updateItemsState([...items, newItem]);
  };

  const addFromRateAgreement = (agreementId: string) => {
    const agreement = rateAgreements.find(a => a.id === agreementId);
    if (!agreement) return;

    const newItem: ItemForm = {
      lineNumber: items.length + 1,
      itemType: "service",
      description: `Consulenza: ${agreement.name}`,
      quantity: "1",
      unitOfMeasure: "giorni",
      unitPrice: (parseFloat(agreement.hourlyRate) * 8).toFixed(2), // Tariffa giornaliera = oraria × 8
      discountPercent: "0",
      lineTotal: (parseFloat(agreement.hourlyRate) * 8).toFixed(2),
      notes: "",
      rateAgreementId: agreementId,
      projectId: null,
      isNew: true,
      isModified: false,
    };
    updateItemsState([...items, newItem]);
    toast({ title: "Accordo aggiunto", description: `Tariffa giornaliera: €${newItem.unitPrice}` });
  };

  const addFromProject = (projectId: string) => {
    const project = projects.find(p => p.id === projectId);
    if (!project) return;

    const estimatedDays = project.estimatedEffort ? Math.ceil(project.estimatedEffort / 8) : 0;
    
    let unitPrice = "0";
    let quantity = estimatedDays.toString();
    let description = `Progetto: ${project.name}`;
    let lineTotal = "0.00";

    if (project.budget && parseFloat(project.budget) > 0) {
      lineTotal = parseFloat(project.budget).toFixed(2);
      if (estimatedDays > 0) {
        unitPrice = (parseFloat(project.budget) / estimatedDays).toFixed(2);
      } else {
        quantity = "1";
        unitPrice = lineTotal;
      }
      description += ` (Budget: €${project.budget})`;
    } else if (estimatedDays > 0) {
      description += ` (Stima: ${estimatedDays} gg)`;
    }

    const newItem: ItemForm = {
      lineNumber: items.length + 1,
      itemType: "package",
      description,
      quantity,
      unitOfMeasure: "giorni",
      unitPrice,
      discountPercent: "0",
      lineTotal,
      notes: project.description || "",
      rateAgreementId: null,
      projectId: projectId,
      isNew: true,
      isModified: false,
    };
    updateItemsState([...items, newItem]);
    toast({ title: "Progetto aggiunto", description: `${estimatedDays} giornate stimate` });
  };

  const addProjectWithAgreement = (projectId: string, agreementId: string) => {
    const project = projects.find(p => p.id === projectId);
    const agreement = rateAgreements.find(a => a.id === agreementId);
    if (!project || !agreement) return;

    const estimatedDays = project.estimatedEffort ? Math.ceil(project.estimatedEffort / 8) : 1;
    const dailyRate = parseFloat(agreement.hourlyRate) * 8;
    const lineTotal = (estimatedDays * dailyRate).toFixed(2);

    const newItem: ItemForm = {
      lineNumber: items.length + 1,
      itemType: "service",
      description: `${project.name} - ${agreement.name}`,
      quantity: estimatedDays.toString(),
      unitOfMeasure: "giorni",
      unitPrice: dailyRate.toFixed(2),
      discountPercent: "0",
      lineTotal,
      notes: `Progetto: ${project.name}\nAccordo: ${agreement.name}\nTariffa oraria: €${agreement.hourlyRate}/h`,
      rateAgreementId: agreementId,
      projectId: projectId,
      isNew: true,
      isModified: false,
    };
    updateItemsState([...items, newItem]);
    toast({ 
      title: "Riga calcolata", 
      description: `${estimatedDays} gg × €${dailyRate.toFixed(2)} = €${lineTotal}` 
    });
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
    
    updateItemsState(updatedItems);
  };

  const removeItem = async (index: number) => {
    const item = items[index];
    if (item.id && !item.isNew && quoteId) {
      try {
        await deleteMutation.mutateAsync(item.id);
        toast({ title: "Riga eliminata", description: "La riga è stata eliminata con successo" });
      } catch (error) {
        toast({ title: "Errore", description: "Errore durante l'eliminazione", variant: "destructive" });
        return;
      }
    }
    const updatedItems = items.filter((_, i) => i !== index).map((item, i) => ({ ...item, lineNumber: i + 1 }));
    updateItemsState(updatedItems);
  };

  const saveItem = async (index: number) => {
    if (!quoteId) {
      toast({ title: "Info", description: "Salva prima l'offerta per salvare le righe nel database", variant: "default" });
      return;
    }

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
      rateAgreementId: item.rateAgreementId || null,
      projectId: item.projectId || null,
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

  if (isLoading && quoteId) {
    return <div className="p-4 text-center text-gray-500">Caricamento righe...</div>;
  }

  const subtotal = items.reduce((sum, item) => sum + parseFloat(item.lineTotal || "0"), 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap justify-between items-center gap-2">
        <h3 className="text-lg font-medium">Righe Offerta</h3>
        <div className="flex flex-wrap gap-2">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Select onValueChange={addFromRateAgreement}>
                  <SelectTrigger className="w-[180px]" data-testid="select-add-agreement">
                    <FileText className="w-4 h-4 mr-2" />
                    <span className="text-sm">Accordo Tariffario</span>
                  </SelectTrigger>
                  <SelectContent>
                    {rateAgreements.length === 0 ? (
                      <div className="p-2 text-sm text-gray-500">Nessun accordo disponibile</div>
                    ) : (
                      rateAgreements.map((agreement) => (
                        <SelectItem key={agreement.id} value={agreement.id}>
                          {agreement.name} - €{agreement.hourlyRate}/h
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </TooltipTrigger>
              <TooltipContent>Aggiungi riga da Accordo Tariffario</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Select onValueChange={addFromProject}>
                  <SelectTrigger className="w-[180px]" data-testid="select-add-project">
                    <Briefcase className="w-4 h-4 mr-2" />
                    <span className="text-sm">Progetto</span>
                  </SelectTrigger>
                  <SelectContent>
                    {projects.length === 0 ? (
                      <div className="p-2 text-sm text-gray-500">Nessun progetto disponibile</div>
                    ) : (
                      projects.map((project) => (
                        <SelectItem key={project.id} value={project.id}>
                          {project.name} {project.estimatedEffort ? `(${Math.ceil(project.estimatedEffort/8)} gg)` : ""} {project.budget ? `€${project.budget}` : ""}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </TooltipTrigger>
              <TooltipContent>Aggiungi riga da Progetto (usa budget o stima giorni)</TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <Button type="button" onClick={addNewItem} size="sm" data-testid="button-add-item">
            <Plus className="w-4 h-4 mr-1" />
            Riga Manuale
          </Button>
        </div>
      </div>

      {!quoteId && items.length > 0 && (
        <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-sm text-yellow-800">
          <strong>Nota:</strong> Le righe verranno salvate dopo aver creato l'offerta
        </div>
      )}

      {items.length === 0 ? (
        <div className="p-8 text-center text-gray-500 border-2 border-dashed rounded-lg">
          <p className="mb-2">Nessuna riga. Aggiungi righe usando:</p>
          <p className="text-sm">• <strong>Accordo Tariffario</strong>: usa la tariffa concordata</p>
          <p className="text-sm">• <strong>Progetto</strong>: usa stima giornate o budget</p>
          <p className="text-sm">• <strong>Riga Manuale</strong>: inserimento libero</p>
        </div>
      ) : (
        <div className="border rounded-lg overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">#</TableHead>
                <TableHead className="w-20">Tipo</TableHead>
                <TableHead className="min-w-[200px]">Descrizione</TableHead>
                <TableHead className="w-16">Qtà</TableHead>
                <TableHead className="w-16">U.M.</TableHead>
                <TableHead className="w-24">Prezzo</TableHead>
                <TableHead className="w-16">Sc.%</TableHead>
                <TableHead className="w-24">Totale</TableHead>
                <TableHead className="w-20">Origine</TableHead>
                <TableHead className="w-24">Azioni</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item, index) => (
                <TableRow key={index} className={item.isNew || item.isModified ? "bg-yellow-50 dark:bg-yellow-900/20" : ""}>
                  <TableCell className="font-medium">{item.lineNumber}</TableCell>
                  <TableCell>
                    <Select 
                      value={item.itemType} 
                      onValueChange={(val) => updateItem(index, "itemType", val as any)}
                    >
                      <SelectTrigger className="h-8 w-20" data-testid={`select-item-type-${index}`}>
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
                      <SelectTrigger className="h-8 w-16" data-testid={`select-unit-${index}`}>
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
                      className="h-8 w-24"
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
                  <TableCell className="font-medium text-right">
                    €{item.lineTotal}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      {item.rateAgreementId && (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger>
                              <FileText className="w-4 h-4 text-blue-500" />
                            </TooltipTrigger>
                            <TooltipContent>Da Accordo Tariffario</TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      )}
                      {item.projectId && (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger>
                              <Briefcase className="w-4 h-4 text-green-500" />
                            </TooltipTrigger>
                            <TooltipContent>Da Progetto</TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      )}
                      {!item.rateAgreementId && !item.projectId && (
                        <span className="text-xs text-gray-400">Manuale</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      {quoteId && (item.isNew || item.isModified) && (
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

      <div className="flex justify-between items-center p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
        <div className="text-sm text-gray-600 dark:text-gray-400">
          {items.length} {items.length === 1 ? "riga" : "righe"}
        </div>
        <div className="text-lg font-bold">
          Subtotale: €{subtotal.toFixed(2)}
        </div>
      </div>
    </div>
  );
}
