import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ChevronDown, Settings, Layout, Pencil, Trash2 } from "lucide-react";
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
  const handleRename = (layout: SavedLayout) => {
    const newName = prompt(`Rinomina layout "${layout.name}":`, layout.name);
    if (newName && newName.trim() && newName !== layout.name) {
      onRenameLayout(layout.id, newName.trim());
    }
  };

  const handleDelete = (layout: SavedLayout) => {
    if (confirm(`Eliminare il layout "${layout.name}"?`)) {
      onDeleteLayout(layout.id);
    }
  };

  return (
    <div className="flex items-center gap-3 h-10 bg-sidebar-accent px-4 rounded-md">
      {/* Nome Layout Attivo */}
      <span className="text-sm font-medium text-sidebar-foreground">
        {currentLayoutName}
      </span>
      
      {/* Combo Selezione Layout */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button 
            variant="ghost" 
            size="sm" 
            className="h-8 gap-2 text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            data-testid="button-layout-selector"
          >
            <Layout className="h-4 w-4" />
            <ChevronDown className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-64">
          {savedLayouts.map((layout) => (
            <div key={layout.id} className="group flex items-center">
              <DropdownMenuItem
                onClick={() => onLoadLayout(layout.id)}
                className={`flex-1 ${currentLayoutName === layout.name ? "bg-primary/10" : ""}`}
                data-testid={`layout-option-${layout.id}`}
              >
                <Layout className="mr-2 h-4 w-4" />
                {layout.name}
                {layout.isDefault && (
                  <span className="ml-auto text-xs text-muted-foreground">(Default)</span>
                )}
              </DropdownMenuItem>
              <div className="flex gap-1 px-2 opacity-0 group-hover:opacity-100 transition-opacity">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleRename(layout);
                  }}
                  data-testid={`button-rename-${layout.id}`}
                >
                  <Pencil className="h-3 w-3" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0 text-red-600 hover:text-red-700"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDelete(layout);
                  }}
                  data-testid={`button-delete-${layout.id}`}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            </div>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      
      {/* Tasto Configura BLU */}
      {onConfigureTable && (
        <Button 
          variant="default" 
          size="sm" 
          onClick={onConfigureTable}
          className="h-8 gap-2 bg-blue-600 hover:bg-blue-700 text-white"
          data-testid="button-configure-table"
        >
          <Settings className="h-4 w-4" />
          Configura
        </Button>
      )}
    </div>
  );
}
