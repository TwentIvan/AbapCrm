import { useState, useEffect } from "react";
import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  SortingState,
  useReactTable,
  RowSelectionState,
} from "@tanstack/react-table";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { X } from "lucide-react";

interface SimpleDataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  searchKey?: string;
  searchPlaceholder?: string;
  onRowClick?: (row: TData) => void;
  enableSelection?: boolean;
  onSelectionChange?: (selectedRows: TData[]) => void;
  bulkActions?: Array<{
    label: string;
    icon?: React.ComponentType<{ className?: string }>;
    onClick: (selectedData: TData[]) => void;
    variant?: "default" | "destructive" | "outline" | "secondary" | "ghost" | "link";
  }>;
}

export function SimpleDataTable<TData, TValue>({
  columns,
  data,
  searchKey = "name",
  searchPlaceholder = "Search...",
  onRowClick,
  enableSelection = false,
  onSelectionChange,
  bulkActions = [],
}: SimpleDataTableProps<TData, TValue>) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});

  console.log("🔍 SimpleDataTable render:", {
    dataLength: data.length,
    enableSelection,
    sortingState: sorting,
    rowSelectionState: rowSelection,
    firstRowId: data[0] ? (data[0] as any).id : 'no-data'
  });

  // Add selection column if needed
  const selectionColumn: ColumnDef<TData>[] = enableSelection ? [
    {
      id: "select",
      header: ({ table }) => (
        <Checkbox
          checked={table.getIsAllRowsSelected()}
          onCheckedChange={(value) => {
            console.log("🔍 Select-all clicked:", value);
            table.toggleAllRowsSelected(!!value);
          }}
          aria-label="Select all"
          data-testid="checkbox-select-all"
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          checked={row.getIsSelected()}
          onCheckedChange={(value) => {
            console.log("🔍 Row checkbox clicked:", { rowId: row.id, value, currentSelection: row.getIsSelected() });
            row.toggleSelected(!!value);
          }}
          aria-label="Select row"
          data-testid={`checkbox-select-${row.id}`}
        />
      ),
      enableSorting: false,
      enableHiding: false,
    },
  ] : [];

  const allColumns = [...selectionColumn, ...columns];

  const table = useReactTable({
    data,
    columns: allColumns,
    onSortingChange: setSorting,
    onRowSelectionChange: setRowSelection,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    enableRowSelection: enableSelection,
    getRowId: (row: any) => {
      console.log("🔍 getRowId called:", row.id);
      return row.id;
    },
    state: {
      sorting,
      rowSelection,
    },
  });

  const selectedRows = table.getFilteredSelectedRowModel().rows.map(row => row.original);

  // Notify parent about selection changes
  useEffect(() => {
    onSelectionChange?.(selectedRows);
  }, [rowSelection, selectedRows.length, onSelectionChange]);

  return (
    <div className="space-y-4">
      {/* Bulk Actions */}
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

      {/* Search disabled for now */}

      {/* Table */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead 
                    key={header.id}
                    className={header.column.getCanSort() ? "cursor-pointer select-none" : ""}
                    onClick={header.column.getToggleSortingHandler()}
                    data-testid={`header-${header.id}`}
                  >
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}
                    {header.column.getIsSorted() === "asc" && " ↑"}
                    {header.column.getIsSorted() === "desc" && " ↓"}
                  </TableHead>
                ))}
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
                    // Don't trigger row click if clicking on interactive elements
                    const target = e.target as HTMLElement;
                    if (target.closest('[role="checkbox"]') || 
                        target.closest('button') || 
                        target.closest('input') ||
                        target.closest('select')) {
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
                <TableCell colSpan={allColumns.length} className="h-24 text-center">
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
          {table.getRowModel().rows.length} elementi visualizzati
        </div>
      </div>
    </div>
  );
}