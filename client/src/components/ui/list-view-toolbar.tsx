import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { LayoutControlBox } from "@/components/ui/layout-control-box";
import { Plus, Copy, Edit, Trash2 } from "lucide-react";
import type { SavedLayout } from "@/lib/user-preferences";

interface ListViewToolbarProps {
  // Layout management
  currentLayoutName: string;
  savedLayouts: SavedLayout[];
  onLoadLayout: (layoutId: string) => void;
  onRenameLayout: (layoutId: string, newName: string) => void;
  onDeleteLayout: (layoutId: string) => void;
  onConfigureTable?: () => void;
  
  // View toggle (optional - for pages with multiple views)
  viewToggle?: ReactNode;
  
  // Action buttons (always visible, but can be disabled)
  onCreateNew?: () => void;
  onCopySelected?: () => void;
  onBulkEdit?: () => void;  // Modifica massiva
  onDeleteSelected?: () => void;
  
  // State
  hasSelection?: boolean;
  disableCreate?: boolean;
  disableCopy?: boolean;
  disableBulkEdit?: boolean;
  disableDelete?: boolean;
}

export function ListViewToolbar({
  currentLayoutName,
  savedLayouts,
  onLoadLayout,
  onRenameLayout,
  onDeleteLayout,
  onConfigureTable,
  viewToggle,
  onCreateNew,
  onCopySelected,
  onBulkEdit,
  onDeleteSelected,
  hasSelection = false,
  disableCreate = false,
  disableCopy = false,
  disableBulkEdit = false,
  disableDelete = false,
}: ListViewToolbarProps) {
  return (
    <div className="flex items-center justify-between gap-4 mb-4">
      {/* Left: Layout Control Box + View Toggle */}
      <div className="flex items-center gap-3">
        <LayoutControlBox
          currentLayoutName={currentLayoutName}
          savedLayouts={savedLayouts}
          onLoadLayout={onLoadLayout}
          onRenameLayout={onRenameLayout}
          onDeleteLayout={onDeleteLayout}
          onConfigureTable={onConfigureTable}
        />
        {viewToggle && <div>{viewToggle}</div>}
      </div>
      
      {/* Right: Action Buttons (sempre presenti) */}
      <div className="flex items-center gap-2">
        {/* Crea */}
        {onCreateNew && (
          <Button
            variant="default"
            size="sm"
            onClick={onCreateNew}
            disabled={disableCreate}
            className="h-9"
            data-testid="button-create-new"
          >
            <Plus className="h-4 w-4" />
          </Button>
        )}
        
        {/* Copia */}
        {onCopySelected && (
          <Button
            variant="outline"
            size="sm"
            onClick={onCopySelected}
            disabled={!hasSelection || disableCopy}
            className={`h-9 ${hasSelection && !disableCopy ? 'bg-blue-50 text-blue-700 border-blue-300 hover:bg-blue-100 dark:bg-blue-950 dark:text-blue-400 dark:border-blue-800' : ''}`}
            data-testid="button-copy-selected"
          >
            <Copy className="h-4 w-4" />
          </Button>
        )}
        
        {/* Modifica Massiva */}
        {onBulkEdit && (
          <Button
            variant="outline"
            size="sm"
            onClick={onBulkEdit}
            disabled={!hasSelection || disableBulkEdit}
            className={`h-9 ${hasSelection && !disableBulkEdit ? 'bg-yellow-50 text-yellow-700 border-yellow-300 hover:bg-yellow-100 dark:bg-yellow-950 dark:text-yellow-400 dark:border-yellow-800' : ''}`}
            data-testid="button-bulk-edit"
          >
            <Edit className="h-4 w-4" />
          </Button>
        )}
        
        {/* Elimina */}
        {onDeleteSelected && (
          <Button
            variant="outline"
            size="sm"
            onClick={onDeleteSelected}
            disabled={!hasSelection || disableDelete}
            className={`h-9 ${hasSelection && !disableDelete ? 'bg-red-50 text-red-700 border-red-300 hover:bg-red-100 dark:bg-red-950 dark:text-red-400 dark:border-red-800' : ''}`}
            data-testid="button-delete-selected"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
}
