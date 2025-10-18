import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { ExternalLink } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface RelationshipLinkProps {
  entityId: string | null | undefined;
  entityType: string; // "project", "partner", "task", etc.
  targetPath: string; // "/projects", "/partners", etc.
  label: string; // "Vai al progetto", "Vai al partner", etc.
  variant?: "default" | "ghost" | "outline";
  size?: "default" | "sm" | "icon";
  className?: string;
}

/**
 * RelationshipLink - Link per navigare a entità correlate (N:1) dai form
 * Mostra un'icona esterna che apre l'entità in modalità visualizzazione
 */
export function RelationshipLink({
  entityId,
  entityType,
  targetPath,
  label,
  variant = "ghost",
  size = "sm",
  className = "",
}: RelationshipLinkProps) {
  const [, setLocation] = useLocation();

  if (!entityId) {
    return null;
  }

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // Naviga con parametro readonly=true per aprire in modalità visualizzazione
    setLocation(`${targetPath}/${entityId}/edit?readonly=true`);
  };

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant={variant}
            size={size}
            onClick={handleClick}
            className={`h-9 px-2 ${className}`}
            data-testid={`link-${entityType}-${entityId}`}
          >
            <ExternalLink className="h-4 w-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="top" sideOffset={5}>
          <p className="text-sm">{label}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
