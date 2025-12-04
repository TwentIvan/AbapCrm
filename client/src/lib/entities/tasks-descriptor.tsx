import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { CheckSquare, Edit, MoreHorizontal, Trash2 } from "lucide-react";
import type { Task } from "@shared/schema";
import { EntityListDescriptor, registerEntity, TableColumn, ColumnHelpers, BulkEditField, FilterColumn } from "../entity-registry";
import TaskFormContainer from "@/components/forms/task-form-container";

const statusColors: Record<string, string> = {
  todo: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200",
  in_progress: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  review: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  completed: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
};

const priorityColors: Record<string, string> = {
  low: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  medium: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  high: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
  urgent: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
};

const statusLabels: Record<string, string> = {
  todo: "Da fare",
  in_progress: "In corso",
  review: "In revisione",
  completed: "Completato",
};

const priorityLabels: Record<string, string> = {
  low: "Bassa",
  medium: "Media",
  high: "Alta",
  urgent: "Urgente",
};

export const tasksDescriptor: EntityListDescriptor = {
  entityKey: "tasks",
  title: "Task",
  titlePlural: "Tasks",
  apiBase: "/api/tasks",
  icon: CheckSquare,
  supportsAI: true,
  supportsTimer: true,
  supportsHistory: true,
  supportsMessages: true,

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
        <Badge className={statusColors[task.status] || ""}>
          {statusLabels[task.status] || task.status}
        </Badge>
      ),
    },
    {
      key: "priority",
      label: "Priorità",
      sortable: true,
      render: (task: Task) => (
        <Badge className={priorityColors[task.priority] || ""}>
          {priorityLabels[task.priority] || task.priority}
        </Badge>
      ),
    },
    {
      key: "projectId",
      label: "Progetto",
      sortable: true,
      render: (task: any) => task.projectName ? (
        <div className="text-sm font-medium">{task.projectName}</div>
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
