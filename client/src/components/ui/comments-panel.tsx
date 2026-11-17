import { useState, type KeyboardEvent } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format, formatDistanceToNow } from "date-fns";
import { it } from "date-fns/locale";
import { MessageSquareText, Pencil, Trash2, Send, Lock, Globe, Loader2, RotateCcw } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest, getQueryFn } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import type { Comment } from "@shared/schema";

// Stesso limite del server (server/comment-input.ts).
const COMMENT_MAX_LENGTH = 10000;
const SHOW_COUNTER_FROM = COMMENT_MAX_LENGTH - 500;

export type CommentTarget = "project" | "task" | "message";

const TARGET_FIELD: Record<CommentTarget, "projectId" | "taskId" | "messageId"> = {
  project: "projectId",
  task: "taskId",
  message: "messageId",
};

const TARGET_LABEL: Record<CommentTarget, string> = {
  project: "progetto",
  task: "task",
  message: "messaggio",
};

interface CommentsPanelProps {
  target: CommentTarget;
  recordId: string;
  title?: string;
  /** Versione compatta, senza card, per pannelli laterali (es. dettaglio messaggio). */
  compact?: boolean;
}

function initials(firstName?: string | null, lastName?: string | null) {
  return `${firstName?.charAt(0) ?? ""}${lastName?.charAt(0) ?? ""}`.toUpperCase() || "?";
}

function isEdited(comment: Comment) {
  return new Date(comment.updatedAt).getTime() - new Date(comment.createdAt).getTime() > 1000;
}

function errorText(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  // apiRequest produce "400: {"error":"..."}": mostra solo il motivo quando c'è.
  const match = message.match(/^\d{3}: ([\s\S]*)$/);
  if (match) {
    try {
      const body = JSON.parse(match[1]);
      if (typeof body?.error === "string") return body.error;
    } catch {
      /* testo semplice */
    }
    return match[1];
  }
  return message;
}

function VisibilityBadge({ isInternal }: { isInternal: boolean }) {
  return isInternal ? (
    <Badge variant="secondary" className="gap-1 text-[11px] font-normal">
      <Lock className="h-3 w-3" aria-hidden />
      Interno
    </Badge>
  ) : (
    <Badge variant="outline" className="gap-1 text-[11px] font-normal border-primary/40 text-primary">
      <Globe className="h-3 w-3" aria-hidden />
      Esterno
    </Badge>
  );
}

