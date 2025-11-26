import { memo } from "react";
import { useLocation } from "wouter";
import { Badge } from "@/components/ui/badge";

interface RelationshipBadgeProps {
  count: number;
  label: string;
  targetPath: string;
  filterParam?: string;
  sourceId?: string;
  variant?: "default" | "secondary" | "outline" | "destructive";
  className?: string;
}

export const RelationshipBadge = memo(function RelationshipBadge({
  count,
  label,
  targetPath,
  filterParam,
  sourceId,
  variant = "secondary",
  className = "",
}: RelationshipBadgeProps) {
  const [, setLocation] = useLocation();

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (count > 0 && filterParam && sourceId) {
      setLocation(`${targetPath}?${filterParam}=${sourceId}`);
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
      className={`flex items-center justify-center w-8 h-8 rounded-full bg-primary text-primary-foreground font-semibold text-sm cursor-pointer hover:opacity-80 transition-opacity ${className}`}
      onClick={handleClick}
      data-testid={`badge-${label.toLowerCase()}-${count}`}
      title={`${label}: ${count}`}
    >
      {count}
    </button>
  );
});
