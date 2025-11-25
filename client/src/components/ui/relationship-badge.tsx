import { memo, useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { useLocation } from "wouter";
import { Badge } from "@/components/ui/badge";

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
  const [showTooltip, setShowTooltip] = useState(false);
  const [tooltipPosition, setTooltipPosition] = useState({ top: 0, left: 0 });
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (showTooltip && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setTooltipPosition({
        top: rect.bottom + 8,
        left: rect.left + rect.width / 2
      });
    }
  }, [showTooltip]);

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
    <>
      <button
        ref={buttonRef}
        type="button"
        className={`flex items-center justify-center w-8 h-8 rounded-full bg-primary text-primary-foreground font-semibold text-sm cursor-pointer hover:opacity-80 transition-opacity ${className}`}
        onClick={handleClick}
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
        data-testid={`badge-${label.toLowerCase()}-${count}`}
        data-relationship-badge="true"
      >
        {count}
      </button>
      
      {showTooltip && createPortal(
        <div 
          className="fixed z-[99999] min-w-[200px] max-w-[280px] bg-popover text-popover-foreground border border-border rounded-lg shadow-lg p-3 text-sm animate-in fade-in-0 zoom-in-95 duration-100"
          style={{ 
            top: tooltipPosition.top,
            left: tooltipPosition.left,
            transform: 'translateX(-50%)',
            pointerEvents: 'none'
          }}
          data-testid="relationship-tooltip"
        >
          <div className="font-semibold mb-2">{label} ({count})</div>
          {items.length > 0 ? (
            <div className="space-y-1">
              {items.slice(0, 5).map((item) => (
                <div key={item.id} className="text-muted-foreground truncate">
                  • {item.name}
                </div>
              ))}
              {items.length > 5 && (
                <div className="text-muted-foreground italic">
                  ... e altri {items.length - 5}
                </div>
              )}
            </div>
          ) : (
            <div className="text-muted-foreground">{count} elementi</div>
          )}
          <div className="text-xs text-muted-foreground mt-2 pt-2 border-t border-border">
            Click per vedere tutti
          </div>
          <div 
            className="absolute left-1/2 -translate-x-1/2 -top-2 w-0 h-0 border-l-8 border-r-8 border-b-8 border-l-transparent border-r-transparent border-b-border" 
          />
          <div 
            className="absolute left-1/2 -translate-x-1/2 -top-[7px] w-0 h-0 border-l-8 border-r-8 border-b-8 border-l-transparent border-r-transparent border-b-popover" 
          />
        </div>,
        document.body
      )}
    </>
  );
});
