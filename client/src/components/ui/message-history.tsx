import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, getQueryFn } from "@/lib/queryClient";
import { formatDistanceToNow } from "date-fns";
import { Mail, MessageSquare, Link as LinkIcon, Trash2, Eye, Plus, ExternalLink } from "lucide-react";
import DOMPurify from "dompurify";
import { Link } from "wouter";

interface MessageHistoryProps {
  tableName: string;
  recordId: string;
  title?: string;
  showAddLink?: boolean;
}

interface MessageLink {
  id: string;
  messageId: string;
  linkedTableName: string;
  linkedRecordId: string;
  notes?: string;
  createdAt: string;
  user: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
  };
  message: {
    id: string;
    subject: string;
    from: string;
    to: string;
    messageId: string;
    body: string;
    htmlBody?: string;
    receivedAt: string;
    user: {
      id: string;
      firstName: string;
      lastName: string;
      email: string;
    };
  };
}

export function MessageHistory({ tableName, recordId, title = "Message History", showAddLink = true }: MessageHistoryProps) {
  const [selectedMessageId, setSelectedMessageId] = useState<string>("");
  const [linkNotes, setLinkNotes] = useState("");
  const [expandedMessages, setExpandedMessages] = useState<Set<string>>(new Set());
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: messageLinks, isLoading } = useQuery({
    queryKey: ["/api/message-links", tableName, recordId],
    queryFn: getQueryFn({ on401: "throw" }),
    enabled: !!tableName && !!recordId,
  });

  const { data: availableMessages } = useQuery({
    queryKey: ["/api/messages"],
    queryFn: getQueryFn({ on401: "throw" }),
    enabled: showAddLink,
  });

  const createLinkMutation = useMutation({
    mutationFn: (data: { messageId: string; linkedTableName: string; linkedRecordId: string; notes?: string }) =>
      apiRequest("POST", "/api/message-links", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/message-links", tableName, recordId] });
      setSelectedMessageId("");
      setLinkNotes("");
      toast({
        title: "Message linked successfully",
        description: "The message has been linked to this record.",
      });
    },
    onError: (error) => {
      toast({
        variant: "destructive",
        title: "Error linking message",
        description: error instanceof Error ? error.message : "Failed to link message",
      });
    },
  });

  const deleteLinkMutation = useMutation({
    mutationFn: (linkId: string) => apiRequest("DELETE", `/api/message-links/${linkId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/message-links", tableName, recordId] });
      toast({
        title: "Message link removed",
        description: "The message link has been removed.",
      });
    },
    onError: (error) => {
      toast({
        variant: "destructive",
        title: "Error removing link",
        description: error instanceof Error ? error.message : "Failed to remove message link",
      });
    },
  });

  const toggleMessageExpansion = (messageId: string) => {
    const newExpanded = new Set(expandedMessages);
    if (newExpanded.has(messageId)) {
      newExpanded.delete(messageId);
    } else {
      newExpanded.add(messageId);
    }
    setExpandedMessages(newExpanded);
  };

  const getMessageTypeIcon = (message: any) => {
    // In the future, we could determine type from message source
    return <Mail className="h-4 w-4" />;
  };

  const getMessageTypeBadge = (message: any) => {
    // In the future, we could determine type from message source
    return <Badge variant="secondary">Email</Badge>;
  };

  const getUserInitials = (firstName: string, lastName: string) => {
    return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
  };

  const getLinkedMessages = (messageLinks as MessageLink[]) || [];
  const unlinkedMessages = (availableMessages as any[])?.filter(
    (msg: any) => !getLinkedMessages.some((link: MessageLink) => link.messageId === msg.id)
  ) || [];

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5" />
            {title}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">Loading message history...</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5" />
            {title}
            <Badge variant="outline">{getLinkedMessages.length}</Badge>
          </div>
          {showAddLink && unlinkedMessages.length > 0 && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button size="sm" variant="outline" data-testid="button-add-message-link">
                  <Plus className="h-4 w-4 mr-1" />
                  Link Message
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent className="max-w-2xl">
                <AlertDialogHeader>
                  <AlertDialogTitle>Link Message to {tableName.charAt(0).toUpperCase() + tableName.slice(1)}</AlertDialogTitle>
                  <AlertDialogDescription>
                    Select a message to link to this record. You can add notes to explain the connection.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <div className="space-y-4">
                  <div>
                    <label className="text-sm font-medium mb-2 block">Select Message</label>
                    <ScrollArea className="h-48 border rounded-md p-2">
                      {unlinkedMessages.map((message: any) => (
                        <div
                          key={message.id}
                          className={`p-2 cursor-pointer rounded border mb-2 ${
                            selectedMessageId === message.id ? "border-primary bg-accent" : "border-muted"
                          }`}
                          onClick={() => setSelectedMessageId(message.id)}
                          data-testid={`message-option-${message.id}`}
                        >
                          <div className="flex items-center gap-2 mb-1">
                            {getMessageTypeIcon(message)}
                            <span className="font-medium text-sm">{message.subject}</span>
                            {getMessageTypeBadge(message)}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            From: {message.from} • {formatDistanceToNow(new Date(message.receivedAt), { addSuffix: true })}
                          </div>
                        </div>
                      ))}
                    </ScrollArea>
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-2 block">Notes (Optional)</label>
                    <Textarea
                      placeholder="Add notes about why this message is linked to this record..."
                      value={linkNotes}
                      onChange={(e) => setLinkNotes(e.target.value)}
                      data-testid="textarea-link-notes"
                    />
                  </div>
                </div>
                <AlertDialogFooter>
                  <AlertDialogCancel data-testid="button-cancel-link">Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => {
                      if (!selectedMessageId) return;
                      createLinkMutation.mutate({
                        messageId: selectedMessageId,
                        linkedTableName: tableName,
                        linkedRecordId: recordId,
                        notes: linkNotes || undefined,
                      });
                    }}
                    disabled={!selectedMessageId || createLinkMutation.isPending}
                    data-testid="button-confirm-link"
                  >
                    {createLinkMutation.isPending ? "Linking..." : "Link Message"}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {getLinkedMessages.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <MessageSquare className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No messages linked to this record yet.</p>
            {showAddLink && unlinkedMessages.length > 0 && (
              <p className="text-sm mt-2">Click "Link Message" to connect an existing message.</p>
            )}
          </div>
        ) : (
          <ScrollArea className="h-96">
            <div className="space-y-4">
              {getLinkedMessages.map((link: MessageLink) => (
                <div key={link.id} className="border rounded-lg p-4" data-testid={`message-link-${link.id}`}>
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <Avatar className="h-8 w-8">
                        <AvatarFallback className="text-xs">
                          {getUserInitials(link.message.user.firstName, link.message.user.lastName)}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <div className="flex items-center gap-2">
                          {getMessageTypeIcon(link.message)}
                          <h4 className="font-medium text-sm">{link.message.subject}</h4>
                          {getMessageTypeBadge(link.message)}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          From: {link.message.from} • {formatDistanceToNow(new Date(link.message.receivedAt), { addSuffix: true })}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <Link href={`/messages?id=${link.message.id}`}>
                        <Button
                          size="sm"
                          variant="ghost"
                          title="Open in Messages"
                          data-testid={`button-open-message-${link.message.id}`}
                        >
                          <ExternalLink className="h-4 w-4" />
                        </Button>
                      </Link>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => toggleMessageExpansion(link.message.id)}
                        title="Toggle content preview"
                        data-testid={`button-toggle-message-${link.message.id}`}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button size="sm" variant="ghost" data-testid={`button-delete-link-${link.id}`}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Remove Message Link</AlertDialogTitle>
                            <AlertDialogDescription>
                              Are you sure you want to remove this message link? This action cannot be undone.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => deleteLinkMutation.mutate(link.id)}
                              disabled={deleteLinkMutation.isPending}
                            >
                              {deleteLinkMutation.isPending ? "Removing..." : "Remove Link"}
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </div>

                  {link.notes && (
                    <div className="mb-3">
                      <div className="flex items-center gap-2 mb-1">
                        <LinkIcon className="h-3 w-3" />
                        <span className="text-xs font-medium text-muted-foreground">Link Notes</span>
                      </div>
                      <p className="text-sm bg-muted p-2 rounded">{link.notes}</p>
                    </div>
                  )}

                  {expandedMessages.has(link.message.id) && (
                    <>
                      <Separator className="my-3" />
                      <div className="space-y-2">
                        <div className="text-xs font-medium text-muted-foreground">Message Content</div>
                        <div className="bg-muted p-3 rounded text-sm max-h-96 overflow-y-auto">
                          {link.message.htmlBody ? (
                            <div 
                              className="prose prose-sm max-w-none"
                              dangerouslySetInnerHTML={{ 
                                __html: DOMPurify.sanitize(link.message.htmlBody, {
                                  ALLOWED_TAGS: ['p', 'div', 'span', 'br', 'strong', 'em', 'b', 'i', 'u', 'ul', 'ol', 'li', 'a', 'img', 'table', 'tr', 'td', 'th', 'thead', 'tbody', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'pre', 'code'],
                                  ALLOWED_ATTR: ['href', 'src', 'alt', 'class', 'width', 'height', 'target'],
                                  FORBID_TAGS: ['style', 'script', 'form', 'input', 'button'],
                                  FORBID_ATTR: ['style', 'onclick', 'onload', 'onerror']
                                })
                              }}
                            />
                          ) : (
                            <div className="whitespace-pre-wrap">
                              {link.message.body}
                            </div>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          To: {link.message.to}
                        </div>
                      </div>
                    </>
                  )}

                  <div className="mt-3 pt-2 border-t">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span>Linked by {link.user.firstName} {link.user.lastName}</span>
                      <span>•</span>
                      <span>{formatDistanceToNow(new Date(link.createdAt), { addSuffix: true })}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}