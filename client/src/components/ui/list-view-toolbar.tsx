import { Button } from "@/components/ui/button";
import { LayoutControlBox } from "@/components/ui/layout-control-box";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Plus, Copy, Trash2, Table, Grid3X3, Calendar as CalendarIcon, BarChart3 } from "lucide-react";
import type { SavedLayout } from "@/lib/user-preferences";

export type ViewMode = "table" | "grid" | "kanban" | "calendar" | "gantt" | "tree";

interface ListViewToolbarProps {
  // Layout management
  currentLayoutName: string;
  savedLayouts: SavedLayout[];
  onLoadLayout: (layoutId: string) => void;
  onRenameLayout: (layoutId: string, newName: string) => void;
  onDeleteLayout: (layoutId: string) => void;
  onConfigureTable?: () => void;
  
  // View toggle (optional - only show if multiple views available)
  viewMode?: ViewMode;
  availableViews?: ViewMode[];
  onViewModeChange?: (mode: ViewMode) => void;
  
  // Action buttons
  onCreateNew?: () => void;
  onCopySelected?: () => void;
  onDeleteSelected?: () => void;
  
  // State
  hasSelection?: boolean;
  disableActions?: boolean;
}

const viewIcons: Record<ViewMode, typeof Table> = {
  table: Table,
  grid: Grid3X3,
  kanban: BarChart3,
  calendar: CalendarIcon,
  gantt: BarChart3,
  tree: BarChart3,
};

const viewLabels: Record<ViewMode, string> = {
  table: "Tabella",
  grid: "Griglia",
  kanban: "Kanban",
  calendar: "Calendario",
  gantt: "Gantt",
  tree: "Albero",
};

export function ListViewToolbar({
  currentLayoutName,
  savedLayouts,
  onLoadLayout,
  onRenameLayout,
  onDeleteLayout,
  onConfigureTable,
  viewMode,
  availableViews = [],
  onViewModeChange,
  onCreateNew,
  onCopySelected,
  onDeleteSelected,
  hasSelection = false,
  disableActions = false,
}: ListViewToolbarProps) {
  const showViewToggle = availableViews.length > 1 && viewMode && onViewModeChange;
  
  return (
    <div className="flex items-center justify-between gap-4 mb-4">
      {/* Left: Layout Control Box */}
      <div className="flex items-center gap-3">
        <LayoutControlBox
          currentLayoutName={currentLayoutName}
          savedLayouts={savedLayouts}
          onLoadLayout={onLoadLayout}
          onRenameLayout={onRenameLayout}
          onDeleteLayout={onDeleteLayout}
          onConfigureTable={onConfigureTable}
        />
        
        {/* View Mode Toggle (if multiple views) */}
        {showViewToggle && (
          <ToggleGroup
            type="single"
            value={viewMode}
            onValueChange={(value) => {
              if (value) onViewModeChange(value as ViewMode);
            }}
            className="border rounded-md p-1"
            data-testid="view-mode-toggle"
          >
            {availableViews.map((mode) => {
              const Icon = viewIcons[mode];
              return (
                <ToggleGroupItem
                  key={mode}
                  value={mode}
                  aria-label={viewLabels[mode]}
                  data-testid={`view-mode-${mode}`}
                  className="px-3"
                >
                  <Icon className="h-4 w-4" />
                </ToggleGroupItem>
              );
            })}
          </ToggleGroup>
        )}
      </div>
      
      {/* Right: Action Buttons */}
      <div className="flex items-center gap-2">
        {onCreateNew && (
          <Button
            variant="default"
            size="icon"
            onClick={onCreateNew}
            disabled={disableActions}
            data-testid="button-create-new"
            className="h-9 w-9"
          >
            <Plus className="h-5 w-5" />
          </Button>
        )}
        
        {onCopySelected && (
          <Button
            variant="outline"
            size="icon"
            onClick={onCopySelected}
            disabled={!hasSelection || disableActions}
            data-testid="button-copy-selected"
            className="h-9 w-9"
          >
            <Copy className="h-4 w-4" />
          </Button>
        )}
        
        {onDeleteSelected && (
          <Button
            variant="outline"
            size="icon"
            onClick={onDeleteSelected}
            disabled={!hasSelection || disableActions}
            data-testid="button-delete-selected"
            className="h-9 w-9 text-red-600 hover:text-red-700 hover:bg-red-50"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
}
