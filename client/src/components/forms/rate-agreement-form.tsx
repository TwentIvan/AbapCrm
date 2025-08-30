import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { insertRateAgreementSchema, type RateAgreement, type Partner, type Project, type Task, type HumanResource } from "@shared/schema";
import { apiRequest, getQueryFn } from "@/lib/queryClient";
import { Loader2, Settings, DollarSign, X, Plus } from "lucide-react";

const formSchema = z.object({
  name: z.string().min(1, "Nome accordo richiesto"),
  description: z.string().optional(),
  groupingFields: z.array(z.string()).default([]),
  groupingValues: z.record(z.string()).default({}),
  validFrom: z.string().min(1, "Data inizio richiesta"),
  validTo: z.string().optional(),
  hourlyRate: z.string().min(1, "Tariffa oraria richiesta"),
  currency: z.string().default("EUR"),
  minimumHours: z.string().optional(),
  priority: z.string().min(1, "Priorità richiesta"),
  isActive: z.boolean().default(true),
  notes: z.string().optional(),
});

type FormData = z.infer<typeof formSchema>;

// Campi disponibili per il raggruppamento dinamico - simile ai timesheet
const AVAILABLE_GROUPING_FIELDS = [
  {
    id: "partnerId",
    label: "Cliente/Partner",
    description: "Specifica tariffa per un cliente specifico"
  },
  {
    id: "projectId", 
    label: "Progetto",
    description: "Tariffa per un progetto specifico"
  },
  {
    id: "humanResourceId",
    label: "Risorsa Umana",
    description: "Tariffa specifica per una risorsa umana"
  },
  {
    id: "taskType",
    label: "Tipo Lavoro",
    description: "Tariffa basata sul tipo di attività"
  }
];

const TASK_TYPES = [
  { value: "development", label: "Sviluppo" },
  { value: "analysis", label: "Analisi" },
  { value: "design", label: "Design" },
  { value: "testing", label: "Testing" },
  { value: "consulting", label: "Consulenza" },
  { value: "meeting", label: "Riunioni" },
  { value: "documentation", label: "Documentazione" },
  { value: "maintenance", label: "Manutenzione" },
  { value: "support", label: "Supporto" },
  { value: "other", label: "Altro" }
];

interface RateAgreementFormProps {
  rateAgreement?: RateAgreement;
  onSuccess?: () => void;
}

