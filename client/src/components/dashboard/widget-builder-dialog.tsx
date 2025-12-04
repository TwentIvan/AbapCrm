import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { getAllEntities, getEntityDescriptor } from "@/lib/entity-registry";
import { 
  BarChart3, 
  PieChart as PieChartIcon, 
  LineChart as LineChartIcon, 
  AreaChart as AreaChartIcon,
  List,
  Hash,
  Save,
} from "lucide-react";
import type { DashboardWidgetTemplate } from "@shared/schema";

const WIDGET_TYPES = [
  { value: "entity_list", label: "Lista Entità", icon: List },
  { value: "pie_chart", label: "Grafico a Torta", icon: PieChartIcon },
  { value: "bar_chart", label: "Grafico a Barre", icon: BarChart3 },
  { value: "line_chart", label: "Grafico a Linee", icon: LineChartIcon },
  { value: "area_chart", label: "Grafico ad Area", icon: AreaChartIcon },
  { value: "counter", label: "Contatore", icon: Hash },
];

const AGGREGATIONS = [
  { value: "count", label: "Conteggio" },
  { value: "sum", label: "Somma" },
  { value: "avg", label: "Media" },
  { value: "min", label: "Minimo" },
  { value: "max", label: "Massimo" },
];

const GROUPABLE_FIELDS = [
  { value: "status", label: "Stato" },
  { value: "priority", label: "Priorità" },
  { value: "type", label: "Tipo" },
  { value: "taskType", label: "Tipo Task" },
  { value: "stage", label: "Fase" },
];

const NUMERIC_FIELDS = [
  { value: "amount", label: "Importo" },
  { value: "value", label: "Valore" },
  { value: "estimatedEffort", label: "Effort Stimato" },
  { value: "remainingEffort", label: "Effort Residuo" },
  { value: "completionPercentage", label: "Percentuale Completamento" },
];

const SUPPORTED_CHART_ENTITIES = ["tasks", "projects", "partners", "deals"];

interface WidgetBuilderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  template?: DashboardWidgetTemplate | null;
  onWidgetCreated?: (widget: Partial<DashboardWidgetTemplate>) => void;
  onTemplateSaved?: (template: DashboardWidgetTemplate) => void;
}

