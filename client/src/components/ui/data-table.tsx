import { useState, useEffect } from "react";
import { flexRender, getCoreRowModel, getSortedRowModel, getFilteredRowModel, getPaginationRowModel, useReactTable, type ColumnDef, type SortingState, type ColumnFiltersState, type RowSelectionState } from "@tanstack/react-table";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, ChevronRight, Settings, Search, Eye, EyeOff, Trash2, X } from "lucide-react";
import ImageContainer from "@/components/ui/image-container";

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
  bulkActions = []
}: DataTableProps<TData, TValue>) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = useState({});
  const [globalFilter, setGlobalFilter] = useState("");
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});

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

  const allColumns = [...selectionColumn, ...columns];

  const table = useReactTable({
    data,
    columns: allColumns,
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

      {/* Search and Column Visibility */}
      <div className="flex items-center justify-between">
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

        {configurableColumns && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" data-testid="button-configure-columns">
                <Settings className="mr-2 h-4 w-4" />
                Columns
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-[200px]">
              {table
                .getAllColumns()
                .filter((column) => column.getCanHide())
                .map((column) => {
                  return (
                    <DropdownMenuCheckboxItem
                      key={column.id}
                      className="capitalize"
                      checked={column.getIsVisible()}
                      onCheckedChange={(value) =>
                        column.toggleVisibility(!!value)
                      }
                      data-testid={`checkbox-column-${column.id}`}
                    >
                      <div className="flex items-center gap-2">
                        {column.getIsVisible() ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
                        {column.id}
                      </div>
                    </DropdownMenuCheckboxItem>
                  );
                })}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {/* Table */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  return (
                    <TableHead 
                      key={header.id}
                      className="cursor-pointer select-none"
                      onClick={() => header.column.getCanSort() && header.column.toggleSorting()}
                      data-testid={`header-${header.id}`}
                    >
                      {header.isPlaceholder
                        ? null
                        : flexRender(
                            header.column.columnDef.header,
                            header.getContext()
                          )}
                      {header.column.getCanSort() && (
                        <span className="ml-2 text-muted-foreground">
                          {header.column.getIsSorted() === "asc" ? "↑" : 
                           header.column.getIsSorted() === "desc" ? "↓" : "↕"}
                        </span>
                      )}
                    </TableHead>
                  );
                })}
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
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between space-x-2 py-4">
        <div className="text-sm text-muted-foreground">
          Showing {table.getState().pagination.pageIndex * table.getState().pagination.pageSize + 1} to{" "}
          {Math.min(
            (table.getState().pagination.pageIndex + 1) * table.getState().pagination.pageSize,
            table.getFilteredRowModel().rows.length
          )}{" "}
          of {table.getFilteredRowModel().rows.length} entries
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