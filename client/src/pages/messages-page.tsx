import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
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
  RefreshCw
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
        </div>
        <main className="p-6 space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Message List */}
            <Card className="lg:col-span-1">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Mail className="h-5 w-5" />
                  Lista Messaggi
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <ScrollArea className="h-[600px]">
                  {messages.length === 0 ? (
                    <div className="p-6 text-center text-muted-foreground">
                      <Mail className="h-12 w-12 mx-auto mb-4 opacity-50" />
                      <p>Nessun messaggio ricevuto</p>
                    </div>
                  ) : (
                    <div className="space-y-1">
                      {messages.map((message) => {
                        const linkedObject = getLinkedObjectName(message);
                        
                        return (
                          <div
                        key={message.id}
                        data-testid={`message-item-${message.id}`}
                        className={`p-4 border-b cursor-pointer hover:bg-muted/50 transition-colors ${
                          selectedMessage?.id === message.id ? 'bg-muted' : ''
                        } ${message.status === 'unread' ? 'border-l-4 border-l-blue-500' : ''}`}
                        onClick={() => handleSelectMessage(message)}
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              {getStatusIcon(message.status)}
                              <span className="text-sm font-medium truncate">
                                {message.fromName || message.fromEmail}
                              </span>
                            </div>
                            <p className="text-sm font-semibold text-foreground truncate mb-1">
                              {message.subject || 'Nessun oggetto'}
                            </p>
                            <p className="text-xs text-muted-foreground truncate mb-2">
                              {message.body ? message.body.substring(0, 80) + '...' : 'Nessun contenuto'}
                            </p>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              <Clock className="h-3 w-3" />
                              {format(new Date(message.receivedAt), 'dd MMM HH:mm')}
                            </div>
                            {linkedObject && (
                              <div className="mt-2">
                                <Badge variant="outline" className="text-xs">
                                  <Link className="h-3 w-3 mr-1" />
                                  {linkedObject.type}: {linkedObject.name}
                                </Badge>
                              </div>
                            )}
                            {message.confidenceScore && (
                              <div className="mt-1">
                                <span className={`text-xs font-medium ${getConfidenceColor(message.confidenceScore ? Number(message.confidenceScore) : 0)}`}>
                                  Confidenza: {Math.round((message.confidenceScore ? Number(message.confidenceScore) : 0) * 100)}%
                                </span>
                              </div>
                            )}
                          </div>
                          <Badge 
                            variant="secondary" 
                            className={`${getStatusColor(message.status)} text-white text-xs`}
                          >
                            {message.status}
                          </Badge>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </ScrollArea>
          </CardContent>
            </Card>

            {/* Message Detail */}
            <Card className="lg:col-span-2">
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
                </div>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!selectedMessage ? (
              <div className="flex items-center justify-center h-96 text-center text-muted-foreground">
                <div>
                  <Mail className="h-16 w-16 mx-auto mb-4 opacity-50" />
                  <p className="text-lg font-medium">Seleziona un messaggio</p>
                  <p className="text-sm">Clicca su un messaggio per visualizzare i dettagli</p>
                </div>
              </div>
            ) : (
              <div className="space-y-6">
                {/* Message Header */}
                <div className="space-y-4">
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

                  <Separator />

                  {/* Email Details */}
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

                  {/* Destinatari Originali Estratti */}
                  {((selectedMessage.originalToEmails && selectedMessage.originalToEmails.length > 0) || 
                    (selectedMessage.originalCcEmails && selectedMessage.originalCcEmails.length > 0) || 
                    (selectedMessage.originalBccEmails && selectedMessage.originalBccEmails.length > 0)) && (
                    <>
                      <Separator />
                      <div className="space-y-3">
                        <div className="flex items-center gap-2">
                          <User className="h-4 w-4" />
                          <h4 className="font-medium">Destinatari Originali</h4>
                          <Badge variant="outline" className="text-xs">
                            Estratti dall'email inoltrata
                          </Badge>
                        </div>
                        
                        {selectedMessage.originalToEmails && selectedMessage.originalToEmails.length > 0 && (
                          <div className="space-y-2">
                            <span className="text-sm font-medium text-muted-foreground">
                              TO ({selectedMessage.originalToEmails.length}):
                            </span>
                            <div className="flex flex-wrap gap-1">
                              {selectedMessage.originalToEmails.map((email, index) => (
                                <Badge key={index} variant="secondary" className="text-xs">
                                  {email}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        )}
                        
                        {selectedMessage.originalCcEmails && selectedMessage.originalCcEmails.length > 0 && (
                          <div className="space-y-2">
                            <span className="text-sm font-medium text-muted-foreground">
                              CC ({selectedMessage.originalCcEmails.length}):
                            </span>
                            <div className="flex flex-wrap gap-1">
                              {selectedMessage.originalCcEmails.map((email, index) => (
                                <Badge key={index} variant="outline" className="text-xs">
                                  {email}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        )}
                        
                        {selectedMessage.originalBccEmails && selectedMessage.originalBccEmails.length > 0 && (
                          <div className="space-y-2">
                            <span className="text-sm font-medium text-muted-foreground">
                              BCC ({selectedMessage.originalBccEmails.length}):
                            </span>
                            <div className="flex flex-wrap gap-1">
                              {selectedMessage.originalBccEmails.map((email, index) => (
                                <Badge key={index} variant="destructive" className="text-xs">
                                  {email}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </>
                  )}

                  {/* Current Associations */}
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
                    {selectedMessage.matchingReason && (
                      <p className="text-sm text-muted-foreground italic">
                        Motivo: {selectedMessage.matchingReason}
                      </p>
                    )}
                  </div>
                </div>

                <Separator />

                {/* Message Body */}
                <div className="space-y-4">
                  <h4 className="font-medium">Contenuto:</h4>
                  <ScrollArea className="h-64 w-full border rounded-md">
                    <div className="p-4">
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
                  </ScrollArea>
                </div>

                {/* Attachments Section */}
                {selectedMessage.attachments && selectedMessage.attachments.length > 0 && (
                  <>
                    <Separator />
                    <div className="space-y-4">
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
                  </>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
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