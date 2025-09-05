import { useState, useMemo, memo } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { X, Trash2 } from "lucide-react";

export interface TableColumn {
  key: string;
  label: string;
  sortable?: boolean;
  searchable?: boolean;
  render?: (item: any) => React.ReactNode;
  accessor?: (item: any) => any; // Per campi nested come partner.name
}

interface UniversalTableProps {
  data: any[];
  columns: TableColumn[];
  enableSelection?: boolean;
  onSelectionChange?: (selectedItems: any[]) => void;
  onRowClick?: (item: any) => void;
  bulkActions?: Array<{
    label: string;
    icon?: React.ComponentType<{ className?: string }>;
    onClick: (selectedItems: any[]) => void;
    variant?: "default" | "destructive" | "outline";
  }>;
  emptyMessage?: string;
}

const UniversalTableComponent = memo(function UniversalTable({
  data,
  columns,
  enableSelection = false,
  onSelectionChange,
  onRowClick,
  bulkActions = [],
  emptyMessage = "Nessun elemento trovato"
}: UniversalTableProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [sortField, setSortField] = useState<string>("");
  const [sortDesc, setSortDesc] = useState<boolean>(false);

  // Ordina dati - OTTIMIZZATO per performance
  const sortedData = useMemo(() => {
    if (!sortField || !data.length) return data;
    
    const column = columns.find(col => col.key === sortField);
    if (!column?.sortable) return data;
    
    return [...data].sort((a, b) => {
      let aVal = column?.accessor ? column.accessor(a) : a[sortField];
      let bVal = column?.accessor ? column.accessor(b) : b[sortField];
      
      // Gestione valori null/undefined
      if (aVal == null) aVal = "";
      if (bVal == null) bVal = "";
      
      // Conversione a stringa solo se necessario
      if (typeof aVal === 'string' && typeof bVal === 'string') {
        aVal = aVal.toLowerCase();
        bVal = bVal.toLowerCase();
      }
      
      const result = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
      return sortDesc ? -result : result;
    });
  }, [data, sortField, sortDesc, columns]);

  // Gestione selezione - OTTIMIZZATO
  const handleItemSelect = (id: string) => {
    const newSelected = new Set(selectedIds);
    if (selectedIds.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
    
    // Notifica parent - calcolo lazy
    if (onSelectionChange) {
      const selectedItems = data.filter(item => newSelected.has(item.id));
      onSelectionChange(selectedItems);
    }
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      const allIds = new Set(sortedData.map(item => item.id));
      setSelectedIds(allIds);
      onSelectionChange?.(sortedData);
    } else {
      setSelectedIds(new Set());
      onSelectionChange?.([]);
    }
  };

  // Gestione ordinamento
  const handleSort = (columnKey: string) => {
    const column = columns.find(col => col.key === columnKey);
    if (!column?.sortable) return;
    
    if (sortField === columnKey) {
      setSortDesc(!sortDesc);
    } else {
      setSortField(columnKey);
      setSortDesc(false);
    }
  };

  const isAllSelected = selectedIds.size > 0 && selectedIds.size === sortedData.length;
  const isPartiallySelected = selectedIds.size > 0 && selectedIds.size < sortedData.length;

  return (
    <div className="space-y-4">
      {/* Barra azioni bulk */}
      {enableSelection && selectedIds.size > 0 && (
        <div className="flex items-center justify-between bg-blue-50 px-4 py-2 rounded-lg border border-blue-200">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-blue-800">
              {selectedIds.size} elemento{selectedIds.size !== 1 ? 'i' : ''} selezionat{selectedIds.size !== 1 ? 'i' : 'o'}
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSelectedIds(new Set());
                onSelectionChange?.([]);
              }}
              className="text-blue-600 hover:text-blue-800"
            >
              <X className="h-4 w-4" />
              Deseleziona
            </Button>
          </div>
          <div className="flex items-center gap-2">
            {bulkActions.map((action, index) => (
              <Button
                key={index}
                variant={action.variant || 'default'}
                size="sm"
                onClick={() => {
                  const selectedItems = sortedData.filter(item => selectedIds.has(item.id));
                  action.onClick(selectedItems);
                }}
              >
                {action.icon && <action.icon className="mr-2 h-4 w-4" />}
                {action.label}
              </Button>
            ))}
          </div>
        </div>
      )}


      {/* Tabella */}
      <div className="rounded-md border">
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              {enableSelection && (
                <th className="p-3 text-left w-12">
                  <input 
                    type="checkbox" 
                    checked={isAllSelected}
                    ref={(el) => {
                      if (el) el.indeterminate = isPartiallySelected;
                    }}
                    onChange={(e) => handleSelectAll(e.target.checked)}
                    className="rounded border-gray-300"
                  />
                </th>
              )}
              {columns.map((column) => (
                <th 
                  key={column.key}
                  className={`p-3 text-left font-medium text-gray-700 ${
                    column.sortable ? 'cursor-pointer hover:bg-gray-100 select-none' : ''
                  }`}
                  onClick={() => column.sortable && handleSort(column.key)}
                >
                  <div className="flex items-center gap-1">
                    {column.label}
                    {column.sortable && sortField === column.key && (
                      <span className="text-xs">
                        {sortDesc ? '↓' : '↑'}
                      </span>
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sortedData && sortedData.length > 0 ? (
              sortedData.map((item) => (
                <tr 
                  key={item.id}
                  className={`border-t hover:bg-gray-50 ${
                    selectedIds.has(item.id) ? 'bg-blue-50' : ''
                  } ${onRowClick ? 'cursor-pointer' : ''}`}
                  onClick={(e) => {
                    // Non triggerare row click se si clicca su checkbox o button
                    if ((e.target as HTMLElement).closest('input[type="checkbox"]') || 
                        (e.target as HTMLElement).closest('button')) {
                      return;
                    }
                    onRowClick?.(item);
                  }}
                >
                  {enableSelection && (
                    <td className="p-3">
                      <input 
                        type="checkbox" 
                        checked={selectedIds.has(item.id)}
                        onChange={() => handleItemSelect(item.id)}
                        className="rounded border-gray-300"
                      />
                    </td>
                  )}
                  {columns.map((column) => (
                    <td key={column.key} className="p-3">
                      {column.render ? 
                        column.render(item) : 
                        String(column.accessor ? column.accessor(item) : item[column.key] || "—")
                      }
                    </td>
                  ))}
                </tr>
              ))
            ) : (
              <tr>
                <td 
                  colSpan={columns.length + (enableSelection ? 1 : 0)} 
                  className="p-8 text-center text-gray-500"
                >
                  {emptyMessage}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Info risultati */}
      <div className="text-sm text-gray-500">
        {sortedData.length} di {data.length} elementi visualizzati
      </div>
    </div>
  );
});

export const UniversalTable = UniversalTableComponent;

// Helper per creare colonne standard rapidamente
export const createStandardColumns = {
  text: (key: string, label: string, options: { sortable?: boolean; searchable?: boolean } = {}) => ({
    key,
    label,
    sortable: options.sortable ?? true,
    searchable: options.searchable ?? true,
  }),

  badge: (key: string, label: string, colors?: Record<string, string>) => ({
    key,
    label,
    sortable: true,
    searchable: true,
    render: (item: any) => {
      const value = item[key];
      if (!value) return "—";
      const colorClass = colors?.[value] || "bg-gray-100 text-gray-800";
      return <Badge className={colorClass}>{value}</Badge>;
    }
  }),

  partner: (label: string = "Partner") => ({
    key: "partner",
    label,
    sortable: true,
    searchable: true,
    accessor: (item: any) => item.partner?.name || "",
    render: (item: any) => item.partner ? (
      <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
        {item.partner.name}
      </Badge>
    ) : "—"
  }),

  date: (key: string, label: string) => ({
    key,
    label,
    sortable: true,
    searchable: false,
    render: (item: any) => {
      const date = item[key];
      return date ? new Date(date).toLocaleDateString('it-IT') : "—";
    }
  }),

  actions: (actions: Array<{ label: string; icon: any; onClick: (item: any) => void }>) => ({
    key: "actions",
    label: "Azioni",
    sortable: false,
    searchable: false,
    render: (item: any) => (
      <div className="flex items-center gap-1">
        {actions.map((action, index) => (
          <Button
            key={index}
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              action.onClick(item);
            }}
          >
            <action.icon className="h-4 w-4" />
          </Button>
        ))}
      </div>
    )
  })
};