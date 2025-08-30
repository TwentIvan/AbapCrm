import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Filter, X, Plus, Calendar as CalendarIcon } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

export interface FilterRule {
  id: string;
  field: string;
  operator: 'equals' | 'contains' | 'startsWith' | 'endsWith' | 'gt' | 'lt' | 'gte' | 'lte' | 'between' | 'isEmpty' | 'isNotEmpty';
  value: any;
  type: 'text' | 'number' | 'date' | 'boolean' | 'select';
}

export interface FilterColumn {
  id: string;
  label: string;
  type: 'text' | 'number' | 'date' | 'boolean' | 'select';
  options?: { value: string; label: string }[];
}

interface AdvancedFiltersProps {
  columns: FilterColumn[];
  filters: FilterRule[];
  onChange: (filters: FilterRule[]) => void;
  className?: string;
}

const OPERATORS = {
  text: [
    { value: 'contains', label: 'Contiene' },
    { value: 'equals', label: 'Uguale a' },
    { value: 'startsWith', label: 'Inizia con' },
    { value: 'endsWith', label: 'Finisce con' },
    { value: 'isEmpty', label: 'È vuoto' },
    { value: 'isNotEmpty', label: 'Non è vuoto' },
  ],
  number: [
    { value: 'equals', label: 'Uguale a' },
    { value: 'gt', label: 'Maggiore di' },
    { value: 'gte', label: 'Maggiore o uguale' },
    { value: 'lt', label: 'Minore di' },
    { value: 'lte', label: 'Minore o uguale' },
    { value: 'between', label: 'Tra' },
    { value: 'isEmpty', label: 'È vuoto' },
    { value: 'isNotEmpty', label: 'Non è vuoto' },
  ],
  date: [
    { value: 'equals', label: 'Uguale a' },
    { value: 'gt', label: 'Dopo' },
    { value: 'gte', label: 'Dopo o uguale' },
    { value: 'lt', label: 'Prima' },
    { value: 'lte', label: 'Prima o uguale' },
    { value: 'between', label: 'Tra' },
    { value: 'isEmpty', label: 'È vuoto' },
    { value: 'isNotEmpty', label: 'Non è vuoto' },
  ],
  boolean: [
    { value: 'equals', label: 'Uguale a' },
  ],
  select: [
    { value: 'equals', label: 'Uguale a' },
    { value: 'isEmpty', label: 'È vuoto' },
    { value: 'isNotEmpty', label: 'Non è vuoto' },
  ],
};

