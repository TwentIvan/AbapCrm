import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { CheckSquare, Edit, MoreHorizontal, Trash2, Clock, ExternalLink, Monitor } from "lucide-react";
import { SiSap, SiCitrix } from "react-icons/si";
import type { Task } from "@shared/schema";
import { EntityListDescriptor, registerEntity, TableColumn, ColumnHelpers, BulkEditField, FilterColumn } from "../entity-registry";
import { taskStatusColors, taskStatusLabels, taskPriorityColors, taskPriorityLabels } from "../entity-constants";
import { TaskTimerButtons } from "@/components/timesheet/task-timer-buttons";
import TaskFormContainer from "@/components/forms/task-form-container";
import { downloadSapShortcut } from "../sap-shortcut";

export const tasksDescriptor: EntityListDescriptor = {
  entityKey: "tasks",
  title: "Task",
  titlePlural: "Tasks",
  apiBase: "/api/tasks",
  icon: CheckSquare,
  supportsAI: true,
  supportsTimeTracking: true,
  supportsAudit: true,
  supportsMessages: true,
  supportsBulkEdit: true,
  supportsBulkCopy: true,
  supportsBulkDelete: true,

  getColumns: (helpers: ColumnHelpers): TableColumn[] => [
    {
      key: "title",
      label: "Titolo",
      sortable: true,
      searchable: true,
      render: (task: Task) => (
        <div className="font-medium" data-testid={`text-task-title-${task.id}`}>
          {task.title}
        </div>
      ),
    },
    {
      key: "status",
      label: "Stato",
      sortable: true,
      render: (task: Task) => (
        <Badge className={taskStatusColors[task.status] || ""} data-testid={`badge-task-status-${task.id}`}>
          {taskStatusLabels[task.status] || task.status}
        </Badge>
      ),
    },
    {
      key: "priority",
      label: "Priorità",
      sortable: true,
      render: (task: Task) => (
        <Badge className={taskPriorityColors[task.priority] || ""} data-testid={`badge-task-priority-${task.id}`}>
          {taskPriorityLabels[task.priority] || task.priority}
        </Badge>
      ),
    },
    {
      key: "description",
      label: "Descrizione",
      sortable: false,
      searchable: true,
      render: (task: Task) => task.description ? (
        <div className="text-sm max-w-xs truncate" title={task.description}>
          {task.description}
        </div>
      ) : (
        <span className="text-muted-foreground text-sm">-</span>
      ),
    },
    {
      key: "projectId",
      label: "Progetto",
      sortable: true,
      render: (task: any) => task.projectName ? (
        <div className="text-sm font-medium" data-testid={`text-task-project-${task.id}`}>
          {task.projectName}
        </div>
      ) : (
        <span className="text-muted-foreground text-sm">-</span>
      ),
    },
    {
      key: "dueDate",
      label: "Scadenza",
      sortable: true,
      render: (task: Task) => {
        if (!task.dueDate) return <span className="text-muted-foreground text-sm">-</span>;
        const dueDate = new Date(task.dueDate);
        const isOverdue = dueDate < new Date() && task.status !== "completed";
        return (
          <div className={isOverdue ? "text-red-600 font-medium" : "text-sm"}>
            {dueDate.toLocaleDateString("it-IT")}
          </div>
        );
      },
    },
    {
      key: "estimatedEffort",
      label: "Ore Stimate",
      sortable: true,
      render: (task: Task) => {
        const estimated = task.estimatedEffort || 0;
        if (estimated === 0) return <span className="text-muted-foreground text-sm">-</span>;
        return (
          <div className="text-sm font-medium" data-testid={`text-task-effort-${task.id}`}>
            {estimated}h
          </div>
        );
      },
    },
    {
      key: "completionPercentage",
      label: "Completamento",
      sortable: true,
      render: (task: Task) => {
        const completion = Math.min(100, Math.max(0, task.completionPercentage || 0));
        const estimated = task.estimatedEffort || 0;
        const remaining = Math.max(0, estimated * (1 - completion / 100));
        return (
          <div className="space-y-1 min-w-[100px]" data-testid={`text-task-completion-${task.id}`}>
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium">{completion}%</span>
              {estimated > 0 && (
                <span className="text-muted-foreground flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {remaining.toFixed(1)}h
                </span>
              )}
            </div>
            <Progress value={completion} className="h-1.5" />
          </div>
        );
      },
    },
    {
      key: "timer",
      label: "Timer",
      sortable: false,
      render: (task: Task) => <TaskTimerButtons task={task} />,
    },
    {
      key: "sapLaunch",
      label: "SAP",
      sortable: false,
      render: (task: any) => {
        const connectionType = task.sapConnectionType || 'sapgui';
        const hasCitrix = connectionType === 'citrix' && task.sapCitrixLink;
        const hasCloud = connectionType === 'cloud' && task.sapCloudLink;
        const hasSapGui = task.sapServerHost && task.sapSystemIdCode && task.sapSystemNumber;
        
        // No SAP system configured
        if (!hasCitrix && !hasCloud && !hasSapGui) {
          return <span className="text-muted-foreground text-sm">-</span>;
        }
        
        // Citrix connection - open link in new tab
        if (hasCitrix) {
          const handleOpenCitrix = (e: React.MouseEvent) => {
            e.stopPropagation();
            window.open(task.sapCitrixLink, '_blank');
          };
          
          return (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0 text-blue-600 hover:text-blue-700 hover:bg-blue-50"
              onClick={handleOpenCitrix}
              title={`Apri Citrix per ${task.sapSystemName || 'SAP'}`}
              data-testid={`button-citrix-launch-${task.id}`}
            >
              <Monitor className="h-4 w-4" />
            </Button>
          );
        }
        
        // Cloud connection - open link in new tab
        if (hasCloud) {
          const handleOpenCloud = (e: React.MouseEvent) => {
            e.stopPropagation();
            window.open(task.sapCloudLink, '_blank');
          };
          
          return (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0 text-green-600 hover:text-green-700 hover:bg-green-50"
              onClick={handleOpenCloud}
              title={`Apri SAP Cloud per ${task.sapSystemName || 'SAP'}`}
              data-testid={`button-cloud-launch-${task.id}`}
            >
              <ExternalLink className="h-4 w-4" />
            </Button>
          );
        }
        
        // SAP GUI - download shortcut
        const handleDownloadShortcut = (e: React.MouseEvent) => {
          e.stopPropagation();
          downloadSapShortcut({
            systemName: task.sapSystemName || task.sapSystemIdCode,
            serverHost: task.sapServerHost,
            systemId: task.sapSystemIdCode,
            systemNumber: task.sapSystemNumber,
            applicationServerPort: task.sapApplicationServerPort || undefined,
            client: "100", // Default client
          }, `${task.sapSystemIdCode}_${task.title?.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 20)}.sap`);
        };
        
        return (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0 text-orange-600 hover:text-orange-700 hover:bg-orange-50"
            onClick={handleDownloadShortcut}
            title={`Scarica shortcut SAP per ${task.sapSystemName || task.sapSystemIdCode}`}
            data-testid={`button-sap-launch-${task.id}`}
          >
            <SiSap className="h-4 w-4" />
          </Button>
        );
      },
    },
    {
      key: "actions",
      label: "",
      sortable: false,
      render: (task: Task) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" data-testid={`button-task-menu-${task.id}`}>
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => helpers.onEdit(task)}>
              <Edit className="mr-2 h-4 w-4" />
              Modifica
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => helpers.onDelete(task)} className="text-red-600">
              <Trash2 className="mr-2 h-4 w-4" />
              Elimina
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ],

  getFilterColumns: (): FilterColumn[] => [
    { id: "title", label: "Titolo", type: "text" },
    {
      id: "status",
      label: "Stato",
      type: "select",
      options: [
        { value: "todo", label: "Da fare" },
        { value: "in_progress", label: "In corso" },
        { value: "review", label: "In revisione" },
        { value: "completed", label: "Completato" },
      ],
    },
    {
      id: "priority",
      label: "Priorità",
      type: "select",
      options: [
        { value: "low", label: "Bassa" },
        { value: "medium", label: "Media" },
        { value: "high", label: "Alta" },
        { value: "urgent", label: "Urgente" },
      ],
    },
    { id: "description", label: "Descrizione", type: "text" },
    { id: "dueDate", label: "Scadenza", type: "date" },
    { id: "estimatedEffort", label: "Ore Stimate", type: "number" },
    { id: "completionPercentage", label: "Completamento %", type: "number" },
  ],

  getBulkEditFields: (relatedData: any): BulkEditField[] => [
    {
      key: "status",
      label: "Stato",
      type: "select",
      options: [
        { value: "todo", label: "Da fare" },
        { value: "in_progress", label: "In corso" },
        { value: "review", label: "In revisione" },
        { value: "completed", label: "Completato" },
      ],
    },
    {
      key: "priority",
      label: "Priorità",
      type: "select",
      options: [
        { value: "low", label: "Bassa" },
        { value: "medium", label: "Media" },
        { value: "high", label: "Alta" },
        { value: "urgent", label: "Urgente" },
      ],
    },
    {
      key: "projectId",
      label: "Progetto",
      type: "select",
      options: [
        { value: "", label: "Nessuno" },
        ...(relatedData.projects || []).map((p: any) => ({ value: p.id, label: p.name })),
      ],
    },
    {
      key: "dueDate",
      label: "Data Scadenza",
      type: "date",
    },
    {
      key: "estimatedEffort",
      label: "Ore Stimate",
      type: "number",
    },
    {
      key: "completionPercentage",
      label: "Completamento %",
      type: "number",
    },
  ],

  FormComponent: TaskFormContainer,

  prepareCopyData: (task: Task) => {
    const { id, createdAt, updatedAt, userId, organizationId, ...taskData } = task;
    return taskData;
  },

  relatedDataQueries: ["/api/projects", "/api/users"],
};

registerEntity(tasksDescriptor);
