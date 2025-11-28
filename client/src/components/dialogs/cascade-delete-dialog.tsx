import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface RelationLabel {
  label: string;
  count: number;
}

interface CascadeDeleteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  itemCount: number;
  itemNames?: string[];
  relationLabels: RelationLabel[];
  onConfirm: () => void;
  onCancel: () => void;
  isDeleting: boolean;
  entityName: string;
  entityNamePlural: string;
}

export function CascadeDeleteDialog({
  open,
  onOpenChange,
  title,
  itemCount,
  itemNames,
  relationLabels,
  onConfirm,
  onCancel,
  isDeleting,
  entityName,
  entityNamePlural,
}: CascadeDeleteDialogProps) {
  const isSingle = itemCount === 1;
  
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="text-destructive">
            {title}
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3">
              <div>
                {isSingle ? (
                  <>Stai per eliminare "{itemNames?.[0]}".</>
                ) : (
                  <>Stai per eliminare {itemCount} {entityNamePlural.toLowerCase()}.</>
                )}
              </div>
              
              {relationLabels.length > 0 && (
                <div>
                  <div className="font-medium text-foreground mb-2">
                    Verranno eliminati anche i seguenti dati correlati:
                  </div>
                  <div className="space-y-1 ml-2">
                    {relationLabels.map((rel) => (
                      <div key={rel.label} className="text-sm">
                        - {rel.count} {rel.label}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              
              <div className="font-medium text-destructive">
                Questa azione non può essere annullata. Vuoi procedere?
              </div>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel 
            onClick={onCancel}
            data-testid="button-cancel-cascade-delete"
          >
            Annulla
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            disabled={isDeleting}
            data-testid="button-confirm-cascade-delete"
          >
            {isDeleting 
              ? "Eliminando..." 
              : isSingle 
                ? `Elimina ${entityName}` 
                : `Elimina ${itemCount} ${entityNamePlural}`
            }
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

interface SimpleDeleteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  itemCount: number;
  itemNames?: string[];
  onConfirm: () => void;
  onCancel: () => void;
  isDeleting: boolean;
  entityName: string;
  entityNamePlural: string;
}

export function SimpleDeleteDialog({
  open,
  onOpenChange,
  itemCount,
  itemNames,
  onConfirm,
  onCancel,
  isDeleting,
  entityName,
  entityNamePlural,
}: SimpleDeleteDialogProps) {
  const isSingle = itemCount === 1;
  
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Conferma Eliminazione</AlertDialogTitle>
          <AlertDialogDescription>
            {isSingle ? (
              <>Sei sicuro di voler eliminare "{itemNames?.[0]}"?</>
            ) : (
              <>Sei sicuro di voler eliminare {itemCount} {entityNamePlural.toLowerCase()} selezionati?</>
            )}
            {" "}Questa azione non può essere annullata.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel 
            onClick={onCancel}
            data-testid="button-cancel-delete"
          >
            Annulla
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            disabled={isDeleting}
            data-testid="button-confirm-delete"
          >
            {isDeleting 
              ? "Eliminando..." 
              : isSingle 
                ? `Elimina ${entityName}` 
                : `Elimina ${itemCount} ${entityNamePlural}`
            }
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
