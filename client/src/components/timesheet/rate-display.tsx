import { useQuery } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { DollarSign, TrendingUp, Clock, Zap, AlertCircle } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import type { RateAgreement, Task, Project, Partner } from "@shared/schema";

interface RateDisplayProps {
  task: Task;
  timeLoggedMinutes?: number;
  showValueCalculation?: boolean;
  className?: string;
}

export function RateDisplay({ 
  task, 
  timeLoggedMinutes = 0, 
  showValueCalculation = true,
  className = "" 
}: RateDisplayProps) {
  const [resolvedRate, setResolvedRate] = useState<RateAgreement | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Fetch task details with project and partner info
  const { data: projects = [] } = useQuery<Project[]>({ 
    queryKey: ["/api/projects"],
    staleTime: 5 * 60 * 1000,
  });
  
  const { data: partners = [] } = useQuery<Partner[]>({ 
    queryKey: ["/api/partners"],
    staleTime: 5 * 60 * 1000,
  });

  const project = projects.find(p => p.id === task.projectId);
  const partner = partners.find(p => p.id === project?.clientId);

  // Resolve rate when task context is available
  useEffect(() => {
    const resolveRate = async () => {
      setIsLoading(true);
      try {
        const context: any = {
          taskId: task.id,
          taskType: task.taskType,
        };

        if (project) {
          context.projectId = project.id;
        }
        
        if (partner) {
          context.partnerId = partner.id;
        }

        const res = await apiRequest("POST", "/api/rate-agreements/resolve", context);
        const agreement = await res.json();
        setResolvedRate(agreement);
      } catch (error) {
        console.error("Error resolving rate:", error);
        setResolvedRate(null);
      } finally {
        setIsLoading(false);
      }
    };

    if (task) {
      resolveRate();
    }
  }, [task, project, partner]);

  if (isLoading) {
    return (
      <Card className={className}>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <DollarSign className="h-4 w-4" />
            Tariffa
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-4 w-20 mb-2" />
          <Skeleton className="h-3 w-32" />
        </CardContent>
      </Card>
    );
  }

  if (!resolvedRate) {
    return (
      <Card className={`${className} border-dashed`}>
        <CardContent className="pt-4">
          <div className="flex items-center gap-2 text-muted-foreground">
            <AlertCircle className="h-4 w-4" />
            <span className="text-sm">Nessun accordo tariffario configurato</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  const hourlyRate = parseFloat(resolvedRate.hourlyRate);
  const timeLoggedHours = timeLoggedMinutes / 60;
  const estimatedValue = timeLoggedHours * hourlyRate;

  const formatCriteria = () => {
    if (resolvedRate.groupingFields.length === 0) {
      return "Tariffa generale";
    }

    try {
      const values = JSON.parse(resolvedRate.groupingValues);
      const parts = resolvedRate.groupingFields.map(fieldId => {
        const value = values[fieldId];
        if (!value) return null;

        switch (fieldId) {
          case "partnerId":
            return partner ? `Cliente: ${partner.name}` : `Cliente: ${value}`;
          case "projectId":
            return project ? `Progetto: ${project.name}` : `Progetto: ${value}`;
          case "taskType":
            const taskTypeLabels: Record<string, string> = {
              development: "Sviluppo",
              analysis: "Analisi", 
              design: "Design",
              testing: "Testing",
              consulting: "Consulenza",
              meeting: "Riunioni",
              documentation: "Documentazione",
              maintenance: "Manutenzione",
              support: "Supporto",
              other: "Altro"
            };
            return `Tipo: ${taskTypeLabels[value] || value}`;
          default:
            return `${fieldId}: ${value}`;
        }
      }).filter(Boolean);

      return parts.join(" • ");
    } catch (error) {
      return "Configurazione non valida";
    }
  };

  return (
    <Card className={className} data-testid="rate-display">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <DollarSign className="h-4 w-4" />
          Tariffa Applicata
          <Zap className="h-3 w-3 text-success" />
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Rate Info */}
        <div className="flex items-center justify-between">
          <span className="text-2xl font-bold" data-testid="text-hourly-rate">
            €{hourlyRate}/h
          </span>
          <Badge 
            variant="outline" 
            className="text-xs"
            data-testid="badge-priority"
          >
            Priorità {resolvedRate.priority}
          </Badge>
        </div>

        {/* Agreement Details */}
        <div>
          <p className="text-sm font-medium" data-testid="text-agreement-name">
            {resolvedRate.name}
          </p>
          <p className="text-xs text-muted-foreground" data-testid="text-criteria">
            {formatCriteria()}
          </p>
        </div>

        {/* Value Calculation */}
        {showValueCalculation && timeLoggedMinutes > 0 && (
          <div className="border-t pt-3">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="h-4 w-4 text-success" />
              <span className="text-sm font-medium">Valore Calcolato</span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <span className="text-muted-foreground">Tempo:</span>
                <div className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  <span data-testid="text-time-logged">
                    {Math.floor(timeLoggedHours)}h {Math.round((timeLoggedHours % 1) * 60)}m
                  </span>
                </div>
              </div>
              <div>
                <span className="text-muted-foreground">Valore:</span>
                <div className="text-success font-semibold" data-testid="text-estimated-value">
                  €{estimatedValue.toFixed(2)}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Minimum Hours Warning */}
        {resolvedRate.minimumHours && timeLoggedHours < parseFloat(resolvedRate.minimumHours) && (
          <div className="bg-warning/10 dark:bg-yellow-900/20 border border-warning/30 dark:border-yellow-800 rounded-md p-2">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-3 w-3 text-warning" />
              <span className="text-xs text-warning dark:text-yellow-300">
                Ore minime richieste: {resolvedRate.minimumHours}h
              </span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}