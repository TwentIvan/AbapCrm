import { memo, useState } from "react";
import { useLocation } from "wouter";
import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

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
  const [isOpen, setIsOpen] = useState(false);

  const handleNavigate = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setIsOpen(false);
    
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
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={`flex items-center justify-center w-8 h-8 rounded-full bg-primary text-primary-foreground font-semibold text-sm cursor-pointer hover:opacity-80 transition-opacity ${className}`}
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
          }}
          data-testid={`badge-${label.toLowerCase()}-${count}`}
        >
          {count}
        </button>
      </PopoverTrigger>
      <PopoverContent 
        side="bottom" 
        align="center"
        sideOffset={8} 
        className="w-64 p-3"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="space-y-2">
          <div className="font-semibold text-sm">{label} ({count})</div>
          {items.length > 0 ? (
            <div className="space-y-1 max-h-32 overflow-y-auto">
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
          <button
            type="button"
            className="w-full mt-2 px-3 py-1.5 text-xs font-medium bg-primary text-primary-foreground rounded hover:opacity-90 transition-opacity"
            onClick={handleNavigate}
            data-testid={`btn-view-all-${label.toLowerCase()}`}
          >
            Vedi tutti →
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
});