export default function RateAgreementForm({ rateAgreement, onSuccess }: RateAgreementFormProps) {
  const [selectedGroupingFields, setSelectedGroupingFields] = useState<string[]>([]);
  const [groupingValues, setGroupingValues] = useState<Record<string, string>>({});
  
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch data for dropdowns
  const { data: partners = [] } = useQuery<Partner[]>({ 
    queryKey: ["/api/partners"],
    queryFn: getQueryFn({ on401: "throw" }),
    staleTime: 5 * 60 * 1000,
  });
  
  const { data: projects = [] } = useQuery<Project[]>({ 
    queryKey: ["/api/projects"],
    queryFn: getQueryFn({ on401: "throw" }),
    staleTime: 5 * 60 * 1000,
  });

  const { data: humanResources = [] } = useQuery<HumanResource[]>({ 
    queryKey: ["/api/human-resources"],
    queryFn: getQueryFn({ on401: "throw" }),
    staleTime: 5 * 60 * 1000,
  });

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: rateAgreement?.name || "",
      description: rateAgreement?.description || "",
      groupingFields: rateAgreement?.groupingFields || [],
      groupingValues: rateAgreement ? JSON.parse(rateAgreement.groupingValues) : {},
      hourlyRate: rateAgreement?.hourlyRate || "",
      currency: rateAgreement?.currency || "EUR",
      priority: rateAgreement?.priority?.toString() || "1",
      validFrom: rateAgreement?.validFrom ? new Date(rateAgreement.validFrom).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
      validTo: rateAgreement?.validTo ? new Date(rateAgreement.validTo).toISOString().split('T')[0] : "",
      isActive: rateAgreement?.isActive ?? true,
      notes: rateAgreement?.notes || "",
      minimumHours: rateAgreement?.minimumHours || "",
    },
  });

  // Initialize from existing rate agreement
  useEffect(() => {
    if (rateAgreement) {
      setSelectedGroupingFields(rateAgreement.groupingFields);
      setGroupingValues(JSON.parse(rateAgreement.groupingValues));
    }
  }, [rateAgreement]);

  // Update form when grouping changes
  useEffect(() => {
    form.setValue("groupingFields", selectedGroupingFields);
    form.setValue("groupingValues", groupingValues);
  }, [selectedGroupingFields, groupingValues, form]);

  const saveMutation = useMutation({
    mutationFn: async (data: FormData) => {
      console.log("🔧 RAW FORM DATA:", data);
      const agreementData = {
        ...data,
        hourlyRate: data.hourlyRate, // Keep as string
        priority: parseInt(data.priority),
        minimumHours: data.minimumHours || null,
        validFrom: data.validFrom,
        validTo: data.validTo || null,
        groupingValues: JSON.stringify(groupingValues),
      };
      console.log("🔧 PROCESSED AGREEMENT DATA:", agreementData);
      
      if (rateAgreement) {
        console.log("📝 UPDATING existing agreement...");
        const res = await apiRequest("PUT", `/api/rate-agreements/${rateAgreement.id}`, agreementData);
        return res.json();
      } else {
        console.log("🆕 CREATING new agreement...");
        const res = await apiRequest("POST", "/api/rate-agreements", agreementData);
        return res.json();
      }
    },
    onSuccess: (result) => {
      console.log("✅ MUTATION SUCCESS! Result:", result);
      queryClient.invalidateQueries({ queryKey: ["/api/rate-agreements"] });
      toast({
        title: "Successo",
        description: rateAgreement ? "Accordo aggiornato" : "Accordo creato con successo",
      });
      onSuccess?.();
    },
    onError: (error) => {
      console.error("❌ MUTATION ERROR:", error);
      toast({
        title: "Errore",
        description: "Errore durante il salvataggio dell'accordo",
        variant: "destructive",
      });
    }
  });

  const onSubmit = (data: FormData) => {
    console.log("🚀 FORM SUBMIT TRIGGERED! Data:", data);
    console.log("🔧 Selected grouping fields:", selectedGroupingFields);
    console.log("🔧 Grouping values:", groupingValues);
    console.log("🔧 Form validation errors:", form.formState.errors);
    console.log("🔧 Form is valid:", form.formState.isValid);
    saveMutation.mutate(data);
  };

  const handleAddGroupingField = (fieldId: string) => {
    if (!selectedGroupingFields.includes(fieldId)) {
      setSelectedGroupingFields([...selectedGroupingFields, fieldId]);
    }
  };

  const handleRemoveGroupingField = (fieldId: string) => {
    setSelectedGroupingFields(selectedGroupingFields.filter(f => f !== fieldId));
    const newValues = { ...groupingValues };
    delete newValues[fieldId];
    setGroupingValues(newValues);
  };

  const handleGroupingValueChange = (fieldId: string, value: string) => {
    setGroupingValues({
      ...groupingValues,
      [fieldId]: value
    });
  };

  const getFieldOptions = (fieldId: string) => {
    switch (fieldId) {
      case "partnerId":
        return partners.map(p => ({ value: p.id, label: p.name }));
      case "projectId":
        return projects.map(p => ({ value: p.id, label: p.name }));
      case "humanResourceId":
        return humanResources.map(hr => ({ value: hr.id, label: `${hr.name} (${hr.role} - ${hr.skillLevel})` }));
      case "taskType":
        return TASK_TYPES;
      default:
        return [];
    }
  };

  const generatePreview = () => {
    if (selectedGroupingFields.length === 0) {
      return "Tariffa generale (nessun filtro specifico)";
    }
    
    const parts = selectedGroupingFields.map(fieldId => {
      const field = AVAILABLE_GROUPING_FIELDS.find(f => f.id === fieldId);
      const value = groupingValues[fieldId];
      
      if (!value) return `${field?.label}: (da selezionare)`;
      
      const options = getFieldOptions(fieldId);
      const selectedOption = options.find(opt => opt.value === value);
      
      return `${field?.label}: ${selectedOption?.label || value}`;
    });
    
    return parts.join(" • ");
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6" data-testid="form-rate-agreement">
        {/* Basic Info */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5" />
              Informazioni Generali
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nome Accordo</FormLabel>
                  <FormControl>
                    <Input 
                      placeholder="es. Cliente ABC - Progetto XYZ, SAP Consulting - Standard"
                      {...field}
                      data-testid="input-agreement-name"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Descrizione (Opzionale)</FormLabel>
                  <FormControl>
                    <Textarea 
                      placeholder="Descrizione dell'accordo tariffario..."
                      {...field}
                      value={field.value || ""}
                      data-testid="input-agreement-description"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        {/* Dynamic Grouping Configuration */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Plus className="h-5 w-5" />
              Configurazione Dinamica
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Seleziona i criteri per questo accordo. Più criteri = maggiore specificità = priorità più alta.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Available Fields */}
            <div>
              <Label className="text-sm font-medium">Campi Disponibili</Label>
              <div className="flex flex-wrap gap-2 mt-2">
                {AVAILABLE_GROUPING_FIELDS.filter(field => !selectedGroupingFields.includes(field.id)).map(field => (
                  <Button
                    key={field.id}
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => handleAddGroupingField(field.id)}
                    data-testid={`button-add-${field.id}`}
                  >
                    <Plus className="h-3 w-3 mr-1" />
                    {field.label}
                  </Button>
                ))}
              </div>
            </div>

            {/* Selected Fields Configuration */}
            {selectedGroupingFields.length > 0 && (
              <div>
                <Label className="text-sm font-medium">Criteri Selezionati</Label>
                <div className="space-y-3 mt-2">
                  {selectedGroupingFields.map(fieldId => {
                    const field = AVAILABLE_GROUPING_FIELDS.find(f => f.id === fieldId);
                    const options = getFieldOptions(fieldId);
                    
                    return (
                      <div key={fieldId} className="flex items-center gap-3 p-3 border rounded-md">
                        <div className="flex-1">
                          <div className="flex items-center justify-between mb-2">
                            <Label className="text-sm font-medium">{field?.label}</Label>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => handleRemoveGroupingField(fieldId)}
                              data-testid={`button-remove-${fieldId}`}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                          <p className="text-xs text-muted-foreground mb-2">{field?.description}</p>
                          <Select
                            value={groupingValues[fieldId] || ""}
                            onValueChange={(value) => handleGroupingValueChange(fieldId, value)}
                          >
                            <SelectTrigger data-testid={`select-${fieldId}`}>
                              <SelectValue placeholder={`Seleziona ${field?.label.toLowerCase()}`} />
                            </SelectTrigger>
                            <SelectContent>
                              {options
                                .filter(option => option.value && option.value.trim() !== '')
                                .map(option => (
                                <SelectItem key={option.value} value={option.value}>
                                  {option.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Preview */}
            <div className="p-3 bg-muted rounded-md">
              <Label className="text-sm font-medium">Anteprima Accordo</Label>
              <p className="text-sm mt-1">{generatePreview()}</p>
            </div>
          </CardContent>
        </Card>

        {/* Rate & Conditions */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <DollarSign className="h-5 w-5" />
              Tariffa e Condizioni
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <FormField
                control={form.control}
                name="hourlyRate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tariffa Oraria (€)</FormLabel>
                    <FormControl>
                      <Input 
                        type="number"
                        step="0.01"
                        placeholder="75.00"
                        {...field}
                        data-testid="input-hourly-rate"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="priority"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Priorità</FormLabel>
                    <FormControl>
                      <Input 
                        type="number"
                        placeholder="1"
                        {...field}
                        data-testid="input-priority"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="minimumHours"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Ore Minime (Opzionale)</FormLabel>
                    <FormControl>
                      <Input 
                        type="number"
                        step="0.5"
                        placeholder="4.0"
                        {...field}
                        data-testid="input-minimum-hours"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="validFrom"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Valido Da</FormLabel>
                    <FormControl>
                      <Input 
                        type="date"
                        {...field}
                        data-testid="input-valid-from"
                      />
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
                    <FormLabel>Valido Fino A (Opzionale)</FormLabel>
                    <FormControl>
                      <Input 
                        type="date"
                        {...field}
                        data-testid="input-valid-to"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="isActive"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
                  <div className="space-y-0.5">
                    <FormLabel>Attivo</FormLabel>
                    <p className="text-sm text-muted-foreground">
                      Accordo attivo e utilizzabile per la risoluzione delle tariffe
                    </p>
                  </div>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                      data-testid="switch-is-active"
                    />
                  </FormControl>
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Note (Opzionale)</FormLabel>
                  <FormControl>
                    <Textarea 
                      placeholder="Note aggiuntive sull'accordo..."
                      {...field}
                      value={field.value || ""}
                      data-testid="input-notes"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        <div className="flex items-center justify-end space-x-2">
          <Button
            type="submit"
            disabled={saveMutation.isPending}
            data-testid="button-submit"
            onClick={() => {
              console.log("🎯 SUBMIT BUTTON CLICKED!");
              console.log("🔍 Form state:", form.formState);
              console.log("🔍 Form errors:", form.formState.errors);
              console.log("🔍 Current form values:", form.getValues());
            }}
          >
            {saveMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {rateAgreement ? "Aggiorna Accordo" : "Crea Accordo"}
          </Button>
        </div>
      </form>
    </Form>
  );
}