import { useState, useRef, useCallback } from "react";
import { useOrganization } from "@/contexts/organization-context";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Building } from "lucide-react";

/**
 * Guard for creating TOP-LEVEL entities while the view is aggregated
 * ("Personal" org + "all organizations" scope). In that case there is no single
 * unambiguous target org, so we ask the user to pick one and switch the active
 * org to that choice before proceeding. Child entities inherit their parent's
 * org server-side and don't need this.
 *
 * Usage:
 *   const { ensureTargetOrg, dialog } = useTargetOrgGuard();
 *   // in a create handler:
 *   if (!(await ensureTargetOrg())) return; // user cancelled
 *   openCreateForm();
 *   // render {dialog} somewhere in the page
 */
export function useTargetOrgGuard() {
  const { organizations, isPersonalOrg, personalScope, switchOrganization } = useOrganization();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string>("");
  const resolverRef = useRef<((v: boolean) => void) | null>(null);

  const isAggregated = isPersonalOrg && personalScope === "all";

  const ensureTargetOrg = useCallback((): Promise<boolean> => {
    if (!isAggregated) return Promise.resolve(true);
    // Default selection: first non-Personal org if any, else Personal
    const def = organizations.find((o) => o.name !== "Personal") || organizations[0];
    setSelected(def?.id || "");
    setOpen(true);
    return new Promise<boolean>((resolve) => { resolverRef.current = resolve; });
  }, [isAggregated, organizations]);

  const confirm = () => {
    if (selected) switchOrganization(selected);
    setOpen(false);
    resolverRef.current?.(!!selected);
    resolverRef.current = null;
  };
  const cancel = () => {
    setOpen(false);
    resolverRef.current?.(false);
    resolverRef.current = null;
  };

  const dialog = (
    <Dialog open={open} onOpenChange={(o) => { if (!o) cancel(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building className="h-5 w-5 text-primary" />
            Seleziona organizzazione
          </DialogTitle>
          <DialogDescription>
            Stai visualizzando tutte le organizzazioni. Scegli in quale creare il nuovo elemento:
            l'organizzazione attiva verrà impostata su questa scelta.
          </DialogDescription>
        </DialogHeader>
        <Select value={selected} onValueChange={setSelected}>
          <SelectTrigger><SelectValue placeholder="Organizzazione" /></SelectTrigger>
          <SelectContent>
            {organizations.map((o) => (
              <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <DialogFooter>
          <Button variant="outline" onClick={cancel}>Annulla</Button>
          <Button onClick={confirm} disabled={!selected}>Continua</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  return { ensureTargetOrg, dialog, isAggregated };
}
