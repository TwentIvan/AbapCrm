import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

interface SapPasteJsonDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId?: string;
}

/**
 * Dialog riutilizzabile per incollare JSON di Transport Request SAP
 * Può essere usato sia dalla pagina SAP Transport che dalle azioni dei progetti
 */
export function SapPasteJsonDialog({ open, onOpenChange, projectId }: SapPasteJsonDialogProps) {
  const [jsonContent, setJsonContent] = useState("");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const pasteMutation = useMutation({
    mutationFn: async (jsonData: string) => {
      const response = await apiRequest("POST", "/api/sap-transport/paste", { 
        jsonData,
        projectId 
      });
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sap-transport"] });
      toast({
        title: "Transport Request importata",
        description: "Il JSON è stato processato e la Transport Request è stata creata con successo.",
      });
      setJsonContent("");
      onOpenChange(false);
    },
    onError: (error: any) => {
      toast({
        title: "Errore nell'importazione",
        description: error.message || "Si è verificato un errore durante l'elaborazione del JSON.",
        variant: "destructive",
      });
    },
  });

  const handlePaste = () => {
    if (!jsonContent.trim()) {
      toast({
        title: "Campo vuoto",
        description: "Inserisci il JSON della Transport Request prima di procedere.",
        variant: "destructive",
      });
      return;
    }

    pasteMutation.mutate(jsonContent);
  };

  const handleClose = () => {
    setJsonContent("");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle>Incolla JSON Transport Request SAP</DialogTitle>
          <DialogDescription>
            Incolla il JSON della transport request da importare. Il sistema validerà automaticamente il formato.
            {projectId && " La Transport Request sarà collegata automaticamente al progetto selezionato."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <Textarea
            placeholder='{"request_number": "DEVK900123", "description": "...", ...}'
            value={jsonContent}
            onChange={(e) => setJsonContent(e.target.value)}
            className="font-mono text-sm min-h-[400px]"
            data-testid="textarea-json-content"
          />
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Formato richiesto: JSON con campi request_number, description, owner
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={handleClose}
                data-testid="button-cancel-paste"
              >
                Annulla
              </Button>
              <Button
                onClick={handlePaste}
                disabled={pasteMutation.isPending || !jsonContent.trim()}
                className="bg-blue-600 hover:bg-blue-700"
                data-testid="button-import-json"
              >
                {pasteMutation.isPending ? "Importazione..." : "Importa"}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
