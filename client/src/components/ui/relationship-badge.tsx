import { useState, useCallback, memo } from "react";
import { useLocation } from "wouter";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ExternalLink } from "lucide-react";

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

  const handleNavigate = useCallback(() => {
    setIsOpen(false);
    if (count > 0) {
      const path = filterParam && sourceId 
        ? `${targetPath}?${filterParam}=${sourceId}`
        : targetPath;
      setLocation(path);
    }
  }, [count, filterParam, sourceId, targetPath, setLocation]);

  const handleBadgeClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setIsOpen(true);
  }, []);

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
        className={`flex items-center justify-center w-8 h-8 rounded-full bg-primary text-primary-foreground font-semibold text-sm cursor-pointer hover:opacity-90 transition-opacity ${className}`}
        onClick={handleBadgeClick}
        data-testid={`badge-${label.toLowerCase()}-${count}`}
        data-relationship-badge="true"
        title={`Click per vedere ${label.toLowerCase()}`}
      >
        {count}
      </button>
      
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{label} ({count})</DialogTitle>
            <DialogDescription>
              Anteprima degli elementi collegati
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {items.slice(0, 10).map((item) => (
              <div
                key={item.id}
                className="text-sm text-muted-foreground hover:text-foreground transition-colors py-1 px-2 rounded hover:bg-muted"
              >
                • {item.name}
              </div>
            ))}
            {items.length > 10 && (
              <div className="text-sm text-muted-foreground italic pt-1">
                ... e altri {items.length - 10}
              </div>
            )}
            {items.length === 0 && (
              <div className="text-sm text-muted-foreground italic">
                Nessun dettaglio disponibile
              </div>
            )}
          </div>
          
          <div className="flex justify-end pt-4">
            <Button onClick={handleNavigate} variant="default" size="sm">
              <ExternalLink className="h-4 w-4 mr-2" />
              Vai a tutti i {label.toLowerCase()}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
});
