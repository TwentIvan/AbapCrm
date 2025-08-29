import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Settings, Eye, EyeOff, GripVertical, BarChart3, Filter } from "lucide-react";
import { DndContext, closestCenter, DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { userPreferences } from "@/lib/user-preferences";

interface ColumnConfig {
  id: string;
  label: string;
  visible: boolean;
  width?: number;
}

interface TableConfigurationProps {
  tableId: string;
  availableColumns: { id: string; label: string }[];
  currentFilters?: any[];
  currentAggregations?: any[];
  onConfigurationChange?: (config: any) => void;
}

interface SortableColumnItemProps {
  column: ColumnConfig;
  onVisibilityChange: (id: string, visible: boolean) => void;
}

function SortableColumnItem({ column, onVisibilityChange }: SortableColumnItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ id: column.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center space-x-3 p-3 bg-muted/50 rounded-lg"
      data-testid={`column-config-${column.id}`}
    >
      <div
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing"
      >
        <GripVertical className="h-4 w-4 text-muted-foreground" />
      </div>
      
      <div className="flex items-center space-x-2 flex-1">
        <Switch
          checked={column.visible}
          onCheckedChange={(checked) => onVisibilityChange(column.id, checked)}
          data-testid={`switch-column-${column.id}`}
        />
        <Label className="flex-1">{column.label}</Label>
        {column.visible ? (
          <Eye className="h-4 w-4 text-green-600" />
        ) : (
          <EyeOff className="h-4 w-4 text-muted-foreground" />
        )}
      </div>
    </div>
  );
}