export function WidgetBuilderDialog({ 
  open, 
  onOpenChange, 
  template,
  onWidgetCreated,
  onTemplateSaved,
}: WidgetBuilderDialogProps) {
  const { toast } = useToast();
  
  const [name, setName] = useState(template?.name || "");
  const [description, setDescription] = useState(template?.description || "");
  const [widgetType, setWidgetType] = useState<string>(template?.widgetType || "entity_list");
  const [entityKey, setEntityKey] = useState(template?.entityKey || "");
  const [groupByField, setGroupByField] = useState(template?.config?.groupByField || "");
  const [valueField, setValueField] = useState(template?.config?.valueField || "");
  const [aggregation, setAggregation] = useState<string>(template?.config?.aggregation || "count");
  const [filterField, setFilterField] = useState(template?.config?.filterField || "");
  const [filterValues, setFilterValues] = useState<string[]>(template?.config?.filterValues || []);
  const [showLegend, setShowLegend] = useState(template?.config?.showLegend ?? true);
  const [showLabels, setShowLabels] = useState(template?.config?.showLabels ?? true);
  const [isPublic, setIsPublic] = useState(template?.isPublic || false);
  const [defaultWidth, setDefaultWidth] = useState(template?.defaultWidth || 400);
  const [defaultHeight, setDefaultHeight] = useState(template?.defaultHeight || 300);
  
  const entities = getAllEntities();

  const saveMutation = useMutation({
    mutationFn: async (data: any) => {
      if (template?.id) {
        const response = await apiRequest("PUT", `/api/widget-templates/${template.id}`, data);
        return response.json();
      } else {
        const response = await apiRequest("POST", "/api/widget-templates", data);
        return response.json();
      }
    },
    onSuccess: (savedTemplate: DashboardWidgetTemplate) => {
      toast({
        title: template?.id ? "Template aggiornato" : "Template salvato",
        description: `Widget "${name}" salvato con successo`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/widget-templates"] });
      onTemplateSaved?.(savedTemplate);
      onOpenChange(false);
    },
    onError: (error: any) => {
      toast({
        title: "Errore",
        description: error.message || "Impossibile salvare il template",
        variant: "destructive",
      });
    },
  });

  const handleSaveTemplate = () => {
    if (!name.trim()) {
      toast({
        title: "Nome richiesto",
        description: "Inserisci un nome per il template",
        variant: "destructive",
      });
      return;
    }

    saveMutation.mutate({
      name,
      description,
      widgetType,
      entityKey,
      isPublic,
      defaultWidth,
      defaultHeight,
      config: {
        groupByField: groupByField || undefined,
        valueField: valueField || undefined,
        aggregation: aggregation || undefined,
        filterField: filterField || undefined,
        filterValues: filterValues.length > 0 ? filterValues : undefined,
        showLegend,
        showLabels,
      },
    });
  };

  const handleAddWidget = () => {
    onWidgetCreated?.({
      name: name || "Nuovo Widget",
      widgetType: widgetType as any,
      entityKey,
      defaultWidth,
      defaultHeight,
      config: {
        groupByField: groupByField || undefined,
        valueField: valueField || undefined,
        aggregation: aggregation as any || undefined,
        filterField: filterField || undefined,
        filterValues: filterValues.length > 0 ? filterValues : undefined,
        showLegend,
        showLabels,
      },
    });
    onOpenChange(false);
  };

  const isChartType = ["pie_chart", "bar_chart", "line_chart", "area_chart"].includes(widgetType);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle data-testid="dialog-title-widget-builder">
            {template?.id ? "Modifica Widget" : "Crea Nuovo Widget"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="widget-name">Nome Widget</Label>
              <Input
                id="widget-name"
                data-testid="input-widget-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Es: Task per Stato"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="widget-description">Descrizione (opzionale)</Label>
              <Input
                id="widget-description"
                data-testid="input-widget-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Descrizione del widget"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Tipo Widget</Label>
            <div className="grid grid-cols-3 gap-2">
              {WIDGET_TYPES.map((type) => (
                <Button
                  key={type.value}
                  type="button"
                  variant={widgetType === type.value ? "default" : "outline"}
                  className="h-20 flex flex-col gap-2"
                  data-testid={`button-widget-type-${type.value}`}
                  onClick={() => setWidgetType(type.value)}
                >
                  <type.icon className="h-6 w-6" />
                  <span className="text-xs">{type.label}</span>
                </Button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="entity-select">Entità</Label>
            <Select value={entityKey} onValueChange={setEntityKey}>
              <SelectTrigger id="entity-select" data-testid="select-entity">
                <SelectValue placeholder="Seleziona entità" />
              </SelectTrigger>
              <SelectContent>
                {(isChartType || widgetType === "counter" 
                  ? entities.filter(e => SUPPORTED_CHART_ENTITIES.includes(e.entityKey))
                  : entities
                ).map((entity) => (
                  <SelectItem key={entity.entityKey} value={entity.entityKey}>
                    {entity.titlePlural}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {(isChartType || widgetType === "counter") && (
              <p className="text-xs text-muted-foreground">
                I widget grafici supportano: Task, Progetti, Partner e Accordi
              </p>
            )}
          </div>

          {isChartType && entityKey && (
            <div className="space-y-4 p-4 border rounded-lg bg-muted/50">
              <h4 className="font-medium">Configurazione Grafico</h4>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="group-by">Raggruppa per</Label>
                  <Select value={groupByField} onValueChange={setGroupByField}>
                    <SelectTrigger id="group-by" data-testid="select-group-by">
                      <SelectValue placeholder="Seleziona campo" />
                    </SelectTrigger>
                    <SelectContent>
                      {GROUPABLE_FIELDS.map((field) => (
                        <SelectItem key={field.value} value={field.value}>
                          {field.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="aggregation">Aggregazione</Label>
                  <Select value={aggregation} onValueChange={setAggregation}>
                    <SelectTrigger id="aggregation" data-testid="select-aggregation">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {AGGREGATIONS.map((agg) => (
                        <SelectItem key={agg.value} value={agg.value}>
                          {agg.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {aggregation !== "count" && (
                <div className="space-y-2">
                  <Label htmlFor="value-field">Campo Valore</Label>
                  <Select value={valueField} onValueChange={setValueField}>
                    <SelectTrigger id="value-field" data-testid="select-value-field">
                      <SelectValue placeholder="Seleziona campo numerico" />
                    </SelectTrigger>
                    <SelectContent>
                      {NUMERIC_FIELDS.map((field) => (
                        <SelectItem key={field.value} value={field.value}>
                          {field.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="flex items-center gap-6">
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="show-legend"
                    data-testid="checkbox-show-legend"
                    checked={showLegend}
                    onCheckedChange={(checked) => setShowLegend(checked === true)}
                  />
                  <Label htmlFor="show-legend" className="cursor-pointer">
                    Mostra legenda
                  </Label>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="show-labels"
                    data-testid="checkbox-show-labels"
                    checked={showLabels}
                    onCheckedChange={(checked) => setShowLabels(checked === true)}
                  />
                  <Label htmlFor="show-labels" className="cursor-pointer">
                    Mostra etichette
                  </Label>
                </div>
              </div>
            </div>
          )}

          <div className="space-y-4 p-4 border rounded-lg bg-muted/50">
            <h4 className="font-medium">Filtri (opzionale)</h4>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="filter-field">Campo Filtro</Label>
                <Select value={filterField} onValueChange={setFilterField}>
                  <SelectTrigger id="filter-field" data-testid="select-filter-field">
                    <SelectValue placeholder="Nessun filtro" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Nessun filtro</SelectItem>
                    {GROUPABLE_FIELDS.map((field) => (
                      <SelectItem key={field.value} value={field.value}>
                        {field.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {filterField && (
                <div className="space-y-2">
                  <Label htmlFor="filter-values">Valori Filtro</Label>
                  <Input
                    id="filter-values"
                    data-testid="input-filter-values"
                    value={filterValues.join(", ")}
                    onChange={(e) => setFilterValues(e.target.value.split(",").map(v => v.trim()).filter(Boolean))}
                    placeholder="Es: todo, in_progress"
                  />
                  <p className="text-xs text-muted-foreground">Separa i valori con virgole</p>
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="default-width">Larghezza (px)</Label>
              <Input
                id="default-width"
                data-testid="input-default-width"
                type="number"
                value={defaultWidth}
                onChange={(e) => setDefaultWidth(parseInt(e.target.value) || 400)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="default-height">Altezza (px)</Label>
              <Input
                id="default-height"
                data-testid="input-default-height"
                type="number"
                value={defaultHeight}
                onChange={(e) => setDefaultHeight(parseInt(e.target.value) || 300)}
              />
            </div>
            <div className="flex items-end">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="is-public"
                  data-testid="checkbox-is-public"
                  checked={isPublic}
                  onCheckedChange={(checked) => setIsPublic(checked === true)}
                />
                <Label htmlFor="is-public" className="cursor-pointer">
                  Template pubblico
                </Label>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button 
            variant="outline" 
            onClick={() => onOpenChange(false)}
            data-testid="button-cancel"
          >
            Annulla
          </Button>
          {onWidgetCreated && (
            <Button 
              variant="secondary" 
              onClick={handleAddWidget}
              disabled={!entityKey}
              data-testid="button-add-widget"
            >
              Aggiungi alla Dashboard
            </Button>
          )}
          <Button 
            onClick={handleSaveTemplate}
            disabled={!name.trim() || !entityKey || saveMutation.isPending}
            data-testid="button-save-template"
          >
            <Save className="h-4 w-4 mr-2" />
            Salva Template
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
