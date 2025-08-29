import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Save, Layout, ChevronDown, Edit, Trash2, Check, X } from "lucide-react";
import type { SavedLayout } from "@/lib/user-preferences";

interface LayoutManagerProps {
  currentLayoutName: string;
  savedLayouts: SavedLayout[];
  onLoadLayout: (layoutId: string) => void;
  onRenameLayout: (layoutId: string, newName: string) => void;
  onDeleteLayout: (layoutId: string) => void;
}

export function LayoutManager({
  currentLayoutName,
  savedLayouts,
  onLoadLayout,
  onRenameLayout,
  onDeleteLayout,
}: LayoutManagerProps) {
  console.log('🎯 LayoutManager received savedLayouts count:', savedLayouts.length);
  console.log('🎯 LayoutManager received layout names:', savedLayouts.map(l => l.name));
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [layoutToDelete, setLayoutToDelete] = useState<SavedLayout | null>(null);
  const [editingLayoutId, setEditingLayoutId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const { toast } = useToast();


  const handleRenameStart = (layout: SavedLayout) => {
    setEditingLayoutId(layout.id);
    setEditingName(layout.name);
  };

  const handleRenameConfirm = () => {
    if (!editingName.trim()) return;
    
    const layout = savedLayouts.find(l => l.id === editingLayoutId);
    
    if (layout) {
      onRenameLayout(layout.id, editingName.trim());
      toast({
        title: "Layout rinominato",
        description: `Layout rinominato in "${editingName.trim()}"`,
      });
    }
    
    setEditingLayoutId(null);
    setEditingName("");
  };

  const handleRenameCancel = () => {
    setEditingLayoutId(null);
    setEditingName("");
  };

  const handleDeleteStart = (layout: SavedLayout) => {
    setLayoutToDelete(layout);
    setShowDeleteDialog(true);
  };

  const handleDeleteConfirm = () => {
    if (layoutToDelete) {
      onDeleteLayout(layoutToDelete.id);
      toast({
        title: "Layout eliminato",
        description: `Layout "${layoutToDelete.name}" eliminato`,
      });
    }
    setShowDeleteDialog(false);
    setLayoutToDelete(null);
  };

  return (
    <div className="flex items-center space-x-2">
      {/* Current Layout Display */}
      <div className="flex items-center space-x-2">
        <Layout className="h-4 w-4 text-muted-foreground" />
        <Badge variant="outline" className="font-medium">
          {currentLayoutName}
        </Badge>
      </div>

      {/* Layout Selector */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button 
            variant="outline" 
            size="sm" 
            className="h-8"
            data-testid="button-layout-selector"
          >
            <ChevronDown className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          <div className="p-2">
            <Label className="text-xs font-medium text-muted-foreground">
              Layout Salvati ({savedLayouts.length})
            </Label>
          </div>
          <DropdownMenuSeparator />
          
          {savedLayouts.length === 0 ? (
            <div className="p-2 text-sm text-muted-foreground text-center">
              Nessun layout salvato
            </div>
          ) : (
            savedLayouts.map((layout, index) => (
              <div
                key={layout.id}
                className="flex items-center justify-between p-2 hover:bg-accent rounded-sm"
              >
                {editingLayoutId === layout.id ? (
                  <div className="flex items-center space-x-2 flex-1">
                    <Input
                      value={editingName}
                      onChange={(e) => setEditingName(e.target.value)}
                      className="h-6 text-sm"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleRenameConfirm();
                        if (e.key === 'Escape') handleRenameCancel();
                      }}
                      autoFocus
                      data-testid={`input-rename-layout-${index}`}
                    />
                    <Button 
                      size="sm" 
                      variant="ghost" 
                      className="h-6 w-6 p-0"
                      onClick={handleRenameConfirm}
                      data-testid={`button-confirm-rename-${index}`}
                    >
                      <Check className="h-3 w-3" />
                    </Button>
                    <Button 
                      size="sm" 
                      variant="ghost" 
                      className="h-6 w-6 p-0"
                      onClick={handleRenameCancel}
                      data-testid={`button-cancel-rename-${index}`}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                ) : (
                  <>
                    <div className="flex-1">
                      <button
                        onClick={() => onLoadLayout(layout.id)}
                        className="text-left hover:underline focus:underline text-sm font-medium"
                        data-testid={`button-load-layout-${index}`}
                      >
                        {layout.name}
                        {layout.name === currentLayoutName && (
                          <span className="ml-2 text-xs text-green-600">(corrente)</span>
                        )}
                        {layout.isDefault && (
                          <span className="ml-2 text-xs text-blue-600">(default)</span>
                        )}
                      </button>
                      <div className="text-xs text-muted-foreground">
                        {layout.updatedAt.toLocaleDateString()}
                      </div>
                    </div>
                    <div className="flex space-x-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 w-6 p-0"
                        onClick={() => handleRenameStart(layout)}
                        data-testid={`button-rename-layout-${index}`}
                      >
                        <Edit className="h-3 w-3" />
                      </Button>
                      {savedLayouts.length > 1 && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 w-6 p-0 text-destructive hover:text-destructive"
                          onClick={() => handleDeleteStart(layout)}
                          data-testid={`button-delete-layout-${index}`}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                  </>
                )}
              </div>
            ))
          )}
        </DropdownMenuContent>
      </DropdownMenu>


      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Elimina Layout</AlertDialogTitle>
            <AlertDialogDescription>
              Sei sicuro di voler eliminare il layout "{layoutToDelete?.name}"? 
              Questa azione non può essere annullata.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete-layout">
              Annulla
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete-layout"
            >
              Elimina
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}