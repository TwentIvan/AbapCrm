import { Badge } from "@/components/ui/badge";
import { FolderKanban, CheckCircle2, Clock, AlertTriangle, CalendarX, HelpCircle } from "lucide-react";
import { registerEntity, EntityListDescriptor } from "../entity-registry";
import { projectStatusColors, projectStatusLabels } from "../entity-constants";
import { Link } from "wouter";

const etcStateConfig: Record<string, { label: string; color: string; icon: any }> = {
  completed: { label: "Completato", color: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400", icon: CheckCircle2 },
  on_track: { label: "In Tempo", color: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400", icon: Clock },
  delayed: { label: "In Ritardo", color: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400", icon: AlertTriangle },
  no_planning_window: { label: "No Pianificazione", color: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400", icon: CalendarX },
  no_tasks: { label: "No Task", color: "bg-gray-100 text-gray-600 dark:bg-gray-800/30 dark:text-gray-400", icon: HelpCircle },
};

const projectsDescriptor: EntityListDescriptor = {
  entityKey: "projects",
  title: "Progetto",
  titlePlural: "Progetti",
  apiBase: "/api/projects",
  icon: FolderKanban,

  supportsAI: false,
  supportsTimeTracking: false,
  supportsMessages: true,
  supportsAudit: true,
  supportsBulkEdit: true,
  supportsBulkCopy: true,
  supportsBulkDelete: true,
  
  computedDataEndpoint: "/api/projects/batch-end-to-complete",

  getColumns: (context) => {
    const baseColumns = [
      {
        key: "name",
        label: "Nome",
        sortable: true,
        searchable: true,
        group: "direct" as const,
        render: (project: any) => (
          <div className="flex items-center gap-2">
            <div
              className="w-3 h-3 rounded-full flex-shrink-0"
              style={{ backgroundColor: project.color || "#3B82F6" }}
            />
            <span className="font-medium" data-testid={`text-project-name-${project.id}`}>{project.name}</span>
          </div>
        ),
      },
      {
        key: "status",
        label: "Stato",
        sortable: true,
        group: "direct" as const,
        render: (project: any) => (
          <Badge className={projectStatusColors[project.status] || ""} data-testid={`badge-project-status-${project.id}`}>
            {projectStatusLabels[project.status] || project.status}
          </Badge>
        ),
      },
      {
        key: "clientId",
        label: "Cliente",
        group: "relation" as const,
        render: (project: any) => {
          const partner = context?.partners?.find((p: any) => p.id === project.clientId);
          if (!partner) return "-";
          return (
            <Link href={`/partners/${partner.id}`} className="text-primary hover:underline" data-testid={`link-client-${project.id}`}>
              {partner.name}
            </Link>
          );
        },
      },
      {
        key: "progress",
        label: "Progresso",
        sortable: true,
        group: "direct" as const,
        render: (project: any) => (
          <div className="flex items-center gap-2">
            <div className="w-24 h-2 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-primary transition-all"
                style={{ width: `${project.progress || 0}%` }}
              />
            </div>
            <span className="text-sm text-muted-foreground">{project.progress || 0}%</span>
          </div>
        ),
      },
      {
        key: "startDate",
        label: "Inizio",
        sortable: true,
        group: "direct" as const,
        render: (project: any) =>
          project.startDate
            ? new Date(project.startDate).toLocaleDateString("it-IT")
            : "-",
      },
      {
        key: "endDate",
        label: "Fine",
        sortable: true,
        group: "direct" as const,
        render: (project: any) =>
          project.endDate
            ? new Date(project.endDate).toLocaleDateString("it-IT")
            : "-",
      },
      {
        key: "budget",
        label: "Budget",
        sortable: true,
        group: "direct" as const,
        render: (project: any) =>
          project.budget
            ? new Intl.NumberFormat("it-IT", {
                style: "currency",
                currency: "EUR",
              }).format(parseFloat(project.budget))
            : "-",
      },
      {
        key: "etc_state",
        label: "Stato ETC",
        group: "computed" as const,
        render: (project: any) => {
          const etcData = context?.computedData?.[project.id];
          if (!etcData) return <span className="text-muted-foreground text-xs">-</span>;
          
          const config = etcStateConfig[etcData.state] || etcStateConfig.no_tasks;
          const Icon = config.icon;
          
          return (
            <Badge 
              className={config.color} 
              data-testid={`badge-etc-state-${project.id}`}
              title={[
                etcData.windowName && `Finestra: ${etcData.windowName}`,
                etcData.plannedEndDate && `Fine pianificata: ${new Date(etcData.plannedEndDate).toLocaleDateString("it-IT")}`,
                etcData.effectiveEndDate && `Fine effettiva: ${new Date(etcData.effectiveEndDate).toLocaleDateString("it-IT")}`
              ].filter(Boolean).join('\n')}
            >
              <Icon className="w-3 h-3 mr-1" />
              {config.label}
            </Badge>
          );
        },
      },
      {
        key: "etc_completion",
        label: "% Complet.",
        group: "computed" as const,
        render: (project: any) => {
          const etcData = context?.computedData?.[project.id];
          if (!etcData || !etcData.hasTasks) return <span className="text-muted-foreground text-xs">-</span>;
          
          const pct = etcData.completionPercentage || 0;
          return (
            <div className="flex items-center gap-2" data-testid={`progress-etc-${project.id}`}>
              <div className="w-16 h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-green-500 transition-all"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <span className="text-xs text-muted-foreground">{pct}%</span>
            </div>
          );
        },
      },
      {
        key: "etc_remaining_hours",
        label: "Ore Rimanenti",
        group: "computed" as const,
        render: (project: any) => {
          const etcData = context?.computedData?.[project.id];
          if (!etcData || !etcData.hasTasks) return <span className="text-muted-foreground text-xs">-</span>;
          
          return (
            <span 
              className="text-sm font-medium" 
              data-testid={`text-remaining-hours-${project.id}`}
              title={`${etcData.totalRemainingHours.toFixed(1)}h rimanenti su ${etcData.totalEstimatedHours}h stimate`}
            >
              {etcData.totalRemainingHours.toFixed(1)}h
            </span>
          );
        },
      },
      {
        key: "etc_effective_end",
        label: "Fine Effettiva",
        group: "computed" as const,
        render: (project: any) => {
          const etcData = context?.computedData?.[project.id];
          if (!etcData || !etcData.effectiveEndDate) return <span className="text-muted-foreground text-xs">-</span>;
          
          const effectiveEnd = new Date(etcData.effectiveEndDate);
          const plannedEnd = etcData.plannedEndDate ? new Date(etcData.plannedEndDate) : null;
          const isDelayed = plannedEnd && effectiveEnd > plannedEnd;
          
          return (
            <span 
              className={`text-sm ${isDelayed ? 'text-red-600 font-medium' : ''}`}
              data-testid={`text-effective-end-${project.id}`}
            >
              {effectiveEnd.toLocaleDateString("it-IT")}
              {etcData.effectiveEndTime && ` ${etcData.effectiveEndTime}`}
            </span>
          );
        },
      },
      {
        key: "etc_deficit_hours",
        label: "Ore Deficit",
        group: "computed" as const,
        render: (project: any) => {
          const etcData = context?.computedData?.[project.id];
          const deficitHours = etcData?.scheduleDeficitHours || 0;
          
          if (!deficitHours || deficitHours <= 0) {
            return <span className="text-muted-foreground text-xs">-</span>;
          }
          
          return (
            <span 
              className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400"
              data-testid={`text-deficit-hours-${project.id}`}
              title={`Servono ${deficitHours.toFixed(1)} ore aggiuntive oltre la finestra pianificata`}
            >
              ⚠ +{deficitHours.toFixed(1)}h
            </span>
          );
        },
      },
    ];
    return baseColumns;
  },

  getFilterColumns: () => [
    {
      id: "status",
      label: "Stato",
      type: "select",
      options: [
        { value: "planning", label: "Pianificazione" },
        { value: "active", label: "Attivo" },
        { value: "in_progress", label: "In Corso" },
        { value: "on_hold", label: "In Pausa" },
        { value: "completed", label: "Completato" },
        { value: "cancelled", label: "Annullato" },
      ],
    },
    {
      id: "clientId",
      label: "Cliente",
      type: "relation",
      relationEntity: "partners",
    },
  ],

  getBulkEditFields: (context) => {
    const partnerOptions =
      context?.partners?.map((p: any) => ({ value: p.id, label: p.name })) || [];

    return [
      {
        key: "status",
        label: "Stato",
        type: "select",
        options: [
          { value: "planning", label: "Pianificazione" },
          { value: "active", label: "Attivo" },
          { value: "in_progress", label: "In Corso" },
          { value: "on_hold", label: "In Pausa" },
          { value: "completed", label: "Completato" },
          { value: "cancelled", label: "Annullato" },
        ],
      },
      { key: "clientId", label: "Cliente", type: "select", options: partnerOptions },
      { key: "progress", label: "Progresso (%)", type: "number" },
    ];
  },
};

registerEntity(projectsDescriptor);
