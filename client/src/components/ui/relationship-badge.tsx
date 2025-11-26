import { memo, useState } from "react";
import { useLocation } from "wouter";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

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

  const handleNavigate = () => {
    setIsOpen(false);
    if (count > 0) {
      const path = filterParam && sourceId 
        ? `${targetPath}?${filterParam}=${sourceId}`
        : targetPath;
      setLocation(path);
    }
  };

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (count > 0) {
      setIsOpen(true);
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
        type="button"
        className={`flex items-center justify-center w-8 h-8 rounded-full bg-primary text-primary-foreground font-semibold text-sm cursor-pointer hover:opacity-80 transition-opacity ${className}`}
        onClick={handleClick}
        data-testid={`badge-${label.toLowerCase()}-${count}`}
        data-relationship-badge="true"
      >
        {count}
      </button>
      
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="sm:max-w-md" onClick={(e) => e.stopPropagation()}>
          <DialogHeader>
            <DialogTitle>{label} ({count})</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 py-4">
            {items.length > 0 ? (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {items.map((item) => (
                  <div key={item.id} className="text-sm p-2 bg-muted rounded">
                    {item.name}
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-muted-foreground text-sm">{count} elementi collegati</div>
            )}
          </div>
          <div className="flex justify-end">
            <Button onClick={handleNavigate} data-testid={`btn-view-all-${label.toLowerCase()}`}>
              Vedi tutti →
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
});
