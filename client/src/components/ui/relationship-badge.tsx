import { useState } from "react";
import { useLocation } from "wouter";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ChevronRight } from "lucide-react";

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

export function RelationshipBadge({
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
  const [isTooltipOpen, setIsTooltipOpen] = useState(false);

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    
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
      <Tooltip open={isTooltipOpen} onOpenChange={setIsTooltipOpen}>
        <TooltipTrigger asChild>
          <Badge
            variant={variant}
            className={`cursor-pointer hover:opacity-80 transition-opacity group ${className}`}
            onClick={handleClick}
            onMouseEnter={() => setIsTooltipOpen(true)}
            onMouseLeave={() => setIsTooltipOpen(false)}
            data-testid={`badge-${label.toLowerCase()}-${count}`}
          >
            {count}
            <ChevronRight className="ml-1 h-3 w-3 opacity-60 group-hover:opacity-100 transition-opacity" />
          </Badge>
        </TooltipTrigger>
        <TooltipContent 
          side="bottom" 
          className="max-w-xs p-3 bg-card dark:bg-card"
          sideOffset={5}
        >
          <div className="space-y-1">
            <p className="text-sm font-semibold text-foreground mb-2">
              {label} ({count})
            </p>
            <div className="max-h-48 overflow-y-auto space-y-1">
              {items.slice(0, 10).map((item) => (
                <div
                  key={item.id}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors py-0.5"
                >
                  • {item.name}
                </div>
              ))}
              {items.length > 10 && (
                <div className="text-xs text-muted-foreground italic pt-1">
                  ... e altri {items.length - 10}
                </div>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-2 pt-2 border-t border-border">
              Click per vedere tutti
            </p>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
