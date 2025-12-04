import { Badge } from "@/components/ui/badge";
import { FolderKanban } from "lucide-react";
import { registerEntity, EntityListDescriptor } from "../entity-registry";

const statusColors: Record<string, string> = {
  planning: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300",
  active: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300",
  in_progress: "bg-yellow-100 text-yellow-800 dark:bg-yellow-950 dark:text-yellow-300",
  on_hold: "bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300",
  completed: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300",
  cancelled: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
};

const statusLabels: Record<string, string> = {
  planning: "Pianificazione",
  active: "Attivo",
  in_progress: "In Corso",
  on_hold: "In Pausa",
  completed: "Completato",
  cancelled: "Annullato",
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

  getColumns: (context) => {
    const baseColumns = [
      {
        key: "name",
        label: "Nome",
        sortable: true,
        searchable: true,
        render: (project: any) => (
          <div className="flex items-center gap-2">
            <div
              className="w-3 h-3 rounded-full flex-shrink-0"
              style={{ backgroundColor: project.color || "#3B82F6" }}
            />
            <span className="font-medium">{project.name}</span>
          </div>
        ),
      },
      {
        key: "status",
        label: "Stato",
        sortable: true,
        render: (project: any) => (
          <Badge className={statusColors[project.status] || ""}>
            {statusLabels[project.status] || project.status}
          </Badge>
        ),
      },
      {
        key: "clientId",
        label: "Cliente",
        render: (project: any) => {
          const partner = context?.partners?.find((p: any) => p.id === project.clientId);
          return partner?.name || "-";
        },
      },
      {
        key: "progress",
        label: "Progresso",
        sortable: true,
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
        render: (project: any) =>
          project.startDate
            ? new Date(project.startDate).toLocaleDateString("it-IT")
            : "-",
      },
      {
        key: "endDate",
        label: "Fine",
        sortable: true,
        render: (project: any) =>
          project.endDate
            ? new Date(project.endDate).toLocaleDateString("it-IT")
            : "-",
      },
      {
        key: "budget",
        label: "Budget",
        sortable: true,
        render: (project: any) =>
          project.budget
            ? new Intl.NumberFormat("it-IT", {
                style: "currency",
                currency: "EUR",
              }).format(parseFloat(project.budget))
            : "-",
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
