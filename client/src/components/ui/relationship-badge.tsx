import { memo } from "react";
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
    <TooltipProvider delayDuration={200}>
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
        <TooltipContent side="bottom" sideOffset={8} className="max-w-[280px]">
          <div className="space-y-2">
            <div className="font-semibold">{label} ({count})</div>
            {items.length > 0 ? (
              <div className="space-y-1">
                {items.slice(0, 5).map((item) => (
                  <div key={item.id} className="text-muted-foreground truncate text-xs">
                    • {item.name}
                  </div>
                ))}
                {items.length > 5 && (
                  <div className="text-muted-foreground italic text-xs">
                    ... e altri {items.length - 5}
                  </div>
                )}
              </div>
            ) : (
              <div className="text-muted-foreground text-xs">{count} elementi</div>
            )}
            <div className="text-xs text-muted-foreground pt-1 border-t border-border">
              Click per vedere tutti
            </div>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
});
