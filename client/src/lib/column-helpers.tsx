import { Badge } from "@/components/ui/badge";
import { RelationshipBadge } from "@/components/ui/relationship-badge";
import { useEntityRelationships } from "@/hooks/use-entity-relationships";
import { useOrganization } from "@/contexts/organization-context";
import ImageContainer from "@/components/ui/image-container";
import type { ColumnDef } from "@tanstack/react-table";

/**
 * Creates a clickable text column that navigates to the related entity's detail.
 * Used for FK fields displayed as text (e.g., partner name in a project row).
 */
export function createLinkedColumn<T>(
  accessor: string,
  header: string,
  options: {
    navigate: (item: T) => void;
    getValue?: (item: T) => string;
  }
): ColumnDef<T, any> {
  return {
    accessorKey: accessor,
    header,
    cell: ({ row }) => {
      const value = options.getValue
        ? options.getValue(row.original)
        : (row.original as any)[accessor];
      if (!value) return <span className="text-muted-foreground">—</span>;
      return (
        <button
          type="button"
          className="text-primary hover:underline font-medium text-sm text-left"
          onClick={(e) => {
            e.stopPropagation();
            options.navigate(row.original);
          }}
        >
          {value}
        </button>
      );
    },
  };
}

/**
 * Creates a relationship count column (1:N badge).
 * Shows a circular badge with count; clicking opens the preview popup.
 */
export function createRelationshipColumn<T extends { id: string }>(
  header: string,
  options: {
    entityType: string;
    relationKey: string;
    targetPath: string;
    filterParam: string;
  }
): ColumnDef<T, any> {
  return {
    id: `rel_${options.relationKey}`,
    header,
    cell: ({ row }) => (
      <RelationshipCountCell
        entityType={options.entityType}
        entityId={row.original.id}
        relationKey={options.relationKey}
        label={header}
        targetPath={options.targetPath}
        filterParam={options.filterParam}
      />
    ),
    enableSorting: false,
  };
}

function RelationshipCountCell({
  entityType,
  entityId,
  relationKey,
  label,
  targetPath,
  filterParam,
}: {
  entityType: string;
  entityId: string;
  relationKey: string;
  label: string;
  targetPath: string;
  filterParam: string;
}) {
  const { currentOrganizationId } = useOrganization();
  const { data: relationships, isLoading } = useEntityRelationships(entityType, entityId);

  if (!currentOrganizationId || isLoading) {
    return <span className="text-sm text-muted-foreground">...</span>;
  }

  const rel = (relationships as any)?.[relationKey];
  const count = rel?.count || 0;

  return (
    <RelationshipBadge
      count={count}
      label={label}
      items={rel?.items || []}
      targetPath={targetPath}
      filterParam={filterParam}
      sourceId={entityId}
    />
  );
}

/**
 * Creates a status badge column with customizable colors.
 */
export function createStatusColumn<T>(
  accessor: string,
  header: string,
  colorMap: Record<string, string>,
  labelMap?: Record<string, string>
): ColumnDef<T, any> {
  return {
    accessorKey: accessor,
    header,
    cell: ({ row }) => {
      const value = (row.original as any)[accessor] as string;
      if (!value) return <span className="text-muted-foreground">—</span>;
      const colorClass = colorMap[value] || "bg-muted text-foreground";
      const label = labelMap?.[value] || value;
      return <Badge className={colorClass}>{label}</Badge>;
    },
  };
}

/**
 * Creates a date column with Italian formatting.
 */
export function createDateColumn<T>(
  accessor: string,
  header: string
): ColumnDef<T, any> {
  return {
    accessorKey: accessor,
    header,
    cell: ({ row }) => {
      const value = (row.original as any)[accessor];
      if (!value) return <span className="text-muted-foreground">—</span>;
      return new Date(value).toLocaleDateString("it-IT");
    },
  };
}

/**
 * Creates a currency column with Italian formatting.
 */
export function createCurrencyColumn<T>(
  accessor: string,
  header: string,
  currency = "EUR"
): ColumnDef<T, any> {
  return {
    accessorKey: accessor,
    header,
    cell: ({ row }) => {
      const value = (row.original as any)[accessor];
      if (value == null) return <span className="text-muted-foreground">—</span>;
      return new Intl.NumberFormat("it-IT", {
        style: "currency",
        currency,
      }).format(Number(value));
    },
  };
}

/**
 * Creates an image/logo column.
 */
export function createLogoColumn<T>(
  accessor: string,
  header: string,
  fallbackType: "logo" | "avatar" | "generic" = "logo"
): ColumnDef<T, any> {
  return {
    accessorKey: accessor,
    header,
    cell: ({ row }) => {
      const value = (row.original as any)[accessor] as string;
      return (
        <ImageContainer
          src={value}
          alt={`${header} for ${(row.original as any).name || "item"}`}
          fallbackType={fallbackType}
          size="md"
          containerClassName="border border-border"
        />
      );
    },
    enableSorting: false,
  };
}

/**
 * Creates a simple text column with optional truncation.
 */
export function createTextCol<T>(
  accessor: string,
  header: string,
  maxLength?: number
): ColumnDef<T, any> {
  return {
    accessorKey: accessor,
    header,
    cell: ({ row }) => {
      const value = (row.original as any)[accessor] as string;
      if (!value) return <span className="text-muted-foreground">—</span>;
      if (maxLength && value.length > maxLength) {
        return <span title={value}>{value.substring(0, maxLength)}...</span>;
      }
      return value;
    },
  };
}

/**
 * Creates an actions column with dropdown menu.
 */
export function createActionsColumn<T>(
  actions: Array<{
    label: string;
    icon?: React.ComponentType<{ className?: string }>;
    onClick: (item: T) => void;
    variant?: "default" | "destructive";
  }>
): ColumnDef<T, any> {
  return {
    id: "actions",
    header: "Azioni",
    cell: ({ row }) => (
      <div className="flex items-center gap-1">
        {actions.map((action, i) => (
          <button
            key={i}
            type="button"
            className={`p-1.5 rounded-md hover:bg-muted transition-colors ${
              action.variant === "destructive" ? "text-destructive hover:text-destructive" : "text-muted-foreground hover:text-foreground"
            }`}
            onClick={(e) => {
              e.stopPropagation();
              action.onClick(row.original);
            }}
          >
            {action.icon && <action.icon className="h-4 w-4" />}
          </button>
        ))}
      </div>
    ),
    enableSorting: false,
  };
}