export function AdvancedFilters({ columns, filters, onChange, className }: AdvancedFiltersProps) {
  const [isOpen, setIsOpen] = useState(false);

  const addFilter = () => {
    const newFilter: FilterRule = {
      id: Math.random().toString(36).substr(2, 9),
      field: columns[0]?.id || '',
      operator: 'contains',
      value: '',
      type: columns[0]?.type || 'text',
    };
    onChange([...filters, newFilter]);
  };

  const updateFilter = (id: string, updates: Partial<FilterRule>) => {
    onChange(filters.map(filter => 
      filter.id === id ? { ...filter, ...updates } : filter
    ));
  };

  const removeFilter = (id: string) => {
    onChange(filters.filter(filter => filter.id !== id));
  };

  const clearAllFilters = () => {
    onChange([]);
  };

  const activeFiltersCount = filters.length;

  return (
    <div className={cn("flex items-center gap-2", className)}>
      {/* Active filters badges */}
      {filters.slice(0, 3).map(filter => {
        const column = columns.find(col => col.id === filter.field);
        const operator = OPERATORS[filter.type]?.find(op => op.value === filter.operator);
        
        return (
          <Badge key={filter.id} variant="secondary" className="flex items-center gap-1">
            <span className="text-xs">
              {column?.label}: {operator?.label} {filter.value}
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="h-auto p-0 w-4 h-4"
              onClick={() => removeFilter(filter.id)}
              data-testid={`remove-filter-${filter.id}`}
            >
              <X className="h-3 w-3" />
            </Button>
          </Badge>
        );
      })}

      {activeFiltersCount > 3 && (
        <Badge variant="secondary">
          +{activeFiltersCount - 3} altri filtri
        </Badge>
      )}

      {/* Filter dialog trigger */}
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogTrigger asChild>
          <Button 
            variant="outline" 
            size="sm"
            className="flex items-center gap-2"
            data-testid="button-advanced-filters"
          >
            <Filter className="h-4 w-4" />
            Filtri
            {activeFiltersCount > 0 && (
              <Badge variant="default" className="ml-1 h-5 px-1.5 text-xs">
                {activeFiltersCount}
              </Badge>
            )}
          </Button>
        </DialogTrigger>

        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Filtri Avanzati</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* Add filter button */}
            <div className="flex justify-between items-center">
              <Button 
                onClick={addFilter} 
                size="sm" 
                variant="outline"
                data-testid="button-add-filter"
              >
                <Plus className="h-4 w-4 mr-2" />
                Aggiungi Filtro
              </Button>
              
              {filters.length > 0 && (
                <Button 
                  onClick={clearAllFilters} 
                  size="sm" 
                  variant="outline"
                  data-testid="button-clear-all-filters"
                >
                  Rimuovi Tutti
                </Button>
              )}
            </div>

            {/* Filter rules */}
            <div className="space-y-3">
              {filters.map((filter, index) => (
                <FilterRule
                  key={filter.id}
                  filter={filter}
                  columns={columns}
                  isFirst={index === 0}
                  onUpdate={(updates) => updateFilter(filter.id, updates)}
                  onRemove={() => removeFilter(filter.id)}
                />
              ))}
            </div>

            {filters.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                Nessun filtro attivo. Clicca "Aggiungi Filtro" per iniziare.
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

interface FilterRuleProps {
  filter: FilterRule;
  columns: FilterColumn[];
  isFirst: boolean;
  onUpdate: (updates: Partial<FilterRule>) => void;
  onRemove: () => void;
}

function FilterRule({ filter, columns, isFirst, onUpdate, onRemove }: FilterRuleProps) {
  const selectedColumn = columns.find(col => col.id === filter.field);
  const availableOperators = OPERATORS[filter.type] || OPERATORS.text;

  const handleFieldChange = (fieldId: string) => {
    const column = columns.find(col => col.id === fieldId);
    if (column) {
      onUpdate({
        field: fieldId,
        type: column.type,
        operator: (OPERATORS[column.type]?.[0]?.value || 'contains') as FilterOperator,
        value: column.type === 'boolean' ? false : '',
      });
    }
  };

  const renderValueInput = () => {
    const needsValue = !['isEmpty', 'isNotEmpty'].includes(filter.operator);
    
    if (!needsValue) {
      return null;
    }

    switch (filter.type) {
      case 'text':
        return (
          <Input
            value={filter.value || ''}
            onChange={(e) => onUpdate({ value: e.target.value })}
            placeholder="Inserisci valore..."
            className="flex-1"
            data-testid={`filter-value-${filter.id}`}
          />
        );

      case 'number':
        if (filter.operator === 'between') {
          return (
            <div className="flex gap-2 flex-1">
              <Input
                type="number"
                value={filter.value?.from || ''}
                onChange={(e) => onUpdate({ 
                  value: { ...filter.value, from: parseFloat(e.target.value) || 0 }
                })}
                placeholder="Da..."
                data-testid={`filter-value-from-${filter.id}`}
              />
              <Input
                type="number"
                value={filter.value?.to || ''}
                onChange={(e) => onUpdate({ 
                  value: { ...filter.value, to: parseFloat(e.target.value) || 0 }
                })}
                placeholder="A..."
                data-testid={`filter-value-to-${filter.id}`}
              />
            </div>
          );
        }
        return (
          <Input
            type="number"
            value={filter.value || ''}
            onChange={(e) => onUpdate({ value: parseFloat(e.target.value) || 0 })}
            placeholder="Inserisci numero..."
            className="flex-1"
            data-testid={`filter-value-${filter.id}`}
          />
        );

      case 'boolean':
        return (
          <Select value={filter.value?.toString()} onValueChange={(value) => onUpdate({ value: value === 'true' })}>
            <SelectTrigger className="flex-1" data-testid={`filter-value-${filter.id}`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="true">Vero</SelectItem>
              <SelectItem value="false">Falso</SelectItem>
            </SelectContent>
          </Select>
        );

      case 'select':
        return (
          <Select value={filter.value} onValueChange={(value) => onUpdate({ value })}>
            <SelectTrigger className="flex-1" data-testid={`filter-value-${filter.id}`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {selectedColumn?.options
                ?.filter(option => option.value && option.value.trim() !== '')
                ?.map(option => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        );

      case 'date':
        if (filter.operator === 'between') {
          return (
            <div className="flex gap-2 flex-1">
              <DatePicker
                value={filter.value?.from}
                onChange={(date) => onUpdate({ 
                  value: { ...filter.value, from: date }
                })}
                placeholder="Data inizio..."
                testId={`filter-value-from-${filter.id}`}
              />
              <DatePicker
                value={filter.value?.to}
                onChange={(date) => onUpdate({ 
                  value: { ...filter.value, to: date }
                })}
                placeholder="Data fine..."
                testId={`filter-value-to-${filter.id}`}
              />
            </div>
          );
        }
        return (
          <DatePicker
            value={filter.value}
            onChange={(date) => onUpdate({ value: date })}
            placeholder="Seleziona data..."
            testId={`filter-value-${filter.id}`}
          />
        );

      default:
        return null;
    }
  };

  return (
    <div className="flex items-center gap-3 p-3 border rounded-lg bg-muted/20">
      {!isFirst && (
        <span className="text-sm font-medium text-muted-foreground">E</span>
      )}

      {/* Field selection */}
      <Select value={filter.field} onValueChange={handleFieldChange}>
        <SelectTrigger className="w-40" data-testid={`filter-field-${filter.id}`}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {columns.map(column => (
            <SelectItem key={column.id} value={column.id}>
              {column.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Operator selection */}
      <Select value={filter.operator} onValueChange={(value) => onUpdate({ operator: value as any })}>
        <SelectTrigger className="w-40" data-testid={`filter-operator-${filter.id}`}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {availableOperators.map(operator => (
            <SelectItem key={operator.value} value={operator.value}>
              {operator.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Value input */}
      {renderValueInput()}

      {/* Remove button */}
      <Button
        variant="ghost"
        size="sm"
        onClick={onRemove}
        className="p-2"
        data-testid={`remove-filter-${filter.id}`}
      >
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
}

interface DatePickerProps {
  value?: Date;
  onChange: (date: Date | undefined) => void;
  placeholder?: string;
  testId?: string;
}

function DatePicker({ value, onChange, placeholder, testId }: DatePickerProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            "justify-start text-left font-normal flex-1",
            !value && "text-muted-foreground"
          )}
          data-testid={testId}
        >
          <CalendarIcon className="mr-2 h-4 w-4" />
          {value ? format(value, "dd/MM/yyyy") : placeholder}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={value}
          onSelect={(date) => {
            onChange(date);
            setIsOpen(false);
          }}
          initialFocus
        />
      </PopoverContent>
    </Popover>
  );
}