function VisibilitySwitch({
  id,
  isInternal,
  onChange,
  disabled,
}: {
  id: string;
  isInternal: boolean;
  onChange: (isInternal: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <Switch
        id={id}
        checked={!isInternal}
        onCheckedChange={(external) => onChange(!external)}
        disabled={disabled}
        aria-describedby={`${id}-hint`}
      />
      <Label htmlFor={id} className="text-xs font-normal text-muted-foreground cursor-pointer">
        {isInternal ? "Interno" : "Esterno"}
      </Label>
      <span id={`${id}-hint`} className="sr-only">
        Attivo: comunicazione esterna. Spento: nota interna.
      </span>
    </div>
  );
}

function CharCounter({ length }: { length: number }) {
  if (length < SHOW_COUNTER_FROM) return null;
  return (
    <span
      className={cn("text-xs tabular-nums", length > COMMENT_MAX_LENGTH ? "text-destructive" : "text-muted-foreground")}
      aria-live="polite"
    >
      {length}/{COMMENT_MAX_LENGTH}
    </span>
  );
}

export function CommentsPanel({ target, recordId, title = "Commenti", compact = false }: CommentsPanelProps) {
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const queryKey = ["/api/comments", target, recordId];

  const [draft, setDraft] = useState("");
  const [draftInternal, setDraftInternal] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [editInternal, setEditInternal] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<Comment | null>(null);

  const {
    data: comments = [],
    isLoading,
    isError,
    refetch,
  } = useQuery<Comment[]>({
    queryKey,
    queryFn: getQueryFn({ on401: "throw" }),
    enabled: !!recordId,
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey });
  const fail = (title: string) => (error: unknown) =>
    toast({ title, description: errorText(error), variant: "destructive" });

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/comments", {
        content: draft.trim(),
        isInternal: draftInternal,
        [TARGET_FIELD[target]]: recordId,
      });
      return res.json();
    },
    onSuccess: () => {
      setDraft("");
      refresh();
    },
    onError: fail("Commento non salvato"),
  });

  const updateMutation = useMutation({
    mutationFn: async (vars: { id: string; content: string; isInternal: boolean }) => {
      const res = await apiRequest("PUT", `/api/comments/${vars.id}`, {
        content: vars.content,
        isInternal: vars.isInternal,
      });
      return res.json();
    },
    onSuccess: () => {
      setEditingId(null);
      refresh();
    },
    onError: fail("Modifica non salvata"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/comments/${id}`),
    onSuccess: () => {
      setDeleteTarget(null);
      refresh();
      toast({ title: "Commento eliminato" });
    },
    onError: fail("Commento non eliminato"),
  });

  const draftLength = draft.trim().length;
  const canSend = draftLength > 0 && draftLength <= COMMENT_MAX_LENGTH && !createMutation.isPending;
  const editLength = editText.trim().length;
  const canSaveEdit = editLength > 0 && editLength <= COMMENT_MAX_LENGTH && !updateMutation.isPending;

  const startEdit = (comment: Comment) => {
    setEditingId(comment.id);
    setEditText(comment.content);
    setEditInternal(comment.isInternal);
  };

  const saveEdit = () => {
    if (!editingId || !canSaveEdit) return;
    updateMutation.mutate({ id: editingId, content: editText.trim(), isInternal: editInternal });
  };

  const onDraftKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      if (canSend) createMutation.mutate();
    }
  };

  const onEditKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation(); // non chiudere il dialog che contiene il pannello
      setEditingId(null);
    } else if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      saveEdit();
    }
  };

  const authorName = user ? `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim() || "Tu" : "Tu";
  const authorInitials = initials(user?.firstName, user?.lastName);
  const composerId = `comment-${target}-${recordId}`;

  const list = (() => {
    if (isLoading) {
      return (
        <div className="space-y-3" aria-busy="true" aria-label="Caricamento commenti">
          {[0, 1].map((i) => (
            <div key={i} className="flex gap-3">
              <Skeleton className="h-8 w-8 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-3 w-40" />
                <Skeleton className="h-10 w-full" />
              </div>
            </div>
          ))}
        </div>
      );
    }
    if (isError) {
      return (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 p-4 text-sm flex items-center justify-between gap-3">
          <span>Impossibile caricare i commenti.</span>
          <Button size="sm" variant="outline" onClick={() => refetch()} data-testid="button-comments-retry">
            <RotateCcw className="h-4 w-4 mr-1" />
            Riprova
          </Button>
        </div>
      );
    }
    if (comments.length === 0) {
      return (
        <div className="text-center py-6 text-muted-foreground" data-testid="comments-empty">
          <MessageSquareText className="h-8 w-8 mx-auto mb-2 opacity-50" aria-hidden />
          <p className="text-sm">Nessun commento su questo {TARGET_LABEL[target]}.</p>
          <p className="text-xs mt-1">Scrivi il primo qui sotto.</p>
        </div>
      );
    }
    return (
      <ol className={cn("space-y-4", !compact && "max-h-[28rem] overflow-y-auto pr-1")} aria-label="Elenco commenti">
        {comments.map((comment) => {
          const created = new Date(comment.createdAt);
          const isEditing = editingId === comment.id;
          return (
            <li key={comment.id} className="group flex gap-3" data-testid={`comment-${comment.id}`}>
              <Avatar className="h-8 w-8 shrink-0">
                <AvatarFallback className="text-xs">{authorInitials}</AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="text-sm font-medium">{authorName}</span>
                  <time
                    dateTime={created.toISOString()}
                    title={format(created, "d MMMM yyyy, HH:mm", { locale: it })}
                    className="text-xs text-muted-foreground"
                  >
                    {formatDistanceToNow(created, { addSuffix: true, locale: it })}
                  </time>
                  {isEdited(comment) && <span className="text-xs text-muted-foreground">· modificato</span>}
                  <VisibilityBadge isInternal={comment.isInternal} />
                  {!isEditing && (
                    <div className="ml-auto flex gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-within:opacity-100 transition-opacity">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        onClick={() => startEdit(comment)}
                        aria-label="Modifica commento"
                        title="Modifica"
                        data-testid={`button-edit-comment-${comment.id}`}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-muted-foreground hover:text-destructive"
                        onClick={() => setDeleteTarget(comment)}
                        aria-label="Elimina commento"
                        title="Elimina"
                        data-testid={`button-delete-comment-${comment.id}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  )}
                </div>

                {isEditing ? (
                  <div className="mt-2 space-y-2">
                    <Textarea
                      value={editText}
                      onChange={(e) => setEditText(e.target.value)}
                      onKeyDown={onEditKeyDown}
                      rows={3}
                      autoFocus
                      aria-label="Testo del commento"
                      data-testid={`textarea-edit-comment-${comment.id}`}
                    />
                    <div className="flex flex-wrap items-center gap-2">
                      <VisibilitySwitch
                        id={`edit-visibility-${comment.id}`}
                        isInternal={editInternal}
                        onChange={setEditInternal}
                        disabled={updateMutation.isPending}
                      />
                      <CharCounter length={editLength} />
                      <div className="ml-auto flex gap-2">
                        <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                          Annulla
                        </Button>
                        <Button
                          size="sm"
                          onClick={saveEdit}
                          disabled={!canSaveEdit}
                          data-testid={`button-save-comment-${comment.id}`}
                        >
                          {updateMutation.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                          Salva
                        </Button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="mt-1 text-sm whitespace-pre-wrap break-words">{comment.content}</p>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    );
  })();

  const composer = (
    <div className="space-y-2 border-t pt-4">
      <Label htmlFor={composerId} className="sr-only">
        Nuovo commento
      </Label>
      <Textarea
        id={composerId}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={onDraftKeyDown}
        placeholder={`Scrivi un commento sul ${TARGET_LABEL[target]}…`}
        rows={compact ? 2 : 3}
        disabled={!recordId}
        data-testid="textarea-new-comment"
      />
      <div className="flex flex-wrap items-center gap-3">
        <VisibilitySwitch
          id={`${composerId}-visibility`}
          isInternal={draftInternal}
          onChange={setDraftInternal}
          disabled={createMutation.isPending}
        />
        <CharCounter length={draftLength} />
        <span className="hidden sm:inline text-xs text-muted-foreground ml-auto">Ctrl/⌘ + Invio per inviare</span>
        <Button
          size="sm"
          className="sm:ml-0 ml-auto"
          onClick={() => createMutation.mutate()}
          disabled={!canSend}
          data-testid="button-add-comment"
        >
          {createMutation.isPending ? (
            <Loader2 className="h-4 w-4 mr-1 animate-spin" />
          ) : (
            <Send className="h-4 w-4 mr-1" />
          )}
          Commenta
        </Button>
      </div>
    </div>
  );

  const deleteDialog = (
    <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Eliminare il commento?</AlertDialogTitle>
          <AlertDialogDescription>
            Il commento verrà rimosso definitivamente da questo {TARGET_LABEL[target]}.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {deleteTarget && (
          <p className="rounded-md bg-muted p-3 text-sm whitespace-pre-wrap break-words line-clamp-4">
            {deleteTarget.content}
          </p>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel>Annulla</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              if (deleteTarget) deleteMutation.mutate(deleteTarget.id);
            }}
            disabled={deleteMutation.isPending}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            data-testid="button-confirm-delete-comment"
          >
            {deleteMutation.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
            Elimina
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  const header = (
    <div className="flex items-center gap-2">
      <MessageSquareText className={compact ? "h-4 w-4" : "h-5 w-5"} aria-hidden />
      <span>{title}</span>
      {!isLoading && !isError && <Badge variant="outline">{comments.length}</Badge>}
    </div>
  );
  const hint = "Visibili solo a te. «Esterno» segna il commento come comunicazione verso il cliente.";

  if (compact) {
    return (
      <section className="space-y-3" aria-label={title} data-testid={`comments-panel-${target}`}>
        <div>
          <h4 className="text-sm font-medium">{header}</h4>
          <p className="text-xs text-muted-foreground mt-1">{hint}</p>
        </div>
        {list}
        {composer}
        {deleteDialog}
      </section>
    );
  }

  return (
    <Card data-testid={`comments-panel-${target}`}>
      <CardHeader>
        <CardTitle className="text-base">{header}</CardTitle>
        <CardDescription>{hint}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {list}
        {composer}
      </CardContent>
      {deleteDialog}
    </Card>
  );
}