export function TableConfiguration({ 
  tableId, 
  availableColumns, 
  currentFilters = [], 
  currentAggregations = [],
  onConfigurationChange 
}: TableConfigurationProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [columns, setColumns] = useState<ColumnConfig[]>(() => {
    const layout = userPreferences.getTableLayout(tableId);
    return availableColumns.map(col => ({
      id: col.id,
      label: col.label,
      visible: layout.columnVisibility?.[col.id] ?? true,
    }));
  });

  const [aggregationPosition, setAggregationPosition] = useState<'top' | 'bottom'>(() => {
    const layout = userPreferences.getTableLayout(tableId);
    return layout.aggregations.position || 'bottom';
  });

  const [enableAdvancedFilters, setEnableAdvancedFilters] = useState(() => {
    const layout = userPreferences.getTableLayout(tableId);
    return layout.filters.length > 0 || true;
  });

  const [enableColumnReordering, setEnableColumnReordering] = useState(() => {
    const layout = userPreferences.getTableLayout(tableId);
    return layout.columnOrder.length > 0 || true;
  });

  const [enableAggregation, setEnableAggregation] = useState(() => {
    const layout = userPreferences.getTableLayout(tableId);
    return layout.aggregations.enabled ?? true;
  });

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      setColumns((items) => {
        const oldIndex = items.findIndex((item) => item.id === active.id);
        const newIndex = items.findIndex((item) => item.id === over.id);
        return arrayMove(items, oldIndex, newIndex);
      });
    }
  };

  const handleVisibilityChange = (columnId: string, visible: boolean) => {
    setColumns(prev => 
      prev.map(col => 
        col.id === columnId ? { ...col, visible } : col
      )
    );
  };

  const handleSaveConfiguration = () => {
    const layout = userPreferences.getTableLayout(tableId);
    const updatedLayout = {
      ...layout,
      columnOrder: columns.map(col => col.id),
      columnVisibility: Object.fromEntries(
        columns.map(col => [col.id, col.visible])
      ),
      aggregations: {
        ...layout.aggregations,
        position: aggregationPosition,
        enabled: enableAggregation,
      },
    };

    userPreferences.autoSaveTableLayout(tableId, updatedLayout);
    onConfigurationChange?.(updatedLayout);
    setIsOpen(false);
  };

  const handleResetConfiguration = () => {
    setColumns(availableColumns.map(col => ({
      id: col.id,
      label: col.label,
      visible: true,
    })));
    setAggregationPosition('bottom');
    setEnableAdvancedFilters(true);
    setEnableColumnReordering(true);
    setEnableAggregation(true);
  };

  const visibleColumnsCount = columns.filter(col => col.visible).length;
  const activeFiltersCount = currentFilters.length;
  const activeAggregationsCount = currentAggregations.length;

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button 
          variant="outline" 
          size="sm" 
          className="ml-2"
          data-testid="button-table-configuration"
        >
          <Settings className="mr-2 h-4 w-4" />
          Configurazione
          {(activeFiltersCount > 0 || activeAggregationsCount > 0) && (
            <Badge variant="secondary" className="ml-2">
              {activeFiltersCount + activeAggregationsCount}
            </Badge>
          )}
        </Button>
      </DialogTrigger>
      
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Configurazione Tabella Avanzata</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-6">
          {/* General Settings */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Impostazioni Generali</CardTitle>
              <CardDescription>
                Configura le funzionalità principali della tabella
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Filtri Avanzati</Label>
                  <p className="text-sm text-muted-foreground">
                    Abilita filtri multipli per colonne
                  </p>
                </div>
                <Switch
                  checked={enableAdvancedFilters}
                  onCheckedChange={setEnableAdvancedFilters}
                  data-testid="switch-advanced-filters"
                />
              </div>
              
              <Separator />
              
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Riordinamento Colonne</Label>
                  <p className="text-sm text-muted-foreground">
                    Permetti drag & drop delle colonne
                  </p>
                </div>
                <Switch
                  checked={enableColumnReordering}
                  onCheckedChange={setEnableColumnReordering}
                  data-testid="switch-column-reordering"
                />
              </div>
              
              <Separator />
              
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Calcoli Aggregati</Label>
                  <p className="text-sm text-muted-foreground">
                    Mostra somme, conteggi e medie
                  </p>
                </div>
                <Switch
                  checked={enableAggregation}
                  onCheckedChange={setEnableAggregation}
                  data-testid="switch-aggregation"
                />
              </div>
            </CardContent>
          </Card>

          {/* Aggregation Settings */}
          {enableAggregation && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center">
                  <BarChart3 className="mr-2 h-4 w-4" />
                  Impostazioni Aggregazioni
                </CardTitle>
                <CardDescription>
                  Configura la posizione e visualizzazione degli aggregati
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <Label>Posizione Totali</Label>
                    <Select value={aggregationPosition} onValueChange={(value: 'top' | 'bottom') => setAggregationPosition(value)}>
                      <SelectTrigger className="w-32" data-testid="select-aggregation-position">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="top">In Alto</SelectItem>
                        <SelectItem value="bottom">In Basso</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  
                  {activeAggregationsCount > 0 && (
                    <div className="space-y-2">
                      <Label className="text-sm font-medium">Aggregazioni Attive</Label>
                      <div className="flex flex-wrap gap-2">
                        {currentAggregations.map((agg, index) => (
                          <Badge key={index} variant="outline">
                            {agg.label}: {agg.type}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Column Configuration */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Configurazione Colonne</CardTitle>
              <CardDescription>
                Riordina e configura la visibilità delle colonne ({visibleColumnsCount}/{columns.length} visibili)
              </CardDescription>
            </CardHeader>
            <CardContent>
              <DndContext 
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <SortableContext 
                  items={columns.map(col => col.id)}
                  strategy={verticalListSortingStrategy}
                >
                  <div className="space-y-2">
                    {columns.map((column) => (
                      <SortableColumnItem
                        key={column.id}
                        column={column}
                        onVisibilityChange={handleVisibilityChange}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            </CardContent>
          </Card>

          {/* Active Filters */}
          {enableAdvancedFilters && activeFiltersCount > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center">
                  <Filter className="mr-2 h-4 w-4" />
                  Filtri Attivi ({activeFiltersCount})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {currentFilters.map((filter, index) => (
                    <Badge key={index} variant="outline">
                      {filter.column}: {filter.value}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex justify-between pt-4 border-t">
          <Button 
            variant="outline" 
            onClick={handleResetConfiguration}
            data-testid="button-reset-configuration"
          >
            Reset Default
          </Button>
          <div className="space-x-2">
            <Button 
              variant="outline" 
              onClick={() => setIsOpen(false)}
              data-testid="button-cancel-configuration"
            >
              Annulla
            </Button>
            <Button 
              onClick={handleSaveConfiguration}
              data-testid="button-save-configuration"
            >
              Salva Configurazione
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}