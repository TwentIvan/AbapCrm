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
    onClick: (selectedRows: TData[]) => void;
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
  enableColumnReordering = false
}: DataTableProps<TData, TValue>) {
  // Load and manage table layout preferences
  const { layout, updateLayout, resetLayout } = useTableLayout(tableId);
  
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = useState(layout.columnVisibility || {});
  const [globalFilter, setGlobalFilter] = useState("");
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [advancedFilters, setAdvancedFilters] = useState<FilterRule[]>(layout.filters || []);
  const [columnOrder, setColumnOrder] = useState<string[]>(layout.columnOrder || []);
  
  // Convert layout sorting to react-table sorting format
  useEffect(() => {
    if (layout.sorting && layout.sorting.length > 0) {
      const reactTableSorting = layout.sorting.map(sort => ({
        id: sort.id,
        desc: sort.desc
      }));
      setSorting(reactTableSorting);
    }
  }, [layout.sorting]);
  
  // Auto-save layout changes
  useEffect(() => {
    const layoutSorting = sorting.map((sort, index) => ({
      id: sort.id,
      desc: sort.desc,
      priority: index
    }));
    
    updateLayout({
      sorting: layoutSorting,
      columnVisibility,
      filters: advancedFilters,
      columnOrder,
    });
  }, [sorting, columnVisibility, advancedFilters, columnOrder]);

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

  // Apply column ordering if enabled
  const orderedColumns = useMemo(() => {
    const baseColumns = [...selectionColumn, ...columns];
    console.log('DataTable - Building orderedColumns:', {
      enableColumnReordering,
      columnOrderLength: columnOrder.length,
      columnOrder,
      baseColumns: baseColumns.map(c => ({ id: c.id, accessorKey: (c as any).accessorKey }))
    });
    
    if (!enableColumnReordering || !columnOrder.length) {
      console.log('DataTable - Using baseColumns (no reordering)');
      return baseColumns;
    }
    
    const ordered = [...baseColumns].sort((a, b) => {
      const aId = a.id || (a as any).accessorKey;
      const bId = b.id || (b as any).accessorKey;
      const aIndex = columnOrder.indexOf(aId as string);
      const bIndex = columnOrder.indexOf(bId as string);
      if (aIndex === -1 && bIndex === -1) return 0;
      if (aIndex === -1) return 1;
      if (bIndex === -1) return -1;
      return aIndex - bIndex;
    });
    
    console.log('DataTable - Using ordered columns:', ordered.map(c => ({ id: c.id, accessorKey: (c as any).accessorKey })));
    return ordered;
  }, [selectionColumn, columns, columnOrder, enableColumnReordering]);
  
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

  const table = useReactTable({
    data: filteredData,
    columns: orderedColumns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    onGlobalFilterChange: setGlobalFilter,
    onRowSelectionChange: setRowSelection,
    globalFilterFn: "includesString",
    enableRowSelection: enableSelection,
    state: {
      sorting,
      columnFilters,
      columnVisibility,
      globalFilter,
      rowSelection,
    },
  });

  // Calculate selected rows
  const selectedRows = table.getFilteredSelectedRowModel().rows.map(row => row.original);

  // Initialize column order
  useEffect(() => {
    if (enableColumnReordering && columnOrder.length === 0) {
      const initialOrder = allColumns.map(col => col.id || (col as any).accessorKey as string).filter(Boolean);
      console.log('DataTable - Initializing columnOrder:', initialOrder);
      setColumnOrder(initialOrder);
    }
  }, [allColumns, enableColumnReordering, columnOrder.length]);
  
  // Handle column drag end
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    
    if (active.id !== over?.id) {
      setColumnOrder((items) => {
        const oldIndex = items.indexOf(active.id as string);
        const newIndex = items.indexOf(over?.id as string);
        return arrayMove(items, oldIndex, newIndex);
      });
    }
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
            {bulkActions.map((action, index) => (
              <Button
                key={index}
                variant={action.variant || 'default'}
                size="sm"
                onClick={() => action.onClick(selectedRows)}
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
                console.log('DataTable - Configuration changed:', config);
                // Apply configuration changes immediately
                if (config.columnVisibility) {
                  console.log('DataTable - Updating columnVisibility:', config.columnVisibility);
                  setColumnVisibility(config.columnVisibility);
                }
                if (config.columnOrder && config.columnOrder.length > 0) {
                  console.log('DataTable - Updating columnOrder:', config.columnOrder);
                  setColumnOrder(config.columnOrder);
                }
              }}
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