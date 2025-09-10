import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import Sidebar from "@/components/layout/sidebar";
import Header from "@/components/layout/header";
import { 
  Mail, 
  MailOpen, 
  User, 
  Calendar, 
  Clock, 
  AlertCircle, 
  CheckCircle, 
  FileText,
  Bot,
  Link,
  Plus,
  Eye,
  RefreshCw,
  Trash2,
  Search,
  ArrowUpDown,
  ArrowUp,
  ArrowDown
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import type { Message, Project, Task, Partner } from "@shared/schema";
import { format } from "date-fns";
import MessageForm from "@/components/forms/message-form";

interface AISuggestion {
  type: 'project' | 'task' | 'partner';
  id: string;
  name: string;
  confidence: number;
  reason: string;
}

interface AnalysisResult {
  suggestions: AISuggestion[];
  bestMatch?: AISuggestion;
}

export default function MessagesPage() {
  const [selectedMessage, setSelectedMessage] = useState<Message | null>(null);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [showNewMessageDialog, setShowNewMessageDialog] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [sortBy, setSortBy] = useState<"receivedAt" | "fromEmail" | "subject">("receivedAt");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  // Column widths state for resizable columns
  const [columnWidths, setColumnWidths] = useState({
    fromEmail: 40, // percentuale
    subject: 40,
    receivedAt: 20
  });
  const [isResizing, setIsResizing] = useState(false);
  const [resizingColumn, setResizingColumn] = useState<string | null>(null);

  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: messages = [] } = useQuery<Message[]>({
    queryKey: ["/api/messages"],
    queryFn: async () => {
      const res = await fetch("/api/messages", { credentials: "include" });
      if (!res.ok) throw new Error('Failed to fetch messages');
      return res.json();
    },
    refetchInterval: 30000, // Refresh every 30 seconds
    refetchIntervalInBackground: true, // Continue refreshing in background
  });

  const { data: projects = [] } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
    queryFn: async () => {
      const res = await fetch("/api/projects", { credentials: "include" });
      if (!res.ok) throw new Error('Failed to fetch projects');
      return res.json();
    },
  });

  const { data: tasks = [] } = useQuery<Task[]>({
    queryKey: ["/api/tasks"],
    queryFn: async () => {
      const res = await fetch("/api/tasks", { credentials: "include" });
      if (!res.ok) throw new Error('Failed to fetch tasks');
      return res.json();
    },
  });

  const { data: partners = [] } = useQuery<Partner[]>({
    queryKey: ["/api/partners"],
    queryFn: async () => {
      const res = await fetch("/api/partners", { credentials: "include" });
      if (!res.ok) throw new Error('Failed to fetch partners');
      return res.json();
    },
  });

  const syncMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/email/sync"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/messages"] });
      toast({
        title: "Sincronizzazione avviata",
        description: "Il sistema sta recuperando le email dalla cartella.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Errore di sincronizzazione",
        description: error.message || "Errore durante la sincronizzazione delle email.",
        variant: "destructive",
      });
    },
  });

  const markAsReadMutation = useMutation({
    mutationFn: (messageId: string) => 
      apiRequest("POST", `/api/messages/${messageId}/read`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/messages"] });
    }
  });

  const analyzeMutation = useMutation<AnalysisResult, Error, string>({
    mutationFn: async (messageId: string) => {
      const response = await apiRequest("POST", `/api/messages/${messageId}/analyze`);
      return response as unknown as AnalysisResult;
    },
    onSuccess: () => {
      setShowSuggestions(true);
    }
  });

  const applySuggestionMutation = useMutation({
    mutationFn: ({ messageId, suggestion }: { messageId: string, suggestion: AISuggestion }) =>
      apiRequest("POST", `/api/messages/${messageId}/apply-suggestion`, { suggestion }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/messages"] });
      setShowSuggestions(false);
      toast({
        title: "Collegamento applicato",
        description: "Il messaggio è stato collegato con successo.",
      });
    }
  });

  const deleteMessageMutation = useMutation({
    mutationFn: (messageId: string) => 
      apiRequest("DELETE", `/api/messages/${messageId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/messages"] });
      setSelectedMessage(null);
      toast({
        title: "Messaggio eliminato",
        description: "Il messaggio è stato eliminato con successo.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Errore",
        description: error.message || "Errore durante l'eliminazione del messaggio.",
        variant: "destructive",
      });
    },
  });

  const clearAllMessagesMutation = useMutation({
    mutationFn: async () => {
      // Delete all messages for the current user
      const deletePromises = messages.map(message => 
        apiRequest("DELETE", `/api/messages/${message.id}`)
      );
      await Promise.all(deletePromises);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/messages"] });
      setSelectedMessage(null);
      toast({
        title: "Tutti i messaggi eliminati",
        description: "Tutti i messaggi sono stati eliminati. Usa 'Sincronizza' per ricaricarli.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Errore",
        description: error.message || "Errore durante l'eliminazione dei messaggi.",
        variant: "destructive",
      });
    },
  });

  const handleSelectMessage = (message: Message) => {
    setSelectedMessage(message);
    setShowSuggestions(false);
    if (message.status === 'unread') {
      markAsReadMutation.mutate(message.id);
    }
  };

  const handleAnalyze = () => {
    if (selectedMessage) {
      analyzeMutation.mutate(selectedMessage.id);
    }
  };

  const handleApplySuggestion = (suggestion: AISuggestion) => {
    if (selectedMessage) {
      applySuggestionMutation.mutate({
        messageId: selectedMessage.id,
        suggestion
      });
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'unread': return <Mail className="h-4 w-4" />;
      case 'read': return <MailOpen className="h-4 w-4" />;
      case 'processed': return <CheckCircle className="h-4 w-4" />;
      case 'archived': return <FileText className="h-4 w-4" />;
      default: return <Mail className="h-4 w-4" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'unread': return 'bg-blue-500';
      case 'read': return 'bg-gray-500';
      case 'processed': return 'bg-green-500';
      case 'archived': return 'bg-yellow-500';
      default: return 'bg-gray-500';
    }
  };

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.8) return 'text-green-600';
    if (confidence >= 0.6) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getFileType = (filename: string): { isImage: boolean; icon: string; type: string } => {
    const ext = filename.toLowerCase().split('.').pop() || '';
    
    const imageExts = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp'];
    const isImage = imageExts.includes(ext);
    
    if (isImage) return { isImage: true, icon: '🖼️', type: 'Immagine' };
    
    // Altri tipi di file
    const fileTypes: { [key: string]: { isImage: boolean; icon: string; type: string } } = {
      'pdf': { isImage: false, icon: '📄', type: 'PDF' },
      'doc': { isImage: false, icon: '📝', type: 'Word' },
      'docx': { isImage: false, icon: '📝', type: 'Word' },
      'xls': { isImage: false, icon: '📊', type: 'Excel' },
      'xlsx': { isImage: false, icon: '📊', type: 'Excel' },
      'ppt': { isImage: false, icon: '📈', type: 'PowerPoint' },
      'pptx': { isImage: false, icon: '📈', type: 'PowerPoint' },
      'txt': { isImage: false, icon: '📃', type: 'Testo' },
      'zip': { isImage: false, icon: '🗜️', type: 'Archivio' },
      'rar': { isImage: false, icon: '🗜️', type: 'Archivio' }
    };
    
    return fileTypes[ext] || { isImage: false, icon: '📁', type: 'File' };
  };

  const getLinkedObjectName = (message: Message) => {
    if (message.projectId) {
      const project = projects.find(p => p.id === message.projectId);
      return { type: 'Progetto', name: project?.name || 'Sconosciuto' };
    }
    if (message.taskId) {
      const task = tasks.find(t => t.id === message.taskId);
      return { type: 'Task', name: task?.title || 'Sconosciuto' };
    }
    if (message.partnerId) {
      const partner = partners.find(p => p.id === message.partnerId);
      return { type: 'Partner', name: partner?.name || 'Sconosciuto' };
    }
    return null;
  };

  const unreadCount = messages.filter(m => m.status === 'unread').length;

  // Filtro e ordinamento messaggi
  const filteredAndSortedMessages = messages
    .filter(message => {
      if (!searchTerm) return true;
      const searchLower = searchTerm.toLowerCase();
      return (
        (message.fromName || message.fromEmail).toLowerCase().includes(searchLower) ||
        (message.subject || '').toLowerCase().includes(searchLower) ||
        (message.body || '').toLowerCase().includes(searchLower)
      );
    })
    .sort((a, b) => {
      let comparison = 0;
      
      switch (sortBy) {
        case 'receivedAt':
          comparison = new Date(a.receivedAt).getTime() - new Date(b.receivedAt).getTime();
          break;
        case 'fromEmail':
          comparison = (a.fromName || a.fromEmail).localeCompare(b.fromName || b.fromEmail);
          break;
        case 'subject':
          comparison = (a.subject || '').localeCompare(b.subject || '');
          break;
      }
      
      return sortOrder === 'desc' ? -comparison : comparison;
    });

  // Column resize handlers
  const handleColumnResize = (e: React.MouseEvent, columnIndex: number) => {
    e.preventDefault();
    e.stopPropagation();
    
    const startX = e.clientX;
    const startWidths = [...Object.values(columnWidths)]; // [40, 40, 20]
    
    const onMouseMove = (moveEvent: MouseEvent) => {
      const deltaX = moveEvent.clientX - startX;
      const containerWidth = 800; // Approssimativamente
      const deltaPercent = (deltaX / containerWidth) * 100;
      
      const newWidths = [...startWidths];
      
      if (columnIndex === 0) { // fromEmail
        newWidths[0] = Math.max(20, Math.min(70, startWidths[0] + deltaPercent));
        newWidths[1] = Math.max(20, Math.min(70, startWidths[1] - deltaPercent));
      } else if (columnIndex === 1) { // subject
        newWidths[1] = Math.max(20, Math.min(70, startWidths[1] + deltaPercent));
        newWidths[2] = Math.max(10, Math.min(40, startWidths[2] - deltaPercent));
      }
      
      setColumnWidths({
        fromEmail: newWidths[0],
        subject: newWidths[1],
        receivedAt: newWidths[2]
      });
    };
    
    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      setIsResizing(false);
      setResizingColumn(null);
    };
    
    setIsResizing(true);
    setResizingColumn(columnIndex === 0 ? 'fromEmail' : 'subject');
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  };

  const handleSort = (column: typeof sortBy) => {
    if (sortBy === column) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(column);
      setSortOrder('desc');
    }
  };

  const getSortIcon = (column: typeof sortBy) => {
    if (sortBy !== column) return <ArrowUpDown className="h-4 w-4" />;
    return sortOrder === 'asc' ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />;
  };

  return (
    <div className="flex h-screen">
      <Sidebar />
      <div className="flex-1 overflow-hidden">
        <Header 
          title="Messaggi Email"
          subtitle="Gestisci le email ricevute e i suggerimenti AI"
          onNewClick={() => setShowNewMessageDialog(true)}
        />
        
        <div className="px-6 py-2 border-b">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Badge variant="secondary" className="text-sm">
                {unreadCount} non letti
              </Badge>
              <Button 
                onClick={() => syncMutation.mutate()}
                disabled={syncMutation.isPending}
                size="sm"
                variant="outline"
                data-testid="button-sync-emails"
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${syncMutation.isPending ? 'animate-spin' : ''}`} />
                Sincronizza
              </Button>
            </div>
            {messages.length > 0 && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button 
                    size="sm"
                    variant="destructive"
                    data-testid="button-clear-all-messages"
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Elimina tutti
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Eliminare tutti i messaggi?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Questa azione eliminerà tutti i {messages.length} messaggi email. 
                      Potrai ricaricarli usando il bottone "Sincronizza" per vedere la nuova formattazione HTML.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Annulla</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => clearAllMessagesMutation.mutate()}
                      disabled={clearAllMessagesMutation.isPending}
                      className="bg-destructive hover:bg-destructive/90"
                    >
                      {clearAllMessagesMutation.isPending ? "Eliminando..." : "Elimina tutti"}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
        </div>
        <main className="p-6">
          <PanelGroup direction="horizontal" className="h-[calc(100vh-120px)]">
            <Panel defaultSize={40} minSize={25} maxSize={60}>
              {/* Message List */}
              <Card className="h-full flex flex-col">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2">
                    <Mail className="h-5 w-5" />
                    Lista Messaggi
                  </CardTitle>
                </div>
                {/* Barra di ricerca */}
                <div className="relative">
                  <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Cerca messaggi..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-8"
                    data-testid="search-messages"
                  />
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <div className="border rounded-md">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead 
                          className="cursor-pointer hover:bg-muted/50 relative"
                          style={{ width: `${columnWidths.fromEmail}%` }}
                          onClick={() => handleSort('fromEmail')}
                        >
                          <div className="flex items-center space-x-2">
                            <span>Mittente</span>
                            {getSortIcon('fromEmail')}
                          </div>
                          {/* Resize handle */}
                          <div
                            className="absolute right-0 top-0 w-2 h-full cursor-col-resize bg-border hover:bg-primary transition-colors z-10"
                            onMouseDown={(e) => handleColumnResize(e, 0)}
                            title="Trascina per ridimensionare"
                          />
                        </TableHead>
                        <TableHead 
                          className="cursor-pointer hover:bg-muted/50 relative"
                          style={{ width: `${columnWidths.subject}%` }}
                          onClick={() => handleSort('subject')}
                        >
                          <div className="flex items-center space-x-2">
                            <span>Oggetto</span>
                            {getSortIcon('subject')}
                          </div>
                          {/* Resize handle */}
                          <div
                            className="absolute right-0 top-0 w-2 h-full cursor-col-resize bg-border hover:bg-primary transition-colors z-10"
                            onMouseDown={(e) => handleColumnResize(e, 1)}
                            title="Trascina per ridimensionare"
                          />
                        </TableHead>
                        <TableHead 
                          className="cursor-pointer hover:bg-muted/50"
                          style={{ width: `${columnWidths.receivedAt}%` }}
                          onClick={() => handleSort('receivedAt')}
                        >
                          <div className="flex items-center space-x-2">
                            <span>Data/Ora</span>
                            {getSortIcon('receivedAt')}
                          </div>
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                  </Table>
                  <ScrollArea className="h-[500px]">
                    <Table>
                      <TableBody>
                        {filteredAndSortedMessages.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={3} className="h-32 text-center">
                              <div className="flex flex-col items-center justify-center text-muted-foreground">
                                <Mail className="h-8 w-8 mb-2 opacity-50" />
                                <p>{searchTerm ? 'Nessun messaggio trovato' : 'Nessun messaggio ricevuto'}</p>
                              </div>
                            </TableCell>
                          </TableRow>
                        ) : (
                          filteredAndSortedMessages.map((message) => {
                            const linkedObject = getLinkedObjectName(message);
                            
                            return (
                              <TableRow
                                key={message.id}
                                data-testid={`message-item-${message.id}`}
                                className={`cursor-pointer transition-colors ${
                                  selectedMessage?.id === message.id ? 'bg-muted' : ''
                                } ${message.status === 'unread' ? 'border-l-4 border-l-blue-500' : ''}`}
                                onClick={() => handleSelectMessage(message)}
                              >
                                {/* Colonna Mittente */}
                                <TableCell style={{ width: `${columnWidths.fromEmail}%` }}>
                                  <div className="space-y-1">
                                    <div className="flex items-center gap-2">
                                      {getStatusIcon(message.status)}
                                      <span className={`text-sm truncate ${
                                        message.status === 'unread' ? 'font-bold' : 'font-medium'
                                      }`}>
                                        {message.fromName || message.fromEmail}
                                      </span>
                                    </div>
                                    {linkedObject && (
                                      <Badge variant="outline" className="text-xs">
                                        <Link className="h-3 w-3 mr-1" />
                                        {linkedObject.type}: {linkedObject.name}
                                      </Badge>
                                    )}
                                    {message.confidenceScore && (
                                      <div className="text-xs font-medium">
                                        <span className={getConfidenceColor(message.confidenceScore ? Number(message.confidenceScore) : 0)}>
                                          Confidenza: {Math.round((message.confidenceScore ? Number(message.confidenceScore) : 0) * 100)}%
                                        </span>
                                      </div>
                                    )}
                                  </div>
                                </TableCell>
                                
                                {/* Colonna Oggetto */}
                                <TableCell style={{ width: `${columnWidths.subject}%` }}>
                                  <div className="space-y-1">
                                    <p className={`text-sm truncate ${
                                      message.status === 'unread' ? 'font-bold text-foreground' : 'font-normal text-foreground'
                                    }`}>
                                      {message.subject || 'Nessun oggetto'}
                                    </p>
                                    <p className="text-xs text-muted-foreground truncate">
                                      {message.body ? message.body.substring(0, 80) + '...' : 'Nessun contenuto'}
                                    </p>
                                  </div>
                                </TableCell>
                                
                                {/* Colonna Data/Ora */}
                                <TableCell className="text-xs text-muted-foreground" style={{ width: `${columnWidths.receivedAt}%` }}>
                                  <div className="space-y-1">
                                    <div>{format(new Date(message.receivedAt), 'dd MMM yyyy')}</div>
                                    <div>{format(new Date(message.receivedAt), 'HH:mm')}</div>
                                  </div>
                                </TableCell>
                              </TableRow>
                            );
                          })
                        )}
                      </TableBody>
                    </Table>
                  </ScrollArea>
                </div>
              </CardContent>
              </Card>
            </Panel>

            <PanelResizeHandle className="w-2 bg-border hover:bg-muted transition-colors" />

            <Panel defaultSize={60} minSize={40} maxSize={75}>
              {/* Message Detail */}
              <Card className="h-full flex flex-col">
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Eye className="h-5 w-5" />
                Dettaglio Messaggio
              </div>
              {selectedMessage && (
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleAnalyze}
                    disabled={analyzeMutation.isPending}
                    data-testid="analyze-button"
                  >
                    <Bot className="h-4 w-4 mr-2" />
                    {analyzeMutation.isPending ? 'Analizzando...' : 'Analizza AI'}
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        data-testid="delete-message-button"
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Elimina
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Eliminare questo messaggio?</AlertDialogTitle>
                        <AlertDialogDescription>
                          Questa azione eliminerà il messaggio "{selectedMessage.subject}" definitivamente.
                          Potrai ricaricarlo usando il bottone "Sincronizza".
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Annulla</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => deleteMessageMutation.mutate(selectedMessage.id)}
                          disabled={deleteMessageMutation.isPending}
                          className="bg-destructive hover:bg-destructive/90"
                        >
                          {deleteMessageMutation.isPending ? "Eliminando..." : "Elimina"}
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col h-full p-0">
            {!selectedMessage ? (
              <div className="flex items-center justify-center h-96 text-center text-muted-foreground">
                <div>
                  <Mail className="h-16 w-16 mx-auto mb-4 opacity-50" />
                  <p className="text-lg font-medium">Seleziona un messaggio</p>
                  <p className="text-sm">Clicca su un messaggio per visualizzare i dettagli</p>
                </div>
              </div>
            ) : (
              <>
                {/* Header con dati strutturati */}
                <div className="p-6 pb-0 space-y-4">
                  <div className="flex items-start justify-between">
                    <div className="space-y-2">
                      <h3 className="text-lg font-semibold">
                        {selectedMessage.subject || 'Nessun oggetto'}
                      </h3>
                      <div className="flex items-center gap-4 text-sm text-muted-foreground">
                        <div className="flex items-center gap-1">
                          <User className="h-4 w-4" />
                          <span>{selectedMessage.fromName || selectedMessage.fromEmail}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Calendar className="h-4 w-4" />
                          <span>
                            {format(new Date(selectedMessage.receivedAt), 'dd MMMM yyyy, HH:mm')}
                          </span>
                        </div>
                      </div>
                    </div>
                    <Badge 
                      variant="secondary"
                      className={`${getStatusColor(selectedMessage.status)} text-white`}
                    >
                      {selectedMessage.status}
                    </Badge>
                  </div>

                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="font-medium text-muted-foreground">Da:</span>
                      <p>{selectedMessage.fromEmail}</p>
                    </div>
                    <div>
                      <span className="font-medium text-muted-foreground">A:</span>
                      <p>{selectedMessage.toEmail}</p>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <span className="font-medium text-muted-foreground">Collegamenti attuali:</span>
                    <div className="flex flex-wrap gap-2">
                      {(() => {
                        const linkedObject = getLinkedObjectName(selectedMessage);
                        if (linkedObject) {
                          return (
                            <Badge variant="outline">
                              <Link className="h-3 w-3 mr-1" />
                              {linkedObject.type}: {linkedObject.name}
                            </Badge>
                          );
                        }
                        return <span className="text-sm text-muted-foreground">Nessun collegamento</span>;
                      })()}
                      {selectedMessage.confidenceScore && (
                        <Badge variant="secondary">
                          Confidenza: {Math.round((selectedMessage.confidenceScore ? Number(selectedMessage.confidenceScore) : 0) * 100)}%
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>

                {/* Message Body - occupa tutto lo spazio rimanente */}
                <div className="flex-1 min-h-0 border-t">
                  <div className="h-full p-6 overflow-auto">
                    {selectedMessage.htmlBody ? (
                      <div 
                        className="prose prose-sm max-w-none"
                        dangerouslySetInnerHTML={{ __html: selectedMessage.htmlBody }}
                      />
                    ) : (
                      <div className="whitespace-pre-wrap text-sm">
                        {selectedMessage.body || 'Nessun contenuto'}
                      </div>
                    )}
                  </div>
                </div>

                {/* Attachments Section */}
                {selectedMessage.attachments && selectedMessage.attachments.length > 0 && (
                  <div className="border-t bg-muted/30">
                    <div className="p-6 space-y-4">
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4" />
                        <h4 className="font-medium">
                          Allegati ({selectedMessage.attachments.length})
                        </h4>
                      </div>
                      <div className="space-y-2">
                        {selectedMessage.attachments.map((filename, index) => {
                          const fileInfo = getFileType(filename);
                          return (
                            <div 
                              key={index}
                              className="flex items-center justify-between p-2 border rounded-lg hover:bg-muted/50 transition-colors"
                            >
                              <div className="flex items-center gap-3 min-w-0 flex-1">
                                <div className="text-center flex-shrink-0">
                                  <div className="text-lg">{fileInfo.icon}</div>
                                </div>
                                <div className="min-w-0 flex-1">
                                  <div 
                                    className="text-sm font-medium truncate"
                                    title={filename}
                                  >
                                    {filename}
                                  </div>
                                  <div className="text-xs text-muted-foreground">{fileInfo.type}</div>
                                </div>
                              </div>
                              <Button
                                size="sm" 
                                variant="outline"
                                onClick={() => {
                                  const link = document.createElement('a');
                                  link.href = `/api/messages/${selectedMessage.id}/attachments/${encodeURIComponent(filename)}`;
                                  link.download = filename;
                                  link.click();
                                }}
                                data-testid={`download-attachment-${index}`}
                              >
                                <FileText className="h-3 w-3 mr-1" />
                                Scarica
                              </Button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
            </Panel>
          </PanelGroup>
        </main>
  </div>

  {/* Create Message Dialog */}
  <Dialog open={showNewMessageDialog} onOpenChange={setShowNewMessageDialog}>
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Nuovo Messaggio</DialogTitle>
      </DialogHeader>
      <MessageForm onSuccess={() => setShowNewMessageDialog(false)} />
    </DialogContent>
  </Dialog>
</div>
);
}