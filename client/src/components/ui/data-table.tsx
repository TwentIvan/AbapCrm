import { useState, useEffect, useMemo } from "react";
import { flexRender, getCoreRowModel, getSortedRowModel, getFilteredRowModel, getPaginationRowModel, useReactTable, type ColumnDef, type SortingState, type ColumnFiltersState, type RowSelectionState } from "@tanstack/react-table";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, ChevronRight, Settings, Search, Eye, EyeOff, Trash2, X, Filter, SlidersHorizontal } from "lucide-react";
import ImageContainer from "@/components/ui/image-container";
import { useToast } from "@/hooks/use-toast";
import { AdvancedFilters, type FilterRule, type FilterColumn } from "@/components/ui/advanced-filters";
import { useTableLayout, userPreferences, type TableLayout } from "@/lib/user-preferences";
import { SortableHeader } from "@/components/ui/sortable-header";
import { AggregationRow } from "@/components/ui/aggregation-row";
import { TableConfiguration } from "@/components/ui/table-configuration";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  horizontalListSortingStrategy,
} from "@dnd-kit/sortable";
import {
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  searchKey?: string;
  searchPlaceholder?: string;
  onRowClick?: (row: TData) => void;
  configurableColumns?: boolean;
  enableSelection?: boolean;
  onSelectionChange?: (selectedRows: TData[]) => void;
  bulkActions?: Array<{
    label: string;
    icon?: React.ComponentType<{ className?: string }>;
    onClick: (selectedRows: TData[], visibleColumns?: ColumnDef<TData, TValue>[]) => void;
    variant?: 'default' | 'destructive';
  }>;
  tableId: string; // Required for persistence
  enableAdvancedFilters?: boolean;
  filterColumns?: FilterColumn[];
  enableAggregation?: boolean;
  aggregationColumns?: Array<{
    id: string;
    type: 'sum' | 'avg' | 'count' | 'min' | 'max';
    label?: string;
  }>;
  enableColumnReordering?: boolean;
  enableClipboardCopy?: boolean; // New option to automatically add copy functionality
  editingLayout?: any; // Layout being edited
}

