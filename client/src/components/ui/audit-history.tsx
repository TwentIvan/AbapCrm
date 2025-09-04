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
    color: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  },
  UPDATE: {
    icon: Edit,
    label: "Modifica",
    color: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  },
  DELETE: {
    icon: Trash,
    label: "Eliminazione",
    color: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
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
          <span className="text-red-600 dark:text-red-400 break-words">
            {formatValue(oldValue)}
          </span>
        </div>
        <div className="flex items-start space-x-2">
          <span className="text-muted-foreground min-w-0 flex-shrink-0">Dopo:</span>
          <span className="text-green-600 dark:text-green-400 break-words">
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
  const [isExpanded, setIsExpanded] = useState(false);
  const actionInfo = actionConfig[entry.action];
  const ActionIcon = actionInfo.icon;
  
  // Handle case where JSONB values are null to avoid parsing errors
  const oldValues = {};
  const newValues = {};
  const changedFields = entry.changedFields || [];

  const timeAgo = formatDistance(new Date(entry.createdAt), new Date(), { 
    addSuffix: true,
    locale: it 
  });

  return (
    <div className="border border-border rounded-lg p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="flex items-center space-x-2">
            <ActionIcon className="h-4 w-4" />
            <Badge variant="secondary" className={actionInfo.color}>
              {actionInfo.label}
            </Badge>
          </div>
          <div className="text-sm text-muted-foreground">
            <Clock className="h-3 w-3 inline mr-1" />
            {timeAgo}
          </div>
        </div>
        {changedFields.length > 0 && (
          <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="text-xs">
                {changedFields.length} campo{changedFields.length > 1 ? 'i' : ''} modificat{changedFields.length > 1 ? 'i' : 'o'}
                {isExpanded ? (
                  <ChevronDown className="h-3 w-3 ml-1" />
                ) : (
                  <ChevronRight className="h-3 w-3 ml-1" />
                )}
              </Button>
            </CollapsibleTrigger>
          </Collapsible>
        )}
      </div>

      <div className="flex items-center space-x-2 text-sm">
        <span className="text-muted-foreground">da</span>
        <span className="font-medium text-foreground">
          {entry.user.firstName} {entry.user.lastName}
        </span>
        <span className="text-muted-foreground text-xs">({entry.user.email})</span>
      </div>

      {changedFields.length > 0 && (
        <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
          <CollapsibleContent className="space-y-3">
            <Separator />
            <div className="space-y-4">
              {entry.fieldChanges && entry.fieldChanges.length > 0 ? (
                entry.fieldChanges.map((change: any, idx: number) => (
                  <div key={idx} className="p-3 bg-muted/30 rounded-lg">
                    <div className="text-sm font-medium text-foreground capitalize">
                      {change.field.replace(/([A-Z])/g, ' $1').replace(/^./, (str: string) => str.toUpperCase())}
                    </div>
                    <div className="text-xs space-y-1 mt-1">
                      {change.oldValue && (
                        <div className="flex items-start space-x-2">
                          <span className="text-muted-foreground min-w-0 flex-shrink-0">Prima:</span>
                          <span className="text-red-600 dark:text-red-400 break-words">
                            {change.oldValue}
                          </span>
                        </div>
                      )}
                      <div className="flex items-start space-x-2">
                        <span className="text-muted-foreground min-w-0 flex-shrink-0">Dopo:</span>
                        <span className="text-green-600 dark:text-green-400 break-words">
                          {change.newValue}
                        </span>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                changedFields.map((field) => (
                  <div key={field} className="p-3 bg-muted/30 rounded-lg">
                    <div className="text-sm font-medium text-foreground capitalize">
                      {field.replace(/([A-Z])/g, ' $1').replace(/^./, (str: string) => str.toUpperCase())}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      Campo modificato
                    </div>
                  </div>
                ))
              )}
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}

      {entry.action === "CREATE" && newValues && (
        <div className="text-xs text-muted-foreground">
          Record creato con {Object.keys(newValues).length} campi
        </div>
      )}

      {entry.action === "DELETE" && oldValues && (
        <div className="text-xs text-muted-foreground">
          Record eliminato (conteneva {Object.keys(oldValues).length} campi)
        </div>
      )}

      {entry.ipAddress && (
        <div className="text-xs text-muted-foreground">
          IP: {entry.ipAddress}
        </div>
      )}
    </div>
  );
}

export default function AuditHistory({ tableName, recordId, title = "Storico Modifiche" }: AuditHistoryProps) {
  console.log(`[AUDIT-FRONTEND] AuditHistory called with tableName=${tableName}, recordId=${recordId}`);
  
  const { data: auditLogs = [], isLoading, error } = useQuery<AuditLogEntry[]>({
    queryKey: [`audit`, tableName, recordId],
    queryFn: async () => {
      console.log(`[AUDIT-FRONTEND] Executing query for /api/audit/${tableName}/${recordId}`);
      const res = await apiRequest("GET", `/api/audit/${tableName}/${recordId}`);
      const data = await res.json();
      console.log(`[AUDIT-FRONTEND] API response:`, data);
      return data;
    },
    staleTime: 0, // Always refresh
    refetchOnMount: true, // Always refetch when component mounts
    enabled: !!(tableName && recordId), // Only run when we have both params
  });

  console.log(`[AUDIT-FRONTEND] Query state: loading=${isLoading}, error=${error}, logs=${auditLogs.length}`);

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-red-600">Errore</CardTitle>
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