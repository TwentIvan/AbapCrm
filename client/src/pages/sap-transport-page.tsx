import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, getQueryFn } from "@/lib/queryClient";
import { useOrganization } from "@/contexts/organization-context";
import Sidebar from "@/components/layout/sidebar";
import Header from "@/components/layout/header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Package, FileCode, Calendar, User, Trash2, Info, ChevronDown, ChevronRight, ClipboardPaste, RefreshCw } from "lucide-react";
import { format } from "date-fns";
import { SapPasteJsonDialog } from "@/components/dialogs/sap-paste-json-dialog";

interface SapTransportRequest {
  id: string;
  projectId: string;
  userId: string;
  organizationId: string;
  requestNumber: string;
  description: string;
  status: 'modifiable' | 'released' | 'imported' | 'error';
  owner: string;
  targetSystem?: string;
  createdDate?: Date;
  releasedDate?: Date;
  category?: string;
  sapSystemId?: string;
  createdAt: Date;
  updatedAt: Date;
}

interface SapTransportTask {
  id: string;
  requestId: string;
  taskNumber: string;
  description?: string;
  taskType: 'development' | 'customizing' | 'repair';
  owner: string;
  status: 'modifiable' | 'released' | 'imported' | 'error';
  createdAt: Date;
}

interface SapTransportObject {
  id: string;
  requestId: string;
  taskId?: string;
  objectType: 'program' | 'function' | 'class' | 'table' | 'view' | 'report' | 'screen' | 'smartform' | 'webdynpro' | 'other';
  objectName: string;
  objectKey?: string;
  packageName?: string;
  createdAt: Date;
}

const statusColors = {
  modifiable: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-100",
  released: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100",
  imported: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-100",
  error: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-100",
};

const statusLabels = {
  modifiable: "Modificabile",
  released: "Rilasciata",
  imported: "Importata",
  error: "Errore",
};

const taskTypeLabels = {
  development: "Sviluppo",
  customizing: "Customizing",
  repair: "Correzione",
};

const objectTypeLabels = {
  program: "Programma",
  function: "Funzione",
  class: "Classe",
  table: "Tabella",
  view: "Vista",
  report: "Report",
  screen: "Dynpro",
  smartform: "SmartForm",
  webdynpro: "WebDynpro",
  other: "Altro",
};