export function DataTable<TData, TValue>({
  columns,
  data,
  searchKey = "name",
  searchPlaceholder = "Search...",
  onRowClick,
  configurableColumns = true,
  enableSelection = false,
  onSelectionChange,
  bulkActions = [],
  tableId,
  enableAdvancedFilters = false,
  filterColumns = [],
  enableAggregation = false,
  aggregationColumns = [],
  enableColumnReordering = false,
  enableClipboardCopy = false,
  editingLayout = null // Layout being edited
}: DataTableProps<TData, TValue>) {
  // Load and manage table layout preferences
  const { layout, updateLayout, resetLayout, saveLayoutAs, currentLayoutName } = useTableLayout(tableId);
  
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  // No longer needed - using layout.columns instead
  // const [columnVisibility, setColumnVisibility] = useState({});
  const [globalFilter, setGlobalFilter] = useState("");
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [advancedFilters, setAdvancedFilters] = useState<FilterRule[]>(layout.filters || []);
  
  // Simple table key to avoid loops
  const tableKey = `table-${tableId}`;
  
  // DISABLED: Layout sync to prevent infinite loops
  // useEffect(() => {
  //   // Layout sync disabled 
  // }, []);
  
  // DISABLED: Auto-save layout changes to prevent infinite loops
  const [isInitialSync, setIsInitialSync] = useState(false);
  
  // useEffect(() => {
  //   // Auto-save disabled
  // }, []);

  // Drag and drop sensors
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Selection columns setup  
  const selectionColumn = enableSelection ? [{
    id: "select",
    header: ({ table }: any) => (
      <Checkbox
        checked={table.getIsAllPageRowsSelected()}
        onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
        aria-label="Select all"
        data-testid="checkbox-select-all"
      />
    ),
    cell: ({ row }: any) => (
      <Checkbox
        checked={row.getIsSelected()}
        onCheckedChange={(value) => row.toggleSelected(!!value)}
        aria-label="Select row"
        data-testid={`checkbox-select-${row.id}`}
      />
    ),
    enableSorting: false,
    enableHiding: false,
  }] : [];

  // Apply column ordering - SIMPLIFIED since we now use layout.columns positions
  const orderedColumns = useMemo(() => {
    return [...selectionColumn, ...columns];
  }, [selectionColumn, columns]);
  
  const allColumns = orderedColumns;


  // Apply advanced filters to data (before table creation)
  const filteredData = useMemo(() => {
    if (!enableAdvancedFilters || advancedFilters.length === 0) {
      return data;
    }
    
    return data.filter((row: any) => {
      return advancedFilters.every((filter) => {
        const cellValue = row[filter.field];
        
        switch (filter.operator) {
          case 'equals':
            return cellValue === filter.value;
          case 'contains':
            return String(cellValue).toLowerCase().includes(String(filter.value).toLowerCase());
          case 'startsWith':
            return String(cellValue).toLowerCase().startsWith(String(filter.value).toLowerCase());
          case 'endsWith':
            return String(cellValue).toLowerCase().endsWith(String(filter.value).toLowerCase());
          case 'gt':
            return Number(cellValue) > Number(filter.value);
          case 'gte':
            return Number(cellValue) >= Number(filter.value);
          case 'lt':
            return Number(cellValue) < Number(filter.value);
          case 'lte':
            return Number(cellValue) <= Number(filter.value);
          case 'between':
            return Number(cellValue) >= Number(filter.value.from) && Number(cellValue) <= Number(filter.value.to);
          case 'isEmpty':
            return !cellValue || cellValue === '';
          case 'isNotEmpty':
            return cellValue && cellValue !== '';
          default:
            return true;
        }
      });
    });
  }, [data, advancedFilters, enableAdvancedFilters]);
  
  // Calculate aggregations
  const aggregations = useMemo(() => {
    if (!enableAggregation || aggregationColumns.length === 0) {
      return {};
    }
    
    const results: Record<string, any> = {};
    
    aggregationColumns.forEach((aggCol) => {
      const values = filteredData
        .map((row: any) => Number(row[aggCol.id]))
        .filter((val) => !isNaN(val));
      
      switch (aggCol.type) {
        case 'sum':
          results[aggCol.id] = values.reduce((sum, val) => sum + val, 0);
          break;
        case 'avg':
          results[aggCol.id] = values.length ? values.reduce((sum, val) => sum + val, 0) / values.length : 0;
          break;
        case 'count':
          results[aggCol.id] = values.length;
          break;
        case 'min':
          results[aggCol.id] = values.length ? Math.min(...values) : 0;
          break;
        case 'max':
          results[aggCol.id] = values.length ? Math.max(...values) : 0;
          break;
      }
    });
    
    return results;
  }, [filteredData, aggregationColumns, enableAggregation]);

  // USER'S ALGORITHM: SELECT visible columns ORDER BY position
  const getVisibleColumnsInOrder = useMemo(() => {
    let layoutColumns = layout.columns || {};
    
    console.log(`🔍 DEBUG - Layout: "${currentLayoutName}", Columns:`, layoutColumns);
    console.log(`🔍 DEBUG - columnVisibility:`, layout.columnVisibility);
    
    // SYNC FIX: Update layout.columns from columnVisibility if they don't match
    if (layout.columnVisibility && Object.keys(layout.columnVisibility).length > 0) {
      console.log(`🔄 SYNC: Updating columns from columnVisibility`);
      
      // Update layoutColumns from columnVisibility
      Object.entries(layout.columnVisibility).forEach(([colId, visible]) => {
        if (layoutColumns[colId]) {
          layoutColumns[colId] = { 
            ...layoutColumns[colId], 
            visible: visible as boolean 
          };
        }
      });
      
      // Save the synced columns back to layout
      updateLayout({ columns: layoutColumns });
      console.log(`✅ SYNC: Updated columns:`, layoutColumns);
    }
    
    // AUTO-POPULATE: Only for DEFAULT layout if still empty
    if (Object.keys(layoutColumns).length === 0) {
      console.log(`⚠️  Layout "${currentLayoutName}" has empty columns - needs configuration!`);
      
      if (currentLayoutName === 'Default') {
        layoutColumns = {};
        orderedColumns.forEach((col, index) => {
          const colId = (col as any).accessorKey || col.id;
          if (colId && colId !== 'actions' && colId !== 'select') { // Skip special columns
            layoutColumns[colId] = { visible: true, position: index + 1 };
          }
        });
        
        // Auto-save the populated columns to layout
        updateLayout({ columns: layoutColumns });
        console.log('🎯 Auto-populated columns for DEFAULT layout:', Object.keys(layoutColumns));
      } else {
        console.log(`❌ Layout "${currentLayoutName}" has no column configuration - returning empty!`);
        return []; // Return empty columns for unconfigured saved layouts
      }
    }
    
    // 1. SELECT: Get all columns with visible: true
    const visibleColumnConfigs = Object.entries(layoutColumns)
      .filter(([_, config]) => config.visible === true)
      .sort(([_, a], [__, b]) => a.position - b.position); // 2. ORDER BY: Sort by position
    
    // 3. RENDER: Map to actual column definitions
    const visibleColumnIds = visibleColumnConfigs.map(([columnId]) => columnId);
    
    // Filter original columns to keep only visible ones in correct order
    const filteredColumns = orderedColumns.filter(col => {
      const colId = (col as any).accessorKey || col.id;
      return visibleColumnIds.includes(colId);
    });
    
    // Sort filtered columns according to layout position
    filteredColumns.sort((a, b) => {
      const aId = (a as any).accessorKey || a.id;
      const bId = (b as any).accessorKey || b.id;
      const aIndex = visibleColumnIds.indexOf(aId);
      const bIndex = visibleColumnIds.indexOf(bId);
      return aIndex - bIndex;
    });
    
    console.log('🎯 User algorithm result:', visibleColumnIds);
    return filteredColumns;
  }, [orderedColumns, layout.columns, updateLayout, currentLayoutName]);
  
  const visibleColumns = getVisibleColumnsInOrder;

  const table = useReactTable({
    data: filteredData,
    columns: visibleColumns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onGlobalFilterChange: setGlobalFilter,
    onRowSelectionChange: setRowSelection,
    globalFilterFn: "includesString",
    enableRowSelection: enableSelection,
    state: {
      sorting,
      columnFilters,
      globalFilter,
      rowSelection,
    },
  });


  // Calculate selected rows
  const selectedRows = table.getFilteredSelectedRowModel().rows.map(row => row.original);
  const { toast } = useToast();

  // Add automatic clipboard copy action if enabled
  const allBulkActions = useMemo(() => {
    const actions = [...bulkActions];
    if (enableClipboardCopy) {
      actions.unshift({
        label: 'Copia negli Appunti',
        icon: ({ className }: { className?: string }) => (
          <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
        ),
        onClick: (selectedData: TData[]) => {
          copySelectedDataToClipboard(selectedData, orderedColumns, toast);
        },
        variant: 'default' as const,
      });
    }
    return actions;
  }, [bulkActions, enableClipboardCopy, orderedColumns, toast]);

  // Column order initialization disabled - using layout.columns now
  // useEffect(() => {
  //   // Disabled
  // }, []);
  
  // Handle column drag end - DISABLED (using layout.columns now)
  const handleDragEnd = (event: DragEndEvent) => {
    // Drag & drop disabled for now
  };

  // Notify parent about selection changes
  useEffect(() => {
    if (onSelectionChange) {
      onSelectionChange(selectedRows);
    }
  }, [rowSelection, onSelectionChange, table]);

  return (
    <div className="space-y-4">
      {/* Bulk Actions Toolbar */}
      {enableSelection && selectedRows.length > 0 && (
        <div className="flex items-center justify-between bg-muted/50 px-4 py-2 rounded-lg border">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">
              {selectedRows.length} elemento{selectedRows.length !== 1 ? 'i' : ''} selezionat{selectedRows.length !== 1 ? 'i' : 'o'}
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => table.toggleAllRowsSelected(false)}
              data-testid="button-clear-selection"
            >
              <X className="h-4 w-4" />
              Deseleziona
            </Button>
          </div>
          <div className="flex items-center gap-2">
            {allBulkActions.map((action, index) => (
              <Button
                key={index}
                variant={action.variant || 'default'}
                size="sm"
                onClick={() => action.onClick(selectedRows, orderedColumns)}
                data-testid={`button-bulk-${action.label.toLowerCase().replace(/\s+/g, '-')}`}
              >
                {action.icon && <action.icon className="mr-2 h-4 w-4" />}
                {action.label}
              </Button>
            ))}
          </div>
        </div>
      )}

      {/* Search, Filters and Column Visibility */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
            <Input
              placeholder={searchPlaceholder}
              value={globalFilter ?? ""}
              onChange={(event) => setGlobalFilter(String(event.target.value))}
              className="pl-10"
              data-testid="input-table-search"
            />
          </div>

          {enableAdvancedFilters && filterColumns.length > 0 && (
            <AdvancedFilters
              columns={filterColumns}
              filters={advancedFilters}
              onChange={setAdvancedFilters}
            />
          )}
        </div>

        <div className="flex items-center gap-2">
          {configurableColumns && (
            <TableConfiguration
              tableId={tableId}
              availableColumns={allColumns
                .filter(col => {
                  const colId = col.id || (col as any).accessorKey;
                  return colId && colId !== 'select' && colId !== 'actions';
                })
                .map(col => {
                  const colId = col.id || (col as any).accessorKey;
                  const colHeader = typeof col.header === 'function' ? colId : (col.header || colId);
                  return {
                    id: colId as string,
                    label: colHeader as string,
                  };
                })}
              currentAggregations={aggregationColumns}
              onConfigurationChange={(config) => {
                // Apply configuration changes immediately
                // NOTE: columnVisibility and columnOrder disabled - using layout.columns now
                if (config.sorting && config.sorting.length > 0) {
                  setSorting(config.sorting.map((sort: any) => ({ id: sort.id, desc: sort.desc })));
                }
              }}
              onSaveLayout={(layoutName, isDefault) => {
                return saveLayoutAs(layoutName);
              }}
              editingLayout={editingLayout}
            />
          )}
          
          {enableColumnReordering && (
            <Button 
              variant="outline" 
              size="sm" 
              onClick={resetLayout}
              data-testid="button-reset-layout"
            >
              <SlidersHorizontal className="mr-2 h-4 w-4" />
              Reset Layout
            </Button>
          )}
          
        </div>
      </div>

      {/* Aggregations Row - Top */}
      {enableAggregation && layout.aggregations.position === 'top' && (
        <AggregationRow 
          aggregations={aggregations}
          aggregationColumns={aggregationColumns}
          allColumns={allColumns}
          position="top"
        />
      )}

      {/* Table */}
      <div className="rounded-md border">
        <DndContext 
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <Table>
            <TableHeader>
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id}>
                  <SortableContext 
                    items={headerGroup.headers.map(h => h.id)}
                    strategy={horizontalListSortingStrategy}
                  >
                    {headerGroup.headers.map((header) => (
                      <SortableHeader
                        key={header.id}
                        header={header}
                        enableReordering={enableColumnReordering}
                      />
                    ))}
                  </SortableContext>
                </TableRow>
              ))}
            </TableHeader>
          <TableBody>
            {table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() && "selected"}
                  className={`${onRowClick ? "cursor-pointer hover:bg-muted/50" : ""} ${row.getIsSelected() ? "bg-muted/50" : ""}`}
                  onClick={(e) => {
                    // Don't trigger row click if clicking on checkbox
                    if ((e.target as HTMLElement).closest('[role="checkbox"]')) {
                      return;
                    }
                    onRowClick?.(row.original);
                  }}
                  data-testid={`row-${row.id}`}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id} data-testid={`cell-${cell.id}`}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-24 text-center">
                  No results found.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
        </DndContext>
      </div>

      {/* Aggregations Row - Bottom */}
      {enableAggregation && layout.aggregations.position === 'bottom' && (
        <AggregationRow 
          aggregations={aggregations}
          aggregationColumns={aggregationColumns}
          allColumns={allColumns}
          position="bottom"
        />
      )}

      {/* Pagination */}
      <div className="flex items-center justify-between space-x-2 py-4">
        <div className="text-sm text-muted-foreground">
          {table.getFilteredRowModel().rows.length} {tableId?.includes('partner') ? 'partner' : tableId?.includes('project') ? 'progetti' : tableId?.includes('task') ? 'task' : tableId?.includes('deal') ? 'deal' : tableId?.includes('timesheet') ? 'time entries' : 'elementi'} visualizzati
        </div>

        <div className="flex items-center space-x-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
            data-testid="button-previous-page"
          >
            <ChevronLeft className="h-4 w-4" />
            Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
            data-testid="button-next-page"
          >
            Next
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

