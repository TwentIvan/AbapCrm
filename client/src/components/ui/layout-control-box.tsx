import { useState } from "react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Table, ChevronDown, Settings, Layout } from "lucide-react";
import type { SavedLayout } from "@/lib/user-preferences";

interface LayoutControlBoxProps {
  currentLayoutName: string;
  savedLayouts: SavedLayout[];
  onLoadLayout: (layoutId: string) => void;
  onRenameLayout: (layoutId: string, newName: string) => void;
  onDeleteLayout: (layoutId: string) => void;
  onConfigureTable?: () => void;
}

export function LayoutControlBox({
  currentLayoutName,
  savedLayouts,
  onLoadLayout,
  onRenameLayout,
  onDeleteLayout,
  onConfigureTable,
}: LayoutControlBoxProps) {
  const [hoveredSection, setHoveredSection] = useState<string | null>(null);

  return (
    <div 
      className={`flex items-center px-3 py-2 rounded-full transition-colors border ${
        hoveredSection ? 'bg-muted/50' : 'bg-muted/30'
      } border-muted`}
      style={{ minWidth: '280px' }}
      onMouseEnter={() => setHoveredSection('main')}
      onMouseLeave={() => setHoveredSection(null)}
    >
      {/* Icona Tabella */}
      <Table className="h-6 w-6 flex-shrink-0 mr-3 text-muted-foreground" />
      
      {/* Nome Layout Corrente */}
      <span className="text-base font-medium flex-1 mr-3 text-muted-foreground">
        {currentLayoutName}
      </span>
      
      {/* Selezione Layout */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button 
            variant="ghost" 
            size="sm" 
            className="p-1 h-8 w-8 rounded-full hover:bg-muted/50"
            data-testid="button-layout-selector"
          >
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          {savedLayouts.map((layout) => (
            <DropdownMenuItem
              key={layout.id}
              onClick={() => onLoadLayout(layout.id)}
              className={currentLayoutName === layout.name ? "bg-muted/50" : ""}
              data-testid={`layout-option-${layout.id}`}
            >
              <Layout className="mr-2 h-4 w-4" />
              {layout.name}
              {layout.isDefault && (
                <span className="ml-auto text-xs text-muted-foreground">(Default)</span>
              )}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      
      {/* Configurazione Tabella */}
      {onConfigureTable && (
        <Button 
          variant="ghost" 
          size="sm" 
          onClick={onConfigureTable}
          className="p-1 h-8 w-8 rounded-full hover:bg-muted/50 ml-1"
          data-testid="button-configure-table"
        >
          <Settings className="h-4 w-4 text-muted-foreground" />
        </Button>
      )}
    </div>
  );
}