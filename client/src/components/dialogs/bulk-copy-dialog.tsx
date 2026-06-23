import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Copy } from "lucide-react";

interface BulkCopyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  selectedCount: number;
  onCopy: (options: { addSuffix: boolean; suffix: string }) => void;
  isPending?: boolean;
}

export function BulkCopyDialog({
  open,
  onOpenChange,
  title,
  description,
  selectedCount,
  onCopy,
  isPending = false,
}: BulkCopyDialogProps) {
  const [addSuffix, setAddSuffix] = useState(true);
  const [suffix, setSuffix] = useState(" - Copia");

  useEffect(() => {
    if (!open) {
      setAddSuffix(true);
      setSuffix(" - Copia");
    }
  }, [open]);

  const handleCopy = () => {
    onCopy({ addSuffix, suffix });
  };

  const handleClose = () => {
    setAddSuffix(true);
    setSuffix(" - Copia");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Copy className="h-5 w-5" />
            {title}
          </DialogTitle>
          <DialogDescription>
            {description}
            <span className="font-semibold"> {selectedCount} elemento{selectedCount > 1 ? 'i' : ''} selezionat{selectedCount > 1 ? 'i' : 'o'}.</span>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <p className="text-sm text-muted-foreground">
            Verranno create {selectedCount} cop{selectedCount > 1 ? 'ie' : 'ia'} {selectedCount > 1 ? 'degli elementi selezionati' : "dell'elemento selezionato"}.
          </p>

          <div className="space-y-3 p-3 border rounded-lg bg-muted/30">
            <div className="flex items-center gap-2">
              <Checkbox
                id="add-suffix"
                checked={addSuffix}
                onCheckedChange={(checked) => setAddSuffix(checked as boolean)}
                data-testid="checkbox-add-suffix"
              />
              <Label
                htmlFor="add-suffix"
                className="font-medium cursor-pointer"
              >
                Aggiungi suffisso al nome
              </Label>
            </div>

            {addSuffix && (
              <div className="ml-6">
                <Label htmlFor="suffix" className="text-sm text-muted-foreground">
                  Suffisso
                </Label>
                <Input
                  id="suffix"
                  type="text"
                  value={suffix}
                  onChange={(e) => setSuffix(e.target.value)}
                  placeholder="es. - Copia"
                  data-testid="input-suffix"
                  className="mt-1"
                />
              </div>
            )}
          </div>

          <div className="text-xs text-muted-foreground bg-primary/5 p-3 rounded border border-primary/20">
            <strong>Nota:</strong> Le copie manterranno tutti i dati degli originali ad eccezione degli ID e delle date di creazione/aggiornamento che verranno generati automaticamente.
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={handleClose}
            disabled={isPending}
            data-testid="button-cancel-bulk-copy"
          >
            Annulla
          </Button>
          <Button
            onClick={handleCopy}
            disabled={isPending}
            className="bg-success hover:bg-success/90"
            data-testid="button-confirm-bulk-copy"
          >
            {isPending ? "Copiando..." : `Copia ${selectedCount} elemento${selectedCount > 1 ? 'i' : ''}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
