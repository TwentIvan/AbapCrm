import { useState } from "react";
import { flexRender, getCoreRowModel, getSortedRowModel, getFilteredRowModel, getPaginationRowModel, useReactTable, type ColumnDef, type SortingState, type ColumnFiltersState } from "@tanstack/react-table";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, ChevronRight, Settings, Search, Eye, EyeOff } from "lucide-react";
import ImageContainer from "@/components/ui/image-container";

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  searchKey?: string;
  searchPlaceholder?: string;
  onRowClick?: (row: TData) => void;
  configurableColumns?: boolean;
}

export function DataTable<TData, TValue>({
  columns,
  data,
  searchKey = "name",
  searchPlaceholder = "Search...",
  onRowClick,
  configurableColumns = true
}: DataTableProps<TData, TValue>) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = useState({});
  const [globalFilter, setGlobalFilter] = useState("");

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    onGlobalFilterChange: setGlobalFilter,
    globalFilterFn: "includesString",
    state: {
      sorting,
      columnFilters,
      columnVisibility,
      globalFilter,
    },
  });

  return (
    <div className="space-y-4">
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
                  className={onRowClick ? "cursor-pointer hover:bg-muted/50" : ""}
                  onClick={() => onRowClick?.(row.original)}
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