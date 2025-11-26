import { memo } from "react";
import { Badge } from "@/components/ui/badge";
import { useRelationshipPreview } from "@/components/ui/relationship-preview-context";

interface RelationshipItem {
  id: string;
  name: string;
}

interface RelationshipBadgeProps {
  count: number;
  label: string;
  items?: RelationshipItem[];
  targetPath: string;
  filterParam?: string;
  sourceId?: string;
  variant?: "default" | "secondary" | "outline" | "destructive";
  className?: string;
}

export const RelationshipBadge = memo(function RelationshipBadge({
  count,
  label,
  items = [],
  targetPath,
  filterParam,
  sourceId,
  variant = "secondary",
  className = "",
}: RelationshipBadgeProps) {
  const { openPreview } = useRelationshipPreview();

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    console.log("[RelationshipBadge] Click detected!", { label, count, items, openPreview: typeof openPreview });
    if (count > 0) {
      console.log("[RelationshipBadge] Opening preview...");
      openPreview({
        label,
        count,
        items,
        targetPath,
        filterParam,
        sourceId,
      });
    }
  };

  if (count === 0) {
    return (
      <Badge 
        variant="outline" 
        className={`text-muted-foreground cursor-default ${className}`}
        data-testid={`badge-${label.toLowerCase()}-0`}
      >
        -
      </Badge>
    );
  }

  return (
    <button
      type="button"
      className={`flex items-center justify-center w-8 h-8 rounded-full bg-primary text-primary-foreground font-semibold text-sm cursor-pointer hover:opacity-80 transition-opacity z-50 relative ${className}`}
      onClick={handleClick}
      onMouseDown={(e) => {
        console.log("[RelationshipBadge] MOUSE DOWN!", { label, count });
        e.stopPropagation();
      }}
      onPointerDown={(e) => {
        console.log("[RelationshipBadge] POINTER DOWN!", { label, count });
        e.stopPropagation();
      }}
      data-testid={`badge-${label.toLowerCase()}-${count}`}
      data-relationship-badge="true"
    >
      {count}
    </button>
  );
});
