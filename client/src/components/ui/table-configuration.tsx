import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Settings, Eye, EyeOff, GripVertical, BarChart3, Filter, ArrowUp, ArrowDown, Calculator, Save } from "lucide-react";
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
  sortDirection?: 'asc' | 'desc' | null;
  enableSubtotal?: boolean;
}

interface TableConfigurationProps {
  tableId: string;
  availableColumns: { id: string; label: string }[];
  currentFilters?: any[];
  currentAggregations?: any[];
  onConfigurationChange?: (config: any) => void;
  onSaveLayout?: (layoutName: string, isDefault?: boolean) => string;
  editingLayout?: any; // Layout being edited
  isOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  onSave?: (layout: any) => void;
  onCancel?: () => void;
}

interface SortableColumnItemProps {
  column: ColumnConfig;
  onVisibilityChange: (id: string, visible: boolean) => void;
  onSortChange: (id: string, direction: 'asc' | 'desc' | null) => void;
  onSubtotalChange: (id: string, enabled: boolean) => void;
}

function SortableColumnItem({ column, onVisibilityChange, onSortChange, onSubtotalChange }: SortableColumnItemProps) {
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
      className="flex flex-col space-y-2 p-3 bg-muted/50 rounded-lg"
      data-testid={`column-config-${column.id}`}
    >
      <div className="flex items-center space-x-3">
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
          <Label className="flex-1 font-medium">{column.label}</Label>
          {column.visible ? (
            <Eye className="h-4 w-4 text-green-600" />
          ) : (
            <EyeOff className="h-4 w-4 text-muted-foreground" />
          )}
        </div>
      </div>
      
      {/* Sort and Subtotal Controls */}
      {column.visible && (
        <div className="flex items-center justify-between space-x-2 ml-7">
          <div className="flex items-center space-x-1">
            <Button
              variant={column.sortDirection === 'asc' ? 'default' : 'outline'}
              size="sm"
              onClick={() => onSortChange(column.id, column.sortDirection === 'asc' ? null : 'asc')}
              data-testid={`button-sort-asc-${column.id}`}
              className="h-7 px-2"
            >
              <ArrowUp className="h-3 w-3" />
            </Button>
            <Button
              variant={column.sortDirection === 'desc' ? 'default' : 'outline'}
              size="sm"
              onClick={() => onSortChange(column.id, column.sortDirection === 'desc' ? null : 'desc')}
              data-testid={`button-sort-desc-${column.id}`}
              className="h-7 px-2"
            >
              <ArrowDown className="h-3 w-3" />
            </Button>
          </div>
          
          <div className="flex items-center space-x-2">
            <Switch
              checked={column.enableSubtotal || false}
              onCheckedChange={(checked) => onSubtotalChange(column.id, checked)}
              data-testid={`switch-subtotal-${column.id}`}
            />
            <Label className="text-sm text-muted-foreground flex items-center space-x-1">
              <Calculator className="h-3 w-3" />
              <span>Subtotali</span>
            </Label>
          </div>
        </div>
      )}
    </div>
  );
}