// Helper function to copy selected data to clipboard in TSV format
export function copySelectedDataToClipboard<TData>(
  selectedData: TData[],
  visibleColumns: any[],
  toast: any
) {
  if (selectedData.length === 0) {
    toast({
      title: "Nessun dato selezionato",
      description: "Seleziona almeno una riga per copiare i dati.",
      variant: "destructive",
    });
    return;
  }

  try {
    // Get only visible columns (exclude select and actions columns)
    const dataColumns = visibleColumns.filter(col => {
      const colId = col.id || (col as any).accessorKey;
      return colId && colId !== 'select' && colId !== 'actions';
    });

    // Create header row with column names
    const headers = dataColumns.map(col => {
      const colHeader = typeof col.header === 'function' ? 
        (col.id || (col as any).accessorKey) : 
        (col.header || col.id || (col as any).accessorKey);
      return String(colHeader);
    });

    // Create data rows
    const dataRows = selectedData.map(row => {
      return dataColumns.map(col => {
        const colId = col.id || (col as any).accessorKey;
        const cellValue = (row as any)[colId];
        
        // Handle different data types
        if (cellValue === null || cellValue === undefined) {
          return '';
        }
        
        // Convert to string and clean up for TSV format
        let value = String(cellValue);
        
        // Replace tabs and newlines to avoid breaking TSV format
        value = value.replace(/\t/g, ' ').replace(/\n/g, ' ').replace(/\r/g, '');
        
        return value;
      });
    });

    // Create TSV format without headers (only data rows)
    const tsvContent = dataRows
      .map(row => row.join('\t'))
      .join('\n');

    // Copy to clipboard
    navigator.clipboard.writeText(tsvContent).then(() => {
      toast({
        title: "Dati copiati negli appunti",
        description: `${selectedData.length} ${selectedData.length === 1 ? 'riga copiata' : 'righe copiate'} nel formato Excel.`,
      });
    }).catch(() => {
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = tsvContent;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      
      toast({
        title: "Dati copiati negli appunti",
        description: `${selectedData.length} ${selectedData.length === 1 ? 'riga copiata' : 'righe copiate'} nel formato Excel.`,
      });
    });

  } catch (error) {
    toast({
      title: "Errore nella copia",
      description: "Impossibile copiare i dati negli appunti.",
      variant: "destructive",
    });
  }
}

