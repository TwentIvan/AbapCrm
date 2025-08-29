import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import { TableHead } from "@/components/ui/table";
import { flexRender, type Header } from "@tanstack/react-table";
import { cn } from "@/lib/utils";

interface SortableHeaderProps<TData> {
  header: Header<TData, unknown>;
  enableReordering?: boolean;
}

export function SortableHeader<TData>({ header, enableReordering = false }: SortableHeaderProps<TData>) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: header.id,
    disabled: !enableReordering,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <TableHead 
      ref={setNodeRef}
      style={style}
      className={cn(
        "cursor-pointer select-none relative",
        isDragging && "opacity-50 z-50",
        enableReordering && "group"
      )}
      onClick={() => header.column.getCanSort() && header.column.toggleSorting()}
      data-testid={`header-${header.id}`}
    >
      <div className="flex items-center gap-2">
        {enableReordering && (
          <div
            {...attributes}
            {...listeners}
            className="opacity-0 group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing"
            onClick={(e) => e.stopPropagation()}
          >
            <GripVertical className="h-3 w-3 text-muted-foreground" />
          </div>
        )}
        
        <div className="flex-1">
          {header.isPlaceholder
            ? null
            : flexRender(
                header.column.columnDef.header,
                header.getContext()
              )}
        </div>
        
        {header.column.getCanSort() && (
          <span className="text-muted-foreground text-xs">
            {header.column.getIsSorted() === "asc" ? "↑" : 
             header.column.getIsSorted() === "desc" ? "↓" : "↕"}
          </span>
        )}
      </div>
    </TableHead>
  );
}