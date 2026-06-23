import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import Sidebar from "@/components/layout/sidebar";
import Header from "@/components/layout/header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Globe, MoreHorizontal, Edit, Trash2, ExternalLink, Plus } from "lucide-react";
import { SapSystem } from "@shared/schema";
import WebLinkForm from "../components/forms/web-link-form";

export default function WebLinksPage() {
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [selectedLink, setSelectedLink] = useState<SapSystem | null>(null);
  const [selectedLinks, setSelectedLinks] = useState<string[]>([]);
  const [showBulkDeleteDialog, setShowBulkDeleteDialog] = useState(false);
  
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: allSystems, isLoading } = useQuery<SapSystem[]>({
    queryKey: ["/api/sap-systems"],
    queryFn: async () => {
      const res = await fetch("/api/sap-systems", { credentials: "include" });
      if (!res.ok) throw new Error('Failed to fetch systems');
      return res.json();
    },
  });

  const webLinks = useMemo(() => {
    return (allSystems || []).filter(s => s.connectionType === 'weblink');
  }, [allSystems]);

  const deleteMutation = useMutation({
    mutationFn: async (systemId: string) => {
      const response = await fetch(`/api/sap-systems/${systemId}`, {
        method: 'DELETE',
        credentials: 'include'
      });
      if (!response.ok) throw new Error('Failed to delete web link');
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sap-systems"] });
      toast({ title: "Collegamento eliminato", description: "Il collegamento web è stato eliminato con successo." });
      setShowDeleteDialog(false);
      setSelectedLink(null);
    },
    onError: () => {
      toast({ title: "Errore", description: "Impossibile eliminare il collegamento web.", variant: "destructive" });
    },
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: async (systemIds: string[]) => {
      const promises = systemIds.map(id => 
        fetch(`/api/sap-systems/${id}`, { method: 'DELETE', credentials: 'include' })
      );
      const responses = await Promise.all(promises);
      const failed = responses.filter(res => !res.ok);
      if (failed.length > 0) throw new Error(`Failed to delete ${failed.length} web link(s)`);
      return responses;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sap-systems"] });
      toast({ title: "Collegamenti eliminati", description: `${selectedLinks.length} collegamenti eliminati.` });
      setSelectedLinks([]);
      setShowBulkDeleteDialog(false);
    },
    onError: (error: any) => {
      toast({ title: "Errore", description: error.message, variant: "destructive" });
    },
  });

  const handleEdit = (link: SapSystem) => {
    setSelectedLink(link);
    setShowEditDialog(true);
  };

  const handleDelete = (link: SapSystem) => {
    setSelectedLink(link);
    setShowDeleteDialog(true);
  };

  const handleOpenLink = (link: SapSystem) => {
    if (link.webLink) window.open(link.webLink, '_blank');
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedLinks(webLinks.map(l => l.id));
    } else {
      setSelectedLinks([]);
    }
  };

  const handleSelectOne = (id: string, checked: boolean) => {
    if (checked) {
      setSelectedLinks(prev => [...prev, id]);
    } else {
      setSelectedLinks(prev => prev.filter(i => i !== id));
    }
  };

  return (
    <div className="flex h-screen bg-background">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header title="Collegamenti Web" subtitle="Gestisci i collegamenti web esterni" />
        <main className="flex-1 overflow-y-auto p-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Globe className="h-5 w-5 text-purple-600" />
                Collegamenti Web
              </CardTitle>
              <div className="flex items-center gap-2">
                {selectedLinks.length > 0 && (
                  <Button 
                    variant="destructive" 
                    size="sm"
                    onClick={() => setShowBulkDeleteDialog(true)}
                    data-testid="button-bulk-delete"
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Elimina ({selectedLinks.length})
                  </Button>
                )}
                <Button onClick={() => setShowCreateDialog(true)} data-testid="button-create-web-link">
                  <Plus className="h-4 w-4 mr-2" />
                  Nuovo Collegamento
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="space-y-2">
                  {[...Array(5)].map((_, i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : webLinks.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  Nessun collegamento web trovato. Clicca "Nuovo Collegamento" per aggiungerne uno.
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">
                        <Checkbox 
                          checked={selectedLinks.length === webLinks.length && webLinks.length > 0}
                          onCheckedChange={handleSelectAll}
                          data-testid="checkbox-select-all"
                        />
                      </TableHead>
                      <TableHead>Nome</TableHead>
                      <TableHead>URL</TableHead>
                      <TableHead>Descrizione</TableHead>
                      <TableHead className="w-12"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {webLinks.map((link) => (
                      <TableRow key={link.id} data-testid={`row-web-link-${link.id}`}>
                        <TableCell>
                          <Checkbox 
                            checked={selectedLinks.includes(link.id)}
                            onCheckedChange={(checked) => handleSelectOne(link.id, !!checked)}
                            data-testid={`checkbox-select-${link.id}`}
                          />
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Globe className="h-4 w-4 text-purple-600" />
                            <span className="font-medium">{link.name}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          {link.webLink ? (
                            <div className="flex items-center gap-2">
                              <a 
                                href={link.webLink} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="text-primary hover:underline truncate max-w-xs"
                                onClick={(e) => e.stopPropagation()}
                                data-testid={`link-url-${link.id}`}
                              >
                                {link.webLink}
                              </a>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 w-6 p-0"
                                onClick={() => handleOpenLink(link)}
                                data-testid={`button-open-link-${link.id}`}
                              >
                                <ExternalLink className="h-3 w-3" />
                              </Button>
                            </div>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <span className="text-muted-foreground text-sm truncate max-w-xs">
                            {link.description || "-"}
                          </span>
                        </TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="sm" className="h-8 w-8 p-0" data-testid={`button-actions-${link.id}`}>
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => handleOpenLink(link)} data-testid={`menu-open-${link.id}`}>
                                <ExternalLink className="h-4 w-4 mr-2" />
                                Apri Link
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleEdit(link)} data-testid={`menu-edit-${link.id}`}>
                                <Edit className="h-4 w-4 mr-2" />
                                Modifica
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleDelete(link)} className="text-destructive" data-testid={`menu-delete-${link.id}`}>
                                <Trash2 className="h-4 w-4 mr-2" />
                                Elimina
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </main>
      </div>

      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Nuovo Collegamento Web</DialogTitle>
          </DialogHeader>
          <WebLinkForm
            onSuccess={() => {
              queryClient.invalidateQueries({ queryKey: ["/api/sap-systems"] });
              setShowCreateDialog(false);
            }}
            onCancel={() => setShowCreateDialog(false)}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Modifica Collegamento Web</DialogTitle>
          </DialogHeader>
          {selectedLink && (
            <WebLinkForm
              editingLink={selectedLink}
              onSuccess={() => {
                queryClient.invalidateQueries({ queryKey: ["/api/sap-systems"] });
                setShowEditDialog(false);
                setSelectedLink(null);
              }}
              onCancel={() => {
                setShowEditDialog(false);
                setSelectedLink(null);
              }}
            />
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Conferma eliminazione</AlertDialogTitle>
            <AlertDialogDescription>
              Sei sicuro di voler eliminare il collegamento "{selectedLink?.name}"? Questa azione non può essere annullata.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">Annulla</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => selectedLink && deleteMutation.mutate(selectedLink.id)}
              className="bg-red-600 hover:bg-red-700"
              data-testid="button-confirm-delete"
            >
              Elimina
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showBulkDeleteDialog} onOpenChange={setShowBulkDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Conferma eliminazione multipla</AlertDialogTitle>
            <AlertDialogDescription>
              Sei sicuro di voler eliminare {selectedLinks.length} collegamenti web? Questa azione non può essere annullata.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-bulk-delete">Annulla</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => bulkDeleteMutation.mutate(selectedLinks)}
              className="bg-red-600 hover:bg-red-700"
              data-testid="button-confirm-bulk-delete"
            >
              Elimina {selectedLinks.length} collegamenti
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
