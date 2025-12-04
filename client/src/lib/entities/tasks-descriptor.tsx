import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { CheckSquare, Edit, MoreHorizontal, Trash2 } from "lucide-react";
import type { Task } from "@shared/schema";
import { EntityListDescriptor, registerEntity, TableColumn, ColumnHelpers, BulkEditField, FilterColumn } from "../entity-registry";
import { taskStatusColors, taskStatusLabels, taskPriorityColors, taskPriorityLabels } from "../entity-constants";
import { TaskTimerButtons } from "@/components/timesheet/task-timer-buttons";
import TaskFormContainer from "@/components/forms/task-form-container";

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
      key: "timer",
      label: "Timer",
      sortable: false,
      render: (task: Task) => <TaskTimerButtons task={task} />,
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
  ],

  FormComponent: TaskFormContainer,

  prepareCopyData: (task: Task) => {
    const { id, createdAt, updatedAt, userId, organizationId, ...taskData } = task;
    return taskData;
  },

  relatedDataQueries: ["/api/projects", "/api/users"],
};

registerEntity(tasksDescriptor);