export default function SapTransportPage() {
  const [selectedRequest, setSelectedRequest] = useState<SapTransportRequest | null>(null);
  const [showDetailsDialog, setShowDetailsDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [expandedRequests, setExpandedRequests] = useState<Set<string>>(new Set());
  const [showPasteDialog, setShowPasteDialog] = useState(false);
  const [showSyncDialog, setShowSyncDialog] = useState(false);
  const [syncOdataUrl, setSyncOdataUrl] = useState("https://vhgivds4ci.rise.givagroup.it:44300/sap/opu/odata/SAP/ZTHU_DOC_SRV/TransportSet?$top=5&$format=json");
  const [syncUsername, setSyncUsername] = useState("");
  const [syncPassword, setSyncPassword] = useState("");
  
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { currentOrganizationId } = useOrganization();

  const { data: requests = [], isLoading } = useQuery<SapTransportRequest[]>({
    queryKey: ["/api/sap-transport-requests"],
    queryFn: getQueryFn({ on401: "throw" }),
    enabled: !!currentOrganizationId,
  });

  const { data: tasks = [] } = useQuery<SapTransportTask[]>({
    queryKey: ["/api/sap-transport-requests", selectedRequest?.id, "tasks"],
    queryFn: getQueryFn({ on401: "throw" }),
    enabled: !!selectedRequest?.id,
  });

  const { data: objects = [] } = useQuery<SapTransportObject[]>({
    queryKey: ["/api/sap-transport-requests", selectedRequest?.id, "objects"],
    queryFn: getQueryFn({ on401: "throw" }),
    enabled: !!selectedRequest?.id,
  });

  const deleteMutation = useMutation({
    mutationFn: async (requestId: string) => {
      await apiRequest("DELETE", `/api/sap-transport-requests/${requestId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sap-transport-requests"] });
      setShowDeleteDialog(false);
      setSelectedRequest(null);
      toast({
        title: "Transport Request eliminata",
        description: "La transport request è stata eliminata con successo.",
      });
    },
  });

  const syncOdataMutation = useMutation({
    mutationFn: async () => {
      // Chiamata client-side all'endpoint OData (funziona anche con VPN)
      const headers: HeadersInit = {
        'Accept': 'application/json',
      };
      
      // Aggiungi Basic Auth se fornite le credenziali
      if (syncUsername && syncPassword) {
        const authString = btoa(`${syncUsername}:${syncPassword}`);
        headers['Authorization'] = `Basic ${authString}`;
      }
      
      console.log('[SAP Sync] Chiamata a:', syncOdataUrl);
      console.log('[SAP Sync] Con autenticazione:', !!syncUsername);
      
      // Fetch diretto dall'endpoint OData (client-side, rispetta la VPN)
      const odataResponse = await fetch(syncOdataUrl, {
        method: 'GET',
        headers,
        credentials: 'include', // Necessario per autenticazione cross-origin
        mode: 'cors', // Richiede che il server SAP supporti CORS
      });
      
      console.log('[SAP Sync] Risposta HTTP:', odataResponse.status, odataResponse.statusText);
      
      if (!odataResponse.ok) {
        const errorText = await odataResponse.text().catch(() => '');
        console.error('[SAP Sync] Errore risposta:', errorText);
        throw new Error(`Errore ${odataResponse.status}: ${odataResponse.statusText}${errorText ? ` - ${errorText.substring(0, 200)}` : ''}`);
      }
      
      const odataData = await odataResponse.json();
      const results = odataData.d?.results || [];
      
      if (!Array.isArray(results) || results.length === 0) {
        return {
          success: true,
          imported: 0,
          skipped: 0,
          total: 0,
          message: "Nessuna Transport Request trovata nell'endpoint OData",
        };
      }
      
      // Invia i risultati al backend per processarli
      let imported = 0;
      let skipped = 0;
      const errors: string[] = [];
      
      for (const odataItem of results) {
        try {
          // Mappa i campi OData al formato interno
          const mappedData = {
            request_number: odataItem.Number,
            description: odataItem.Text || '',
            owner: odataItem.Owner || '',
            target_system: odataItem.Target || null,
          };
          
          // Invia al backend per salvare (usa endpoint paste esistente)
          const jsonContent = JSON.stringify(mappedData);
          const response = await apiRequest("POST", "/api/sap-transport/paste", {
            jsonContent,
          });
          
          if (response.success) {
            imported++;
          } else {
            skipped++;
            errors.push(`${odataItem.Number}: ${response.error || 'Errore sconosciuto'}`);
          }
        } catch (itemError: any) {
          skipped++;
          errors.push(`${odataItem.Number}: ${itemError.message || 'Errore processamento'}`);
        }
      }
      
      return {
        success: true,
        imported,
        skipped,
        total: results.length,
        errors: errors.length > 0 ? errors : undefined,
        message: `Sincronizzazione completata: ${imported} importate, ${skipped} saltate su ${results.length} totali`,
      };
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/sap-transport-requests"] });
      setShowSyncDialog(false);
      setSyncUsername("");
      setSyncPassword("");
      toast({
        title: "Sincronizzazione completata",
        description: `${data.imported} TR importate, ${data.skipped} saltate su ${data.total} totali`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Errore sincronizzazione",
        description: error.message || "Errore nella sincronizzazione con l'endpoint OData SAP",
        variant: "destructive",
      });
    },
  });


  const handleViewDetails = (request: SapTransportRequest) => {
    setSelectedRequest(request);
    setShowDetailsDialog(true);
  };

  const handleDelete = (request: SapTransportRequest) => {
    setSelectedRequest(request);
    setShowDeleteDialog(true);
  };

  const confirmDelete = () => {
    if (selectedRequest) {
      deleteMutation.mutate(selectedRequest.id);
    }
  };

  const toggleExpanded = (requestId: string) => {
    setExpandedRequests(prev => {
      const newSet = new Set(prev);
      if (newSet.has(requestId)) {
        newSet.delete(requestId);
      } else {
        newSet.add(requestId);
      }
      return newSet;
    });
  };

  if (isLoading) {
    return (
      <div className="flex h-screen bg-gray-50 dark:bg-gray-900">
        <Sidebar />
        <div className="flex-1 flex flex-col overflow-hidden">
          <Header title="SAP Transport" subtitle="Gestione transport request" />
          <main className="flex-1 overflow-y-auto p-6">
            <div className="space-y-4">
              <Skeleton className="h-12 w-64" />
              <Skeleton className="h-96 w-full" />
            </div>
          </main>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-gray-50 dark:bg-gray-900">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header title="SAP Transport" subtitle="Gestione transport request" />
        <main className="flex-1 overflow-y-auto p-6">
          <div className="max-w-7xl mx-auto space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-3xl font-bold text-gray-900 dark:text-white" data-testid="heading-sap-transport">
                  SAP Transport Requests
                </h1>
                <p className="text-gray-500 dark:text-gray-400 mt-1">
                  Gestisci le transport request ricevute dai sistemi SAP
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  onClick={() => setShowSyncDialog(true)}
                  className="bg-green-50 hover:bg-green-100 text-green-700 dark:bg-green-900 dark:hover:bg-green-800 dark:text-green-100 shadow-md"
                  data-testid="button-sync-odata"
                >
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Sincronizza da SAP
                </Button>
                <Button
                  onClick={() => setShowPasteDialog(true)}
                  className="bg-blue-50 hover:bg-blue-100 text-blue-700 dark:bg-blue-900 dark:hover:bg-blue-800 dark:text-blue-100 shadow-md"
                  data-testid="button-paste-json"
                >
                  <ClipboardPaste className="h-4 w-4 mr-2" />
                  Incolla JSON
                </Button>
                <Badge variant="outline" className="text-sm" data-testid="badge-count">
                  {requests.length} Transport{requests.length !== 1 ? 's' : ''}
                </Badge>
              </div>
            </div>

            {requests.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <Package className="h-12 w-12 text-gray-400 mb-4" />
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                    Nessuna Transport Request
                  </h3>
                  <p className="text-gray-500 dark:text-gray-400 text-center max-w-md">
                    Le transport request inviate dai report ABAP appariranno qui. 
                    Usa l'endpoint API per inviare i dati dal sistema SAP.
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                {requests.map((request) => (
                  <Card key={request.id} className="hover:shadow-lg transition-shadow" data-testid={`card-request-${request.id}`}>
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-3">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => toggleExpanded(request.id)}
                              className="h-6 w-6 p-0"
                              data-testid={`button-expand-${request.id}`}
                            >
                              {expandedRequests.has(request.id) ? (
                                <ChevronDown className="h-4 w-4" />
                              ) : (
                                <ChevronRight className="h-4 w-4" />
                              )}
                            </Button>
                            <CardTitle className="text-xl" data-testid={`text-request-number-${request.id}`}>
                              {request.requestNumber}
                            </CardTitle>
                            <Badge className={statusColors[request.status]} data-testid={`badge-status-${request.id}`}>
                              {statusLabels[request.status]}
                            </Badge>
                          </div>
                          <CardDescription className="mt-2 ml-9" data-testid={`text-description-${request.id}`}>
                            {request.description}
                          </CardDescription>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleViewDetails(request)}
                            data-testid={`button-view-details-${request.id}`}
                          >
                            <Info className="h-4 w-4 mr-2" />
                            Dettagli
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleDelete(request)}
                            className="text-red-600 hover:text-red-700"
                            data-testid={`button-delete-${request.id}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </CardHeader>
                    
                    {expandedRequests.has(request.id) && (
                      <CardContent className="pt-0">
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-sm">
                          <div>
                            <p className="text-gray-500 dark:text-gray-400 flex items-center gap-2">
                              <User className="h-4 w-4" />
                              Owner
                            </p>
                            <p className="font-medium text-gray-900 dark:text-white" data-testid={`text-owner-${request.id}`}>
                              {request.owner}
                            </p>
                          </div>
                          {request.targetSystem && (
                            <div>
                              <p className="text-gray-500 dark:text-gray-400 flex items-center gap-2">
                                <Package className="h-4 w-4" />
                                Sistema Target
                              </p>
                              <p className="font-medium text-gray-900 dark:text-white">
                                {request.targetSystem}
                              </p>
                            </div>
                          )}
                          <div>
                            <p className="text-gray-500 dark:text-gray-400 flex items-center gap-2">
                              <Calendar className="h-4 w-4" />
                              Creata
                            </p>
                            <p className="font-medium text-gray-900 dark:text-white">
                              {format(new Date(request.createdAt), "dd/MM/yyyy HH:mm")}
                            </p>
                          </div>
                          {request.releasedDate && (
                            <div>
                              <p className="text-gray-500 dark:text-gray-400 flex items-center gap-2">
                                <Calendar className="h-4 w-4" />
                                Rilasciata
                              </p>
                              <p className="font-medium text-gray-900 dark:text-white">
                                {format(new Date(request.releasedDate), "dd/MM/yyyy HH:mm")}
                              </p>
                            </div>
                          )}
                        </div>
                      </CardContent>
                    )}
                  </Card>
                ))}
              </div>
            )}
          </div>

          {/* Details Dialog */}
          <Dialog open={showDetailsDialog} onOpenChange={setShowDetailsDialog}>
            <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle data-testid="dialog-title-details">
                  Dettagli Transport Request: {selectedRequest?.requestNumber}
                </DialogTitle>
                <DialogDescription>
                  Visualizza tasks e oggetti collegati a questa transport request
                </DialogDescription>
              </DialogHeader>
              
              {selectedRequest && (
                <Tabs defaultValue="info" className="w-full">
                  <TabsList className="grid w-full grid-cols-3">
                    <TabsTrigger value="info" data-testid="tab-info">Informazioni</TabsTrigger>
                    <TabsTrigger value="tasks" data-testid="tab-tasks">
                      Tasks {tasks.length > 0 && `(${tasks.length})`}
                    </TabsTrigger>
                    <TabsTrigger value="objects" data-testid="tab-objects">
                      Oggetti {objects.length > 0 && `(${objects.length})`}
                    </TabsTrigger>
                  </TabsList>
                  
                  <TabsContent value="info" className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-sm font-medium text-gray-500 dark:text-gray-400">Request Number</label>
                        <p className="text-lg font-semibold text-gray-900 dark:text-white">{selectedRequest.requestNumber}</p>
                      </div>
                      <div>
                        <label className="text-sm font-medium text-gray-500 dark:text-gray-400">Status</label>
                        <div className="mt-1">
                          <Badge className={statusColors[selectedRequest.status]}>
                            {statusLabels[selectedRequest.status]}
                          </Badge>
                        </div>
                      </div>
                      <div className="col-span-2">
                        <label className="text-sm font-medium text-gray-500 dark:text-gray-400">Descrizione</label>
                        <p className="text-gray-900 dark:text-white">{selectedRequest.description}</p>
                      </div>
                      <div>
                        <label className="text-sm font-medium text-gray-500 dark:text-gray-400">Owner</label>
                        <p className="text-gray-900 dark:text-white">{selectedRequest.owner}</p>
                      </div>
                      {selectedRequest.targetSystem && (
                        <div>
                          <label className="text-sm font-medium text-gray-500 dark:text-gray-400">Sistema Target</label>
                          <p className="text-gray-900 dark:text-white">{selectedRequest.targetSystem}</p>
                        </div>
                      )}
                      {selectedRequest.category && (
                        <div>
                          <label className="text-sm font-medium text-gray-500 dark:text-gray-400">Categoria</label>
                          <p className="text-gray-900 dark:text-white">{selectedRequest.category}</p>
                        </div>
                      )}
                      <div>
                        <label className="text-sm font-medium text-gray-500 dark:text-gray-400">Data Creazione</label>
                        <p className="text-gray-900 dark:text-white">
                          {format(new Date(selectedRequest.createdAt), "dd/MM/yyyy HH:mm:ss")}
                        </p>
                      </div>
                      {selectedRequest.releasedDate && (
                        <div>
                          <label className="text-sm font-medium text-gray-500 dark:text-gray-400">Data Rilascio</label>
                          <p className="text-gray-900 dark:text-white">
                            {format(new Date(selectedRequest.releasedDate), "dd/MM/yyyy HH:mm:ss")}
                          </p>
                        </div>
                      )}
                    </div>
                  </TabsContent>
                  
                  <TabsContent value="tasks">
                    {tasks.length === 0 ? (
                      <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                        Nessun task associato a questa transport request
                      </div>
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Task Number</TableHead>
                            <TableHead>Tipo</TableHead>
                            <TableHead>Owner</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Descrizione</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {tasks.map((task) => (
                            <TableRow key={task.id} data-testid={`row-task-${task.id}`}>
                              <TableCell className="font-medium">{task.taskNumber}</TableCell>
                              <TableCell>
                                <Badge variant="outline">{taskTypeLabels[task.taskType]}</Badge>
                              </TableCell>
                              <TableCell>{task.owner}</TableCell>
                              <TableCell>
                                <Badge className={statusColors[task.status]}>
                                  {statusLabels[task.status]}
                                </Badge>
                              </TableCell>
                              <TableCell className="max-w-xs truncate">{task.description || '-'}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    )}
                  </TabsContent>
                  
                  <TabsContent value="objects">
                    {objects.length === 0 ? (
                      <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                        Nessun oggetto associato a questa transport request
                      </div>
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Tipo</TableHead>
                            <TableHead>Nome Oggetto</TableHead>
                            <TableHead>Package</TableHead>
                            <TableHead>Object Key</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {objects.map((obj) => (
                            <TableRow key={obj.id} data-testid={`row-object-${obj.id}`}>
                              <TableCell>
                                <Badge variant="outline" className="flex items-center gap-1 w-fit">
                                  <FileCode className="h-3 w-3" />
                                  {objectTypeLabels[obj.objectType]}
                                </Badge>
                              </TableCell>
                              <TableCell className="font-mono font-semibold">{obj.objectName}</TableCell>
                              <TableCell>{obj.packageName || '-'}</TableCell>
                              <TableCell className="font-mono text-sm">{obj.objectKey || '-'}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    )}
                  </TabsContent>
                </Tabs>
              )}
            </DialogContent>
          </Dialog>

          {/* Delete Confirmation Dialog */}
          <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Conferma eliminazione</AlertDialogTitle>
                <AlertDialogDescription>
                  Sei sicuro di voler eliminare la transport request <strong>{selectedRequest?.requestNumber}</strong>?
                  Questa azione eliminerà anche tutti i task e gli oggetti associati e non può essere annullata.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel data-testid="button-cancel-delete">Annulla</AlertDialogCancel>
                <AlertDialogAction
                  onClick={confirmDelete}
                  className="bg-red-600 hover:bg-red-700"
                  data-testid="button-confirm-delete"
                >
                  Elimina
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          {/* Paste JSON Dialog */}
          <SapPasteJsonDialog 
            open={showPasteDialog} 
            onOpenChange={setShowPasteDialog}
          />

          {/* Sync OData Dialog */}
          <Dialog open={showSyncDialog} onOpenChange={setShowSyncDialog}>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Sincronizza da OData SAP</DialogTitle>
                <DialogDescription>
                  Importa le Transport Request direttamente dall'endpoint OData SAP.
                  Le credenziali sono opzionali e necessarie solo se l'endpoint richiede autenticazione.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="odata-url">URL Endpoint OData</Label>
                  <Input
                    id="odata-url"
                    type="url"
                    value={syncOdataUrl}
                    onChange={(e) => setSyncOdataUrl(e.target.value)}
                    placeholder="https://server:port/sap/opu/odata/..."
                    className="font-mono text-sm"
                    data-testid="input-odata-url"
                  />
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Esempio: https://vhgivds4ci.rise.givagroup.it:44300/sap/opu/odata/SAP/ZTHU_DOC_SRV/TransportSet?$format=json
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="sap-username">Username SAP (opzionale)</Label>
                    <Input
                      id="sap-username"
                      type="text"
                      value={syncUsername}
                      onChange={(e) => setSyncUsername(e.target.value)}
                      placeholder="Username"
                      data-testid="input-sap-username"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="sap-password">Password SAP (opzionale)</Label>
                    <Input
                      id="sap-password"
                      type="password"
                      value={syncPassword}
                      onChange={(e) => setSyncPassword(e.target.value)}
                      placeholder="Password"
                      data-testid="input-sap-password"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 pt-4">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setShowSyncDialog(false);
                      setSyncUsername("");
                      setSyncPassword("");
                    }}
                    data-testid="button-cancel-sync"
                  >
                    Annulla
                  </Button>
                  <Button
                    onClick={() => syncOdataMutation.mutate()}
                    disabled={syncOdataMutation.isPending || !syncOdataUrl.trim()}
                    className="bg-green-600 hover:bg-green-700"
                    data-testid="button-start-sync"
                  >
                    {syncOdataMutation.isPending ? (
                      <>
                        <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                        Sincronizzazione...
                      </>
                    ) : (
                      <>
                        <RefreshCw className="h-4 w-4 mr-2" />
                        Sincronizza
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </main>
      </div>
    </div>
  );
}
