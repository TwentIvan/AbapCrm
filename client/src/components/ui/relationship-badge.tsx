import { memo, useMemo } from "react";
import { useLocation } from "wouter";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

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
  const [, setLocation] = useLocation();

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    
    if (count > 0) {
      const path = filterParam && sourceId 
        ? `${targetPath}?${filterParam}=${sourceId}`
        : targetPath;
      setLocation(path);
    }
  };

  const tooltipContent = useMemo(() => {
    if (items.length === 0) {
      return `${label}: ${count} elementi - Click per vedere`;
    }
    const itemsList = items.slice(0, 5).map(item => `• ${item.name}`).join('\n');
    const more = items.length > 5 ? `\n... e altri ${items.length - 5}` : '';
    return `${label} (${count}):\n${itemsList}${more}\n\nClick per vedere tutti`;
  }, [label, count, items]);

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
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            className={`flex items-center justify-center w-8 h-8 rounded-full bg-primary text-primary-foreground font-semibold text-sm cursor-pointer hover:opacity-80 transition-opacity ${className}`}
            onClick={handleClick}
            data-testid={`badge-${label.toLowerCase()}-${count}`}
            data-relationship-badge="true"
          >
            {count}
          </button>
        </TooltipTrigger>
        <TooltipContent 
          side="bottom" 
          align="center"
          className="max-w-xs whitespace-pre-line text-left"
        >
          {tooltipContent}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
});
