import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Clock, Calendar, TrendingUp, Filter, List, LayoutGrid, Group, Settings2, Clipboard } from "lucide-react";
import { format, formatDistanceToNow, startOfWeek, endOfWeek, startOfMonth, endOfMonth, isWithinInterval, startOfDay, isSameDay } from "date-fns";
import type { TimeEntry, Task, Project } from "@shared/schema";
import { DataTable, createBadgeColumn, createTextColumn } from "@/components/ui/data-table";
import { LayoutManager } from "@/components/ui/layout-manager";
import { ListViewToolbar } from "@/components/ui/list-view-toolbar";
import { TableConfiguration } from "@/components/ui/table-configuration";
import type { ColumnDef } from "@tanstack/react-table";
import Sidebar from "@/components/layout/sidebar";
import Header from "@/components/layout/header";
import { useTableLayout } from "@/lib/user-preferences";
import { useToast } from "@/hooks/use-toast";

// Funzione helper per processare i dati raggruppati
function processEntriesForTimesheet(entries: any[], groupingFields: string[]) {
  const grouped: { [key: string]: any[] } = {};
  
  entries.forEach(entry => {
    // Crea chiave di raggruppamento basata sui campi selezionati
    const groupKey = groupingFields.map(field => {
      switch (field) {
        case 'taskId':
          return `Task: ${entry.taskTitle || 'Unknown'}`;
        case 'projectId':
          return `Project: ${entry.projectName || 'No Project'}`;
        case 'date':
          return `Date: ${entry.formattedDate || 'Unknown'}`;
        case 'status':
          return `Status: ${entry.status || 'Unknown'}`;
        default:
          return `${field}: ${entry[field] || 'Unknown'}`;
      }
    }).join(' | ');
    
    if (!grouped[groupKey]) {
      grouped[groupKey] = [];
    }
    grouped[groupKey].push(entry);
  });
  
  return grouped;
}

// Tipi per raggruppamento dinamico
type GroupingField = "taskId" | "projectId" | "date" | "status" | "description";

const AVAILABLE_GROUPING_FIELDS: Array<{
  id: GroupingField;
  label: string;
  accessor: (entry: TimeEntry, taskMap: Map<string, Task>, projectMap: Map<string, Project>) => string;
}> = [
  {
    id: "taskId",
    label: "Task",
    accessor: (entry, taskMap) => taskMap.get(entry.taskId)?.title || "Unknown Task"
  },
  {
    id: "projectId", 
    label: "Project",
    accessor: (entry, taskMap, projectMap) => {
      const task = taskMap.get(entry.taskId);
      return task?.projectId ? (projectMap.get(task.projectId)?.name || "Unknown Project") : "No Project";
    }
  },
  {
    id: "date",
    label: "Date", 
    accessor: (entry) => format(new Date(entry.startTime), "yyyy-MM-dd")
  },
  {
    id: "status",
    label: "Status",
    accessor: (entry) => entry.isRunning ? "Running" : "Completed"
  },
  {
    id: "description",
    label: "Description",
    accessor: (entry) => entry.description || "No Description"
  }
];

interface GroupedTimeEntry {
  id: string;
  groupKey: string;
  groupLabel: string;
  entries: TimeEntry[];
  totalDuration: number;
  taskId?: string;
  projectId?: string;
  date?: string;
  description?: string;
}