// Helper function to create image column
export function createImageColumn<T>(accessor: keyof T, header: string, fallbackType: 'logo' | 'avatar' | 'generic' = 'generic') {
  return {
    accessorKey: accessor as string,
    header,
    cell: ({ row }: any) => {
      const value = row.getValue(accessor as string) as string;
      return (
        <ImageContainer
          src={value}
          alt={`${header} for ${row.original.name || 'item'}`}
          fallbackType={fallbackType}
          size="sm"
          data-testid={`img-${accessor as string}-${row.id}`}
        />
      );
    },
  };
}

// Helper function to create badge column
export function createBadgeColumn<T>(accessor: keyof T, header: string, colorMap?: Record<string, string>) {
  return {
    accessorKey: accessor as string,
    header,
    cell: ({ row }: any) => {
      const value = row.getValue(accessor as string) as string;
      if (!value) return null;
      
      const color = colorMap?.[value] || "default";
      return (
        <Badge variant={color as any} data-testid={`badge-${accessor as string}-${row.id}`}>
          {value}
        </Badge>
      );
    },
  };
}

// Helper function to create text column with truncation
export function createTextColumn<T>(accessor: keyof T, header: string, maxLength = 50) {
  return {
    accessorKey: accessor as string,
    header,
    cell: ({ row }: any) => {
      const value = row.getValue(accessor as string) as string;
      if (!value) return null;
      
      const truncated = value.length > maxLength ? `${value.substring(0, maxLength)}...` : value;
      return (
        <span 
          title={value}
          data-testid={`text-${accessor as string}-${row.id}`}
        >
          {truncated}
        </span>
      );
    },
  };
}