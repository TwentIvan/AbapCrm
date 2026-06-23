import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Edit2 } from "lucide-react";

export interface BulkEditField {
  key: string;
  label: string;
  type: 'text' | 'select' | 'date' | 'number';
  options?: Array<{ value: string; label: string }>;
  placeholder?: string;
}

interface BulkEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  fields: BulkEditField[];
  selectedCount: number;
  onSave: (updates: Record<string, any>) => void;
  isPending?: boolean;
}

export function BulkEditDialog({
  open,
  onOpenChange,
  title,
  description,
  fields,
  selectedCount,
  onSave,
  isPending = false,
}: BulkEditDialogProps) {
  const [enabledFields, setEnabledFields] = useState<Record<string, boolean>>({});
  const [values, setValues] = useState<Record<string, any>>({});

  useEffect(() => {
    if (!open) {
      setEnabledFields({});
      setValues({});
    }
  }, [open]);

  const handleToggleField = (fieldKey: string, enabled: boolean) => {
    setEnabledFields(prev => ({ ...prev, [fieldKey]: enabled }));
    if (!enabled) {
      const newValues = { ...values };
      delete newValues[fieldKey];
      setValues(newValues);
    }
  };

  const handleValueChange = (fieldKey: string, value: any) => {
    setValues(prev => ({ ...prev, [fieldKey]: value }));
  };

  const handleSave = () => {
    const updates: Record<string, any> = {};
    Object.keys(enabledFields).forEach(key => {
      if (enabledFields[key] && values[key] !== undefined) {
        updates[key] = values[key];
      }
    });

    if (Object.keys(updates).length === 0) {
      return;
    }

    onSave(updates);
  };

  const handleClose = () => {
    setEnabledFields({});
    setValues({});
    onOpenChange(false);
  };

  const hasEnabledFields = Object.values(enabledFields).some(v => v);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Edit2 className="h-5 w-5" />
            {title}
          </DialogTitle>
          <DialogDescription>
            {description}
            <span className="font-semibold"> {selectedCount} elemento{selectedCount > 1 ? 'i' : ''} selezionat{selectedCount > 1 ? 'i' : 'o'}.</span>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <p className="text-sm text-muted-foreground">
            Seleziona i campi da modificare e imposta i nuovi valori. Solo i campi selezionati verranno aggiornati.
          </p>

          {fields.map((field) => (
            <div key={field.key} className="space-y-2 p-3 border rounded-lg bg-muted/30">
              <div className="flex items-center gap-2">
                <Checkbox
                  id={`enable-${field.key}`}
                  checked={enabledFields[field.key] || false}
                  onCheckedChange={(checked) => handleToggleField(field.key, checked as boolean)}
                  data-testid={`checkbox-enable-${field.key}`}
                />
                <Label
                  htmlFor={`enable-${field.key}`}
                  className="font-medium cursor-pointer"
                >
                  {field.label}
                </Label>
              </div>

              {enabledFields[field.key] && (
                <div className="ml-6">
                  {field.type === 'select' && field.options ? (
                    <Select
                      value={values[field.key] || ""}
                      onValueChange={(value) => handleValueChange(field.key, value)}
                    >
                      <SelectTrigger data-testid={`select-${field.key}`}>
                        <SelectValue placeholder={field.placeholder || `Seleziona ${field.label.toLowerCase()}`} />
                      </SelectTrigger>
                      <SelectContent>
                        {field.options.map((option) => (
                          <SelectItem 
                            key={option.value} 
                            value={option.value}
                            data-testid={`option-${field.key}-${option.value}`}
                          >
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : field.type === 'date' ? (
                    <Input
                      type="date"
                      value={values[field.key] || ""}
                      onChange={(e) => handleValueChange(field.key, e.target.value)}
                      data-testid={`input-${field.key}`}
                    />
                  ) : field.type === 'number' ? (
                    <Input
                      type="number"
                      value={values[field.key] || ""}
                      onChange={(e) => handleValueChange(field.key, e.target.value)}
                      placeholder={field.placeholder}
                      data-testid={`input-${field.key}`}
                    />
                  ) : (
                    <Input
                      type="text"
                      value={values[field.key] || ""}
                      onChange={(e) => handleValueChange(field.key, e.target.value)}
                      placeholder={field.placeholder}
                      data-testid={`input-${field.key}`}
                    />
                  )}
                </div>
              )}
            </div>
          ))}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={handleClose}
            disabled={isPending}
            data-testid="button-cancel-bulk-edit"
          >
            Annulla
          </Button>
          <Button
            onClick={handleSave}
            disabled={isPending || !hasEnabledFields}
            className="bg-primary hover:bg-primary/90"
            data-testid="button-save-bulk-edit"
          >
            {isPending ? "Salvataggio..." : `Aggiorna ${selectedCount} elemento${selectedCount > 1 ? 'i' : ''}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