export default function TimesheetPage() {
  const [filterPeriod, setFilterPeriod] = useState<"week" | "month" | "all">("week");
  const [editingLayout, setEditingLayout] = useState<any>(null);
  const [showConfigDialog, setShowConfigDialog] = useState(false);
  const [selectedGroupFields, setSelectedGroupFields] = useState<GroupingField[]>([]);
  const [showTimeNormalizer, setShowTimeNormalizer] = useState(false);
  const [selectedEntries, setSelectedEntries] = useState<TimeEntry[]>([]);
  
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  // Use the table layout hook for persistent preferences
  const { 
    layout, 
    currentLayoutName,
    savedLayouts,
    updateLayout, 
    saveLayoutAs,
    loadLayout,
    renameLayout,
    deleteLayout,
    updateExistingLayout,
  } = useTableLayout('timesheet');

  const { data: timeEntries = [] } = useQuery<TimeEntry[]>({
    queryKey: ["/api/time-entries"],
    queryFn: async () => {
      const res = await fetch("/api/time-entries", { credentials: "include" });
      if (!res.ok) throw new Error('Failed to fetch time entries');
      return res.json();
    },
  });

  const { data: tasks = [] } = useQuery<Task[]>({
    queryKey: ["/api/tasks"],
    queryFn: async () => {
      const res = await fetch("/api/tasks", { credentials: "include" });
      if (!res.ok) throw new Error('Failed to fetch tasks');
      return res.json();
    },
  });

  const { data: projects = [] } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
    queryFn: async () => {
      const res = await fetch("/api/projects", { credentials: "include" });
      if (!res.ok) throw new Error('Failed to fetch projects');
      return res.json();
    },
  });

  const { data: runningEntry } = useQuery<TimeEntry | null>({
    queryKey: ["/api/time-entries/running"],
    queryFn: async () => {
      const res = await fetch("/api/time-entries/running", { credentials: "include" });
      if (!res.ok) throw new Error('Failed to fetch running entry');
      return res.json();
    },
  });


  // Filter entries by period
  const now = new Date();
  const filteredEntries = timeEntries.filter((entry) => {
    const entryDate = new Date(entry.startTime);
    
    switch (filterPeriod) {
      case "week":
        return isWithinInterval(entryDate, {
          start: startOfWeek(now, { weekStartsOn: 1 }),
          end: endOfWeek(now, { weekStartsOn: 1 })
        });
      case "month":
        return isWithinInterval(entryDate, {
          start: startOfMonth(now),
          end: endOfMonth(now)
        });
      default:
        return true;
    }
  });

  // Create task lookup map
  const taskMap = new Map(tasks.map(task => [task.id, task]));
  const projectMap = new Map(projects.map(project => [project.id, project]));


  // Raggruppamento dinamico delle time entries usando "collect"
  const groupedEntries = useMemo((): GroupedTimeEntry[] => {
    if (selectedGroupFields.length === 0) {
      // Nessun raggruppamento: ogni entry è un gruppo singolo
      return filteredEntries.map(entry => {
        const task = taskMap.get(entry.taskId);
        const project = task ? projectMap.get(task.projectId || "") : null;
        
        return {
          id: entry.id,
          groupKey: entry.id,
          groupLabel: `${project?.name || "No Project"} > ${task?.title || "No Task"}`,
          entries: [entry],
          totalDuration: entry.duration || 0,
          taskId: entry.taskId,
          projectId: task?.projectId || undefined,
          date: format(new Date(entry.startTime), "yyyy-MM-dd"),
          description: entry.description || undefined
        };
      });
    }

    // Logica "collect": raggruppa per combinazione di campi selezionati
    const groups = new Map<string, GroupedTimeEntry>();

    filteredEntries.forEach(entry => {
      // Costruisci la chiave di raggruppamento combinando i campi selezionati
      const groupKeyParts: string[] = [];
      const groupLabelParts: string[] = [];

      selectedGroupFields.forEach(fieldId => {
        const field = AVAILABLE_GROUPING_FIELDS.find(f => f.id === fieldId);
        if (field) {
          const value = field.accessor(entry, taskMap, projectMap);
          groupKeyParts.push(`${fieldId}:${value}`);
          groupLabelParts.push(value);
        }
      });

      const groupKey = groupKeyParts.join('|');
      const groupLabel = groupLabelParts.join(' • ');

      if (!groups.has(groupKey)) {
        groups.set(groupKey, {
          id: groupKey,
          groupKey,
          groupLabel,
          entries: [],
          totalDuration: 0,
          taskId: selectedGroupFields.includes("taskId") ? entry.taskId : undefined,
          projectId: selectedGroupFields.includes("projectId") ? (taskMap.get(entry.taskId)?.projectId || undefined) : undefined,
          date: selectedGroupFields.includes("date") ? format(new Date(entry.startTime), "yyyy-MM-dd") : undefined,
          description: selectedGroupFields.includes("description") ? (entry.description || "No Description") : undefined
        });
      }

      const group = groups.get(groupKey)!;
      group.entries.push(entry);
      group.totalDuration += entry.duration || 0;
    });

    return Array.from(groups.values()).sort((a, b) => {
      // Ordina per data più recente se inclusa nel raggruppamento, altrimenti alfabeticamente
      if (selectedGroupFields.includes("date")) {
        return new Date(b.entries[0].startTime).getTime() - new Date(a.entries[0].startTime).getTime();
      }
      return a.groupLabel.localeCompare(b.groupLabel);
    });
  }, [filteredEntries, selectedGroupFields, taskMap, projectMap]);

  // Group entries by task (legacy per le statistiche)
  const entriesByTask = filteredEntries.reduce((acc, entry) => {
    const taskId = entry.taskId;
    if (!acc[taskId]) {
      acc[taskId] = [];
    }
    acc[taskId].push(entry);
    return acc;
  }, {} as Record<string, TimeEntry[]>);

  // Calculate statistics
  const totalTime = filteredEntries.reduce((total, entry) => {
    return total + (entry.duration || 0);
  }, 0);

  const totalEntries = filteredEntries.length;

  const formatDuration = (minutes: number) => {
    const hours = Math.floor(minutes / 60);
    const mins = Math.round(minutes % 60);
    return `${hours}h ${mins}m`;
  };

  const formatTime = (minutes: number) => {
    const hours = Math.floor(minutes / 60);
    const mins = Math.round(minutes % 60);
    if (hours > 0) {
      return `${hours}h ${mins}m`;
    }
    return `${mins}m`;
  };

  const getPeriodLabel = () => {
    switch (filterPeriod) {
      case "week":
        return "This Week";
      case "month":
        return "This Month";
      default:
        return "All Time";
    }
  };

  // Prepare data for table view - flatten time entries with task/project info
  const tableData = filteredEntries.map(entry => {
    const task = taskMap.get(entry.taskId);
    const project = task?.projectId ? projectMap.get(task.projectId) : null;
    return {
      ...entry,
      taskTitle: task?.title || "Unknown Task",
      projectName: project?.name || "No Project",
      formattedDuration: formatDuration(entry.duration || 0),
      formattedDate: format(new Date(entry.startTime), "MMM d, yyyy"),
      formattedTime: format(new Date(entry.startTime), "HH:mm") + 
        (entry.endTime ? ` - ${format(new Date(entry.endTime), "HH:mm")}` : " - Running"),
      status: entry.isRunning ? "Running" : "Completed"
    };
  });

  // Table columns
  const columns: ColumnDef<typeof tableData[0]>[] = [
    {
      accessorKey: "formattedDate",
      header: "Data",
    },
    {
      accessorKey: "formattedTime", 
      header: "Orario",
    },
    {
      accessorKey: "taskTitle",
      header: "Task",
    },
    {
      accessorKey: "projectName",
      header: "Progetto",
    },
    {
      accessorKey: "formattedDuration",
      header: "Durata",
    },
    createBadgeColumn(
      "status",
      "Stato",
      { "Running": "secondary", "Completed": "outline" }
    ),
    {
      accessorKey: "description",
      header: "Descrizione",
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">
          {row.original.description || "Nessuna descrizione"}
        </span>
      )
    }
  ];

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-auto">
        <Header 
          title="Time Entries" 
          subtitle="Gestisci le registrazioni del tempo. Seleziona voci e configura raggruppamenti per creare timesheet."
          onNewClick={() => {}}
        />
        
        <div className="p-6 space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold">Time Tracking Overview</h2>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Filter className="h-4 w-4 text-muted-foreground" />
                <Select value={filterPeriod} onValueChange={(value: any) => setFilterPeriod(value)}>
                  <SelectTrigger className="w-[140px]" data-testid="select-time-period">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="week">This Week</SelectItem>
                    <SelectItem value="month">This Month</SelectItem>
                    <SelectItem value="all">All Time</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div className="flex items-center gap-2">
                <Group className="h-4 w-4 text-muted-foreground" />
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className="w-[200px] justify-start text-left font-normal"
                      data-testid="button-group-fields"
                    >
                      {selectedGroupFields.length === 0 
                        ? "No Grouping" 
                        : `Grouped by ${selectedGroupFields.length} field${selectedGroupFields.length !== 1 ? 's' : ''}`
                      }
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[220px] p-3">
                    <div className="text-xs font-medium text-muted-foreground mb-3">Select Fields to Group By:</div>
                    <div className="space-y-3">
                      {AVAILABLE_GROUPING_FIELDS.map(field => (
                        <div key={field.id} className="flex items-center space-x-2">
                          <Checkbox
                            id={`group-${field.id}`}
                            checked={selectedGroupFields.includes(field.id)}
                            onCheckedChange={(checked) => {
                              if (checked) {
                                setSelectedGroupFields(prev => [...prev, field.id]);
                              } else {
                                setSelectedGroupFields(prev => prev.filter(f => f !== field.id));
                              }
                            }}
                          />
                          <label 
                            htmlFor={`group-${field.id}`} 
                            className="text-sm cursor-pointer flex-1"
                          >
                            {field.label}
                          </label>
                        </div>
                      ))}
                      {selectedGroupFields.length > 0 && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setSelectedGroupFields([])}
                          className="w-full mt-2"
                        >
                          Clear All
                        </Button>
                      )}
                    </div>
                  </PopoverContent>
                </Popover>
                {selectedGroupFields.length > 0 && (
                  <Button
                    variant="default"
                    size="sm"
                    onClick={() => {
                      // Trigger re-grouping by forcing useMemo recalculation
                      // The grouping logic already uses selectedGroupFields
                    }}
                    className="ml-2"
                    data-testid="button-execute-grouping"
                  >
                    Execute
                  </Button>
                )}
              </div>
              
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowTimeNormalizer(!showTimeNormalizer)}
                data-testid="button-time-normalizer"
              >
                <Settings2 className="h-4 w-4 mr-2" />
                Time Settings
              </Button>
            </div>
          </div>

          <ListViewToolbar
            currentLayoutName={currentLayoutName}
            savedLayouts={savedLayouts}
            onLoadLayout={loadLayout}
            onRenameLayout={renameLayout}
            onDeleteLayout={deleteLayout}
            onConfigureTable={() => setShowConfigDialog(true)}
            onCreateNew={() => {/* TODO: implement create */}}
            onCopySelected={() => {/* TODO: implement copy */}}
            onBulkEdit={() => {/* TODO: implement bulk edit */}}
            onDeleteSelected={() => {/* TODO: implement delete */}}
            hasSelection={selectedEntries.length > 0}
            customActions={
              <Button
                variant="default"
                size="sm"
                disabled={selectedEntries.length === 0 || selectedGroupFields.length === 0}
                onClick={async () => {
                  if (selectedGroupFields.length === 0) {
                    toast({ title: "Configurazione richiesta", description: "Seleziona almeno un campo per il raggruppamento", variant: "destructive" });
                    return;
                  }
                  if (selectedEntries.length === 0) {
                    toast({ title: "Nessuna voce selezionata", description: "Seleziona almeno una voce di tempo per creare il timesheet", variant: "destructive" });
                    return;
                  }
                  
                  const groupedData = processEntriesForTimesheet(tableData.filter(entry => selectedEntries.some(se => se.id === entry.id)), selectedGroupFields);
                  const totalDuration = selectedEntries.reduce((sum, entry) => sum + (entry.duration || 0), 0);
                  const timesheetName = `Timesheet ${format(now, "dd/MM/yyyy HH:mm")}`;
                  
                  try {
                    const response = await fetch('/api/timesheets', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      credentials: 'include',
                      body: JSON.stringify({ 
                        name: timesheetName, 
                        description: `Timesheet con ${selectedEntries.length} voci raggruppate per ${selectedGroupFields.join(', ')}`, 
                        groupingFields: selectedGroupFields, 
                        timeEntryIds: selectedEntries.map(entry => entry.id), 
                        groupedData: groupedData, 
                        totalDuration: totalDuration, 
                        totalEntries: selectedEntries.length 
                      })
                    });
                    
                    if (!response.ok) throw new Error('Errore nel salvare il timesheet');
                    queryClient.invalidateQueries({ queryKey: ["/api/timesheets"] });
                    toast({ title: "✓ Timesheet salvato", description: `Timesheet "${timesheetName}" creato con successo` });
                  } catch (error) {
                    toast({ 
                      title: "Errore", 
                      description: error instanceof Error ? error.message : "Errore nel salvare il timesheet", 
                      variant: "destructive" 
                    });
                  }
                }}
                data-testid="button-create-timesheet"
              >
                <Clipboard className="h-4 w-4 mr-2" />
                Crea Timesheet
              </Button>
            }
            viewToggle={
              <div className="flex bg-muted rounded-lg p-1">
                <Button
                  variant={"ghost"}
                  size="sm"
                  onClick={() => updateLayout({})}
                  data-testid="button-view-cards"
                >
                  <LayoutGrid className="h-4 w-4" />
                </Button>
                <Button
                  variant={"default"}
                  size="sm"
                  onClick={() => updateLayout({})}
                  data-testid="button-view-list"
                >
                  <List className="h-4 w-4" />
                </Button>
              </div>
            }
          />

      {/* Running Timer Alert */}
      {runningEntry && (
        <Card className="border-success/30 bg-success/10">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-success animate-pulse" />
                <span className="font-medium text-success">
                  Timer is running
                </span>
              </div>
              <Badge variant="secondary" className="animate-pulse">
                {taskMap.get(runningEntry.taskId)?.title || "Unknown Task"}
              </Badge>
              <span className="text-sm text-success dark:text-success">
                Started {formatDistanceToNow(new Date(runningEntry.startTime))} ago
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Statistics Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Time ({getPeriodLabel()})</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-total-period-time">
              {formatDuration(totalTime)}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Time Entries</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-total-entries">
              {totalEntries}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Average Entry</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-average-entry">
              {totalEntries > 0 ? formatTime(totalTime / totalEntries) : "0m"}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Time Entries Content */}
      {true ? (
        <DataTable
          key={`timesheet-${currentLayoutName}`}
          tableId="timesheet-entries"
          columns={columns}
          data={tableData}
          configurableColumns={true}
          enableAdvancedFilters={true}
          filterColumns={[
            {
              id: "taskId",
              type: "select",
              label: "Task",
              options: Array.from(new Set(tableData.map(entry => {
                const task = taskMap.get(entry.taskId);
                return { value: entry.taskId, label: task?.title || "Unknown Task" };
              }))).sort((a, b) => a.label.localeCompare(b.label))
            },
            {
              id: "projectId", 
              type: "select",
              label: "Project",
              options: Array.from(new Set(tableData.map(entry => {
                const task = taskMap.get(entry.taskId);
                const project = task?.projectId ? projectMap.get(task.projectId) : null;
                return { 
                  value: task?.projectId || "", 
                  label: project?.name || "No Project" 
                };
              }))).filter(opt => opt.value).sort((a, b) => a.label.localeCompare(b.label))
            },
            {
              id: "status",
              type: "select", 
              label: "Status",
              options: [
                { value: "completed", label: "Completed" },
                { value: "running", label: "Running" }
              ]
            },
            {
              id: "date",
              type: "date",
              label: "Date"
            }
          ]}
          enableColumnReordering={true}
          enableAggregation={true}
          enableSelection={true}
          enableClipboardCopy={true}
          onSelectionChange={(entries) => setSelectedEntries(entries as TimeEntry[])}
          aggregationColumns={[
            {
              id: "duration",
              type: "sum" as const,
              label: "Durata Totale"
            }
          ]}
        />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Time Entries by Task</CardTitle>
            <p className="text-sm text-muted-foreground">
              Vista raggruppata per task (seleziona vista Lista per funzioni avanzate)
            </p>
          </CardHeader>
          <CardContent>
          {Object.keys(entriesByTask).length > 0 ? (
            <div className="space-y-6">
              {Object.entries(entriesByTask).map(([taskId, entries]) => {
                const task = taskMap.get(taskId);
                const project = task?.projectId ? projectMap.get(task.projectId) : null;
                const taskTotal = entries.reduce((sum, entry) => sum + (entry.duration || 0), 0);

                return (
                  <div key={taskId} className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="space-y-1">
                        <h3 className="font-medium" data-testid={`task-title-${taskId}`}>
                          {task?.title || "Unknown Task"}
                        </h3>
                        {project && (
                          <p className="text-sm text-muted-foreground">
                            {project.name}
                          </p>
                        )}
                      </div>
                      <div className="text-right">
                        <div className="font-semibold" data-testid={`task-total-${taskId}`}>
                          {formatDuration(taskTotal)}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {entries.length} {entries.length === 1 ? "entry" : "entries"}
                        </div>
                      </div>
                    </div>

                    <div className="pl-4 space-y-2">
                      {entries.map((entry) => (
                        <div 
                          key={entry.id} 
                          className="flex items-center justify-between py-2 border-l-2 border-muted pl-4"
                          data-testid={`entry-${entry.id}`}
                        >
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="text-sm">
                                {format(new Date(entry.startTime), "MMM d, HH:mm")}
                                {entry.endTime && (
                                  <span> - {format(new Date(entry.endTime), "HH:mm")}</span>
                                )}
                              </span>
                              {entry.isRunning && (
                                <Badge variant="secondary" className="text-xs animate-pulse">
                                  Running
                                </Badge>
                              )}
                            </div>
                            {entry.description && (
                              <p className="text-sm text-muted-foreground">
                                {entry.description}
                              </p>
                            )}
                          </div>
                          <div className="text-sm font-medium">
                            {entry.duration ? formatTime(entry.duration) : "-"}
                          </div>
                        </div>
                      ))}
                    </div>

                    <Separator />
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <Clock className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <h3 className="text-lg font-medium mb-2">No time entries found</h3>
              <p className="text-sm">
                {filterPeriod === "all" 
                  ? "Start tracking time on your tasks to see entries here."
                  : `No time entries for ${getPeriodLabel().toLowerCase()}. Try changing the time period.`
                }
              </p>
            </div>
          )}
          </CardContent>
        </Card>
          )}
        </div>
      </main>
      {/* Table Configuration Dialog */}
      <TableConfiguration
        tableId="timesheet"
        availableColumns={[
          { id: 'taskId', label: 'Task' },
          { id: 'projectId', label: 'Project' },
          { id: 'startTime', label: 'Start Time' },
          { id: 'endTime', label: 'End Time' },
          { id: 'duration', label: 'Duration' },
          { id: 'description', label: 'Description' },
        ]}
        isOpen={showConfigDialog}
        onOpenChange={setShowConfigDialog}
        editingLayout={editingLayout}
        onSave={(updatedLayout: any) => {
          updateExistingLayout(editingLayout.id, updatedLayout);
          setEditingLayout(null);
          setShowConfigDialog(false);
        }}
        onCancel={() => {
          setEditingLayout(null);
          setShowConfigDialog(false);
        }}
      />

      {/* Time Settings Dialog */}
      <Dialog open={showTimeNormalizer} onOpenChange={setShowTimeNormalizer}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Time Settings</DialogTitle>
            <DialogDescription>
              Configura le impostazioni per la normalizzazione e gestione del tempo.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="min-minutes">Minimo minuti per arrotondamento</Label>
              <Input
                id="min-minutes"
                type="number"
                placeholder="15"
                min="1"
                max="60"
                data-testid="input-min-minutes"
              />
              <p className="text-xs text-muted-foreground">
                Le registrazioni del tempo verranno arrotondate a multipli di questo valore
              </p>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="default-description">Descrizione predefinita</Label>
              <Input
                id="default-description"
                placeholder="Lavoro su progetto..."
                data-testid="input-default-description"
              />
              <p className="text-xs text-muted-foreground">
                Descrizione automatica per nuove registrazioni tempo
              </p>
            </div>
            
            <div className="flex items-center space-x-2">
              <Checkbox id="auto-stop" data-testid="checkbox-auto-stop" />
              <Label htmlFor="auto-stop" className="text-sm">
                Fermata automatica timer dopo 8 ore
              </Label>
            </div>
            
            <div className="flex items-center space-x-2">
              <Checkbox id="round-up" data-testid="checkbox-round-up" />
              <Label htmlFor="round-up" className="text-sm">
                Arrotonda sempre per eccesso
              </Label>
            </div>
          </div>
          
          <div className="flex justify-end space-x-2">
            <Button
              variant="outline"
              onClick={() => setShowTimeNormalizer(false)}
              data-testid="button-cancel-time-settings"
            >
              Annulla
            </Button>
            <Button
              onClick={() => {
                // Qui andrà la logica per salvare le impostazioni
                toast({
                  title: "Impostazioni salvate",
                  description: "Le configurazioni del tempo sono state aggiornate.",
                });
                setShowTimeNormalizer(false);
              }}
              data-testid="button-save-time-settings"
            >
              Salva
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}