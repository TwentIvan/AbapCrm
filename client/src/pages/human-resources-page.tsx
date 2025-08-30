import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { HumanResourceForm } from "@/components/forms/human-resource-form";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { HumanResource } from "@shared/schema";
import { Users, Plus, Search, Edit, Trash2, DollarSign, Calendar, User as UserIcon } from "lucide-react";

export function HumanResourcesPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedResource, setSelectedResource] = useState<HumanResource | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: resources = [], isLoading } = useQuery<HumanResource[]>({
    queryKey: ["/api/human-resources"],
    staleTime: 5 * 60 * 1000,
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/human-resources/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/human-resources"] });
      toast({
        title: "Successo",
        description: "Risorsa eliminata con successo",
      });
    },
    onError: () => {
      toast({
        title: "Errore",
        description: "Errore durante l'eliminazione della risorsa",
        variant: "destructive",
      });
    }
  });

  const filteredResources = resources.filter(resource => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return resource.name.toLowerCase().includes(term) ||
           resource.role.toLowerCase().includes(term) ||
           resource.skillLevel.toLowerCase().includes(term) ||
           (resource.department && resource.department.toLowerCase().includes(term));
  });

  const handleEdit = (resource: HumanResource) => {
    setSelectedResource(resource);
    setIsFormOpen(true);
  };

  const handleCreate = () => {
    setSelectedResource(null);
    setIsFormOpen(true);
  };

  const handleFormSuccess = () => {
    setIsFormOpen(false);
    setSelectedResource(null);
  };

  const getSkillLevelColor = (level: string) => {
    switch (level) {
      case 'junior': return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300';
      case 'mid': return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300';
      case 'senior': return 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300';
      case 'lead': return 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300';
      case 'principal': return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300';
      default: return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300';
    }
  };

  const getRoleIcon = (role: string) => {
    switch (role) {
      case 'developer': return '💻';
      case 'analyst': return '📊';
      case 'consultant': return '🧑‍💼';
      case 'designer': return '🎨';
      case 'manager': return '👔';
      case 'architect': return '🏗️';
      case 'tester': return '🧪';
      default: return '👤';
    }
  };

  // Statistiche
  const stats = {
    total: resources.length,
    active: resources.filter(r => r.isActive).length,
    avgRate: resources.length > 0 
      ? (resources.reduce((sum, r) => sum + (r.baseHourlyRate ? parseFloat(r.baseHourlyRate) : 0), 0) / resources.filter(r => r.baseHourlyRate).length).toFixed(2)
      : '0.00'
  };

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded w-1/3 mb-6"></div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-24 bg-gray-200 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Users className="h-6 w-6" />
            Risorse Umane
          </h1>
          <p className="text-muted-foreground">
            Gestisci le risorse umane e collega gli utenti alle attività
          </p>
        </div>
        <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
          <DialogTrigger asChild>
            <Button onClick={handleCreate} data-testid="button-add-resource">
              <Plus className="h-4 w-4 mr-2" />
              Aggiungi Risorsa
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {selectedResource ? "Modifica Risorsa" : "Nuova Risorsa"}
              </DialogTitle>
            </DialogHeader>
            <HumanResourceForm
              humanResource={selectedResource || undefined}
              onSuccess={handleFormSuccess}
            />
          </DialogContent>
        </Dialog>
      </div>

      {/* Statistiche */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Totale Risorse</p>
                <p className="text-2xl font-bold">{stats.total}</p>
              </div>
              <Users className="h-8 w-8 text-blue-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Risorse Attive</p>
                <p className="text-2xl font-bold text-green-600">{stats.active}</p>
              </div>
              <UserIcon className="h-8 w-8 text-green-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Tariffa Media</p>
                <p className="text-2xl font-bold">€{stats.avgRate}</p>
              </div>
              <DollarSign className="h-8 w-8 text-orange-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Ricerca */}
      <Card>
        <CardContent className="p-4">
          <div className="relative">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Cerca per nome, ruolo, livello o dipartimento..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
              data-testid="input-search"
            />
          </div>
        </CardContent>
      </Card>

      {/* Lista Risorse */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredResources.map((resource) => (
          <Card key={resource.id} className="hover:shadow-md transition-shadow">
            <CardHeader className="pb-2">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-2xl">{getRoleIcon(resource.role)}</span>
                  <div>
                    <CardTitle className="text-lg">{resource.name}</CardTitle>
                    <p className="text-sm text-muted-foreground capitalize">
                      {resource.role} • {resource.skillLevel}
                    </p>
                  </div>
                </div>
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleEdit(resource)}
                    data-testid={`button-edit-${resource.id}`}
                  >
                    <Edit className="h-4 w-4" />
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-red-600 hover:text-red-700"
                        data-testid={`button-delete-${resource.id}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Conferma eliminazione</AlertDialogTitle>
                        <AlertDialogDescription>
                          Sei sicuro di voler eliminare la risorsa "{resource.name}"? 
                          Questa azione non può essere annullata.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Annulla</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => deleteMutation.mutate(resource.id)}
                          className="bg-red-600 hover:bg-red-700"
                        >
                          Elimina
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {/* Badges */}
              <div className="flex flex-wrap gap-2">
                <Badge className={getSkillLevelColor(resource.skillLevel)}>
                  {resource.skillLevel}
                </Badge>
                {resource.department && (
                  <Badge variant="outline">{resource.department}</Badge>
                )}
                <Badge variant={resource.isActive ? "default" : "secondary"}>
                  {resource.isActive ? "Attiva" : "Inattiva"}
                </Badge>
              </div>

              {/* Informazioni */}
              <div className="space-y-2 text-sm">
                {resource.baseHourlyRate && (
                  <div className="flex items-center gap-2">
                    <DollarSign className="h-4 w-4 text-muted-foreground" />
                    <span>€{resource.baseHourlyRate}/ora</span>
                  </div>
                )}
                
                {resource.costCenter && (
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">CC:</span>
                    <span>{resource.costCenter}</span>
                  </div>
                )}

                {resource.startDate && (
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    <span>Dal {new Date(resource.startDate).toLocaleDateString('it-IT')}</span>
                  </div>
                )}

                {resource.linkedUserId && (
                  <div className="flex items-center gap-2">
                    <UserIcon className="h-4 w-4 text-muted-foreground" />
                    <span className="text-blue-600">Utente collegato</span>
                  </div>
                )}
              </div>

              {resource.notes && (
                <p className="text-sm text-muted-foreground border-t pt-2 mt-2">
                  {resource.notes}
                </p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {filteredResources.length === 0 && (
        <Card className="p-12 text-center">
          <Users className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-lg font-medium mb-2">Nessuna risorsa trovata</h3>
          <p className="text-muted-foreground mb-4">
            {searchTerm 
              ? "Nessuna risorsa corrisponde ai criteri di ricerca"
              : "Non hai ancora creato nessuna risorsa umana"
            }
          </p>
          {!searchTerm && (
            <Button onClick={handleCreate}>
              <Plus className="h-4 w-4 mr-2" />
              Crea la tua prima risorsa
            </Button>
          )}
        </Card>
      )}
    </div>
  );
}