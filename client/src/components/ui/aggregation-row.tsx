import { Badge } from "@/components/ui/badge";
import { TableCell, TableRow } from "@/components/ui/table";
import { type ColumnDef } from "@tanstack/react-table";

interface AggregationRowProps<TData> {
  aggregations: Record<string, any>;
  aggregationColumns: Array<{
    id: string;
    type: 'sum' | 'avg' | 'count' | 'min' | 'max';
    label?: string;
  }>;
  allColumns: ColumnDef<TData, any>[];
  position: 'top' | 'bottom';
}

export function AggregationRow<TData>({ 
  aggregations, 
  aggregationColumns, 
  allColumns, 
  position 
}: AggregationRowProps<TData>) {
  if (Object.keys(aggregations).length === 0) {
    return null;
  }

  const formatValue = (value: number, type: string) => {
    if (isNaN(value)) return '-';
    
    switch (type) {
      case 'sum':
      case 'avg':
        return new Intl.NumberFormat('it-IT', { 
          style: 'decimal',
          minimumFractionDigits: 2,
          maximumFractionDigits: 2 
        }).format(value);
      case 'count':
        return value.toString();
      case 'min':
      case 'max':
        return new Intl.NumberFormat('it-IT', { 
          style: 'decimal',
          minimumFractionDigits: 2,
          maximumFractionDigits: 2 
        }).format(value);
      default:
        return value.toString();
    }
  };

  const getAggregationLabel = (type: string) => {
    switch (type) {
      case 'sum': return 'Totale';
      case 'avg': return 'Media';
      case 'count': return 'Conteggio';
      case 'min': return 'Minimo';
      case 'max': return 'Massimo';
      default: return type;
    }
  };

  return (
    <div className={`bg-muted/30 border rounded-lg p-4 ${position === 'top' ? 'mb-4' : 'mt-4'}`}>
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-sm font-medium text-muted-foreground">
          {position === 'top' ? 'Totali (in alto)' : 'Totali (in basso)'}
        </h4>
        <Badge variant="outline" className="text-xs">
          {aggregationColumns.length} aggregazione{aggregationColumns.length !== 1 ? 'i' : ''}
        </Badge>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {aggregationColumns.map((aggCol) => {
          const column = allColumns.find(col => col.id === aggCol.id);
          const value = aggregations[aggCol.id];
          
          if (value === undefined || value === null) return null;
          
          return (
            <div 
              key={`${aggCol.id}-${aggCol.type}`}
              className="flex flex-col space-y-1 p-3 bg-background border rounded-md"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground uppercase tracking-wide">
                  {aggCol.label || column?.header?.toString() || aggCol.id}
                </span>
                <Badge variant="secondary" className="text-xs px-1.5 py-0.5">
                  {getAggregationLabel(aggCol.type)}
                </Badge>
              </div>
              <span className="text-lg font-semibold" data-testid={`aggregation-${aggCol.id}-${aggCol.type}`}>
                {formatValue(value, aggCol.type)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}