export function TableConfiguration({ 
  tableId, 
  availableColumns, 
  currentFilters = [], 
  currentAggregations = [],
  onConfigurationChange,
  onSaveLayout,
  editingLayout,
  isOpen: externalIsOpen,
  onOpenChange,
  onSave,
  onCancel
}: TableConfigurationProps) {
  const [internalIsOpen, setInternalIsOpen] = useState(false);
  const isOpen = externalIsOpen !== undefined ? externalIsOpen : internalIsOpen;
  const setIsOpen = onOpenChange || setInternalIsOpen;
  const [columns, setColumns] = useState<ColumnConfig[]>(() => {
    const layout = userPreferences.getTableLayout(tableId);
    return availableColumns.map(col => ({
      id: col.id,
      label: col.label,
      visible: layout.columns?.[col.id]?.visible ?? true,
      sortDirection: layout.sorting?.find(s => s.id === col.id)?.desc === false ? 'asc' : layout.sorting?.find(s => s.id === col.id)?.desc === true ? 'desc' : null,
      enableSubtotal: layout.aggregations?.subtotals?.groupBy?.includes(col.id) || false,
    }));
  });

  const [aggregationPosition, setAggregationPosition] = useState<'top' | 'bottom'>(() => {
    const layout = userPreferences.getTableLayout(tableId);
    return layout.aggregations?.position || 'bottom';
  });

  const [enableAdvancedFilters, setEnableAdvancedFilters] = useState<boolean>(() => {
    const layout = userPreferences.getTableLayout(tableId);
    return (layout.filters && layout.filters.length > 0) || true;
  });

  const [enableColumnReordering, setEnableColumnReordering] = useState<boolean>(() => {
    const layout = userPreferences.getTableLayout(tableId);
    return (layout.columns && Object.keys(layout.columns).length > 0) || true;
  });

  const [enableAggregation, setEnableAggregation] = useState<boolean>(() => {
    const layout = userPreferences.getTableLayout(tableId);
    return layout.aggregations?.enabled ?? true;
  });

  const [layoutName, setLayoutName] = useState(editingLayout?.name || '');
  const [saveAsDefault, setSaveAsDefault] = useState(false);
  
  const isEditingExisting = !!editingLayout;
  
  // Update layout name when editingLayout changes
  useEffect(() => {
    if (editingLayout?.name) {
      setLayoutName(editingLayout.name);
    }
  }, [editingLayout]);

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

  const handleSortChange = (columnId: string, direction: 'asc' | 'desc' | null) => {
    setColumns(prev => 
      prev.map(col => 
        col.id === columnId ? { ...col, sortDirection: direction } : { ...col, sortDirection: null }
      )
    );
  };

  const handleSubtotalChange = (columnId: string, enabled: boolean) => {
    setColumns(prev => 
      prev.map(col => 
        col.id === columnId ? { ...col, enableSubtotal: enabled } : col
      )
    );
  };

  const handleSaveConfiguration = () => {
    console.log('🔥 SAVE BUTTON CLICKED! Layout name:', layoutName);
    
    if (!layoutName.trim()) {
      console.log('❌ Layout name is empty');
      return;
    }

    const layout = userPreferences.getTableLayout(tableId);
    console.log('📄 Current layout:', layout);
    
    // Build sorting from columns with sortDirection
    const sortedColumn = columns.find(col => col.sortDirection);
    const sorting = sortedColumn ? [{
      id: sortedColumn.id,
      desc: sortedColumn.sortDirection === 'desc',
      priority: 0
    }] : [];
    
    // Build subtotals groupBy from columns with enableSubtotal
    const subtotalColumns = columns.filter(col => col.enableSubtotal).map(col => col.id);
    
    const updatedLayout = {
      ...layout,
      columns: Object.fromEntries(
        columns.map(col => [col.id, { 
          visible: col.visible,
          position: columns.findIndex(c => c.id === col.id),
          width: col.width 
        }])
      ),
      sorting,
      aggregations: {
        ...layout.aggregations,
        position: aggregationPosition,
        enabled: enableAggregation,
        subtotals: {
          enabled: subtotalColumns.length > 0,
          groupBy: subtotalColumns,
        },
      },
    };

    // Save layout using new simplified interface
    console.log('💾 About to save layout...');
    
    if (onSave) {
      // Use new simplified onSave callback
      onSave(updatedLayout);
      console.log('✅ Layout saved via onSave callback');
    } else {
      // Fallback to old interface for compatibility
      const layoutId = onSaveLayout ? 
        onSaveLayout(layoutName, saveAsDefault) : 
        userPreferences.saveLayoutAs(tableId, layoutName, saveAsDefault);
      console.log('✅ Layout saved with ID:', layoutId);
      
      // Update current layout with new configuration
      userPreferences.saveTableLayout(tableId, updatedLayout);
      console.log('🔄 Layout updated');
      
      onConfigurationChange?.(updatedLayout);
      
      // Reset form
      setLayoutName('');
      setSaveAsDefault(false);
      setIsOpen(false);
      console.log('✨ Form reset, dialog closed');
    }
  };

  const handleResetConfiguration = () => {
    setColumns(availableColumns.map(col => ({
      id: col.id,
      label: col.label,
      visible: true,
      sortDirection: null,
      enableSubtotal: false,
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
      {/* Only show trigger if not controlled externally */}
      {externalIsOpen === undefined && (
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
      )}
      
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
                  onCheckedChange={(checked) => setEnableAdvancedFilters(checked)}
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
                  onCheckedChange={(checked) => setEnableColumnReordering(checked)}
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
                  onCheckedChange={(checked) => setEnableAggregation(checked)}
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
                        onSortChange={handleSortChange}
                        onSubtotalChange={handleSubtotalChange}
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

        {/* Layout Save Options */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center">
              <Save className="mr-2 h-4 w-4" />
              {isEditingExisting ? 'Modifica Layout' : 'Salva Layout'}
            </CardTitle>
            <CardDescription>
              {isEditingExisting 
                ? 'Aggiorna la configurazione del layout esistente' 
                : 'Salva la configurazione corrente come layout personalizzato'
              }
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="layout-name">Nome Layout</Label>
                <Input
                  id="layout-name"
                  placeholder={isEditingExisting ? "" : "es. Vista Clienti Principali"}
                  value={layoutName}
                  onChange={(e) => setLayoutName(e.target.value)}
                  readOnly={isEditingExisting}
                  className={isEditingExisting ? "bg-muted" : ""}
                  data-testid="input-layout-name"
                />
              </div>
              <div className="flex items-center space-x-2">
                <Switch
                  checked={saveAsDefault}
                  onCheckedChange={setSaveAsDefault}
                  data-testid="switch-save-as-default"
                />
                <Label htmlFor="save-as-default">Imposta come layout predefinito</Label>
              </div>
            </div>
          </CardContent>
        </Card>

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
              onClick={() => {
                if (onCancel) {
                  onCancel();
                } else {
                  setIsOpen(false);
                }
              }}
              data-testid="button-cancel-configuration"
            >
              Annulla
            </Button>
            <Button 
              onClick={handleSaveConfiguration}
              data-testid="button-save-configuration"
              disabled={!layoutName.trim()}
            >
              {isEditingExisting ? 'Aggiorna Layout' : 'Salva Layout'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}