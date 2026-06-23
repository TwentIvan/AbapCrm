import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, ChevronRight, Clock, Edit, Plus, Trash } from "lucide-react";
import { formatDistance } from "date-fns";
import { it } from "date-fns/locale";
import { apiRequest } from "@/lib/queryClient";

interface AuditHistoryProps {
  tableName: string;
  recordId: string;
  title?: string;
}

interface AuditLogEntry {
  id: string;
  action: "CREATE" | "UPDATE" | "DELETE";
  oldValues: string | null;
  newValues: string | null;
  changedFields: string[] | null;
  createdAt: string;
  user: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
  };
  userAgent: string | null;
  ipAddress: string | null;
  fieldChanges?: Array<{
    field: string;
    oldValue: string;
    newValue: string;
  }>;
}

const actionConfig = {
  CREATE: {
    icon: Plus,
    label: "Creazione",
    color: "bg-success/10 text-success",
  },
  UPDATE: {
    icon: Edit,
    label: "Modifica",
    color: "bg-primary/10 text-primary",
  },
  DELETE: {
    icon: Trash,
    label: "Eliminazione",
    color: "bg-destructive/10 text-destructive",
  },
};

function FieldChange({ field, oldValue, newValue }: { field: string; oldValue: any; newValue: any }) {
  const [isExpanded, setIsExpanded] = useState(false);
  
  const formatValue = (value: any) => {
    if (value === null || value === undefined) return "vuoto";
    if (typeof value === "boolean") return value ? "Sì" : "No";
    if (typeof value === "string" && value.length > 50) {
      return isExpanded ? value : `${value.substring(0, 50)}...`;
    }
    return String(value);
  };

  const hasLongValue = (value: any) => {
    return typeof value === "string" && value.length > 50;
  };

  return (
    <div className="space-y-1">
      <div className="text-sm font-medium text-foreground capitalize">
        {field.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())}
      </div>
      <div className="text-xs space-y-1">
        <div className="flex items-start space-x-2">
          <span className="text-muted-foreground min-w-0 flex-shrink-0">Prima:</span>
          <span className="text-destructive dark:text-destructive break-words">
            {formatValue(oldValue)}
          </span>
        </div>
        <div className="flex items-start space-x-2">
          <span className="text-muted-foreground min-w-0 flex-shrink-0">Dopo:</span>
          <span className="text-success dark:text-success break-words">
            {formatValue(newValue)}
          </span>
        </div>
        {(hasLongValue(oldValue) || hasLongValue(newValue)) && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsExpanded(!isExpanded)}
            className="text-xs h-auto p-1"
          >
            {isExpanded ? "Mostra meno" : "Mostra tutto"}
          </Button>
        )}
      </div>
    </div>
  );
}

function AuditEntry({ entry }: { entry: AuditLogEntry }) {
  const actionInfo = actionConfig[entry.action];
  const ActionIcon = actionInfo.icon;
  
  // Format date and time
  const createdDate = new Date(entry.createdAt);
  const dateStr = createdDate.toLocaleDateString('it-IT');
  const timeStr = createdDate.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });

  return (
    <div className="border border-border rounded-lg p-4 space-y-3">
      {/* Header with action, date and time */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <ActionIcon className="h-4 w-4" />
          <Badge variant="secondary" className={actionInfo.color}>
            {actionInfo.label}
          </Badge>
        </div>
        <div className="text-xs text-muted-foreground">
          {dateStr} • {timeStr}
        </div>
      </div>

      {/* Field changes - compact display */}
      {entry.fieldChanges && entry.fieldChanges.length > 0 && (
        <div className="space-y-2">
          {entry.fieldChanges.map((change: any, idx: number) => (
            <div key={idx} className="bg-muted/30 rounded-lg p-3 space-y-2">
              <div className="font-medium text-sm text-foreground">
                {change.field.replace(/([A-Z])/g, ' $1').replace(/^./, (str: string) => str.toUpperCase())}
              </div>
              <div className="text-xs space-y-1">
                <div className="flex items-start space-x-2">
                  <span className="text-muted-foreground min-w-0 flex-shrink-0">Da:</span>
                  <span className="font-mono bg-destructive/10 text-destructive px-2 py-1 rounded text-xs break-all">
                    {change.oldValue || "vuoto"}
                  </span>
                </div>
                <div className="flex items-start space-x-2">
                  <span className="text-muted-foreground min-w-0 flex-shrink-0">A:</span>
                  <span className="font-mono bg-success/10 text-success px-2 py-1 rounded text-xs break-all">
                    {change.newValue || "vuoto"}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Fallback for entries without detailed fieldChanges */}
      {(!entry.fieldChanges || entry.fieldChanges.length === 0) && entry.changedFields && entry.changedFields.length > 0 && (
        <div className="text-sm text-muted-foreground">
          Campi modificati: {entry.changedFields.filter(f => f !== 'id').join(', ')}
        </div>
      )}

      {/* User info at bottom */}
      <div className="text-xs text-muted-foreground border-t border-border pt-2">
        <span className="font-medium">{entry.user.firstName} {entry.user.lastName}</span>
        <span className="ml-2">({entry.user.email})</span>
      </div>
    </div>
  );
}

export default function AuditHistory({ tableName, recordId, title = "Storico Modifiche" }: AuditHistoryProps) {
  const { data: auditLogs = [], isLoading, error } = useQuery<AuditLogEntry[]>({
    queryKey: [`audit`, tableName, recordId],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/audit/${tableName}/${recordId}`);
      return res.json();
    },
    staleTime: 0, // Always refresh
    refetchOnMount: true, // Always refetch when component mounts
    enabled: !!(tableName && recordId), // Only run when we have both params
  });

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-destructive">Errore</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Impossibile caricare lo storico delle modifiche.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card data-testid="audit-history-card">
      <CardHeader>
        <CardTitle className="flex items-center space-x-2">
          <Clock className="h-5 w-5" />
          <span>{title}</span>
        </CardTitle>
        <CardDescription>
          Cronologia completa di tutte le modifiche apportate a questo elemento
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="border border-border rounded-lg p-4 animate-pulse">
                <div className="h-4 bg-muted rounded w-1/3 mb-2"></div>
                <div className="h-3 bg-muted rounded w-1/2"></div>
              </div>
            ))}
          </div>
        ) : auditLogs.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Clock className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>Nessuna modifica registrata per questo elemento.</p>
          </div>
        ) : (
          <ScrollArea className="h-96">
            <div className="space-y-4">
              {auditLogs.map((entry) => (
                <AuditEntry key={entry.id} entry={entry} />
              ))}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}