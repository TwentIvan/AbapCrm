import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Clock, Calendar, TrendingUp, Filter, List, LayoutGrid } from "lucide-react";
import { format, formatDistanceToNow, startOfWeek, endOfWeek, startOfMonth, endOfMonth, isWithinInterval } from "date-fns";
import type { TimeEntry, Task, Project } from "@shared/schema";
import { DataTable, createBadgeColumn } from "@/components/ui/data-table";
import type { ColumnDef } from "@tanstack/react-table";
import { Sidebar } from "@/components/sidebar";
import { Header } from "@/components/header";

export default function TimesheetPage() {
  const [filterPeriod, setFilterPeriod] = useState<"week" | "month" | "all">("week");
  const [viewMode, setViewMode] = useState<"cards" | "list">("cards");

  const { data: timeEntries = [] } = useQuery<TimeEntry[]>({
    queryKey: ["/api/time-entries"],
  });

  const { data: tasks = [] } = useQuery<Task[]>({
    queryKey: ["/api/tasks"],
  });

  const { data: projects = [] } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
  });

  const { data: runningEntry } = useQuery<TimeEntry | null>({
    queryKey: ["/api/time-entries/running"],
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

  // Group entries by task
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
      (value: string) => value === "Running" ? "secondary" : "outline"
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
          title="Timesheet" 
          subtitle="Track and manage your time entries across all tasks"
        />
        
        <div className="p-6 space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold">Time Tracking Overview</h2>
            </div>
            <div className="flex items-center gap-2">
              {/* View Toggle */}
              <div className="flex border rounded-lg p-1">
                <Button
                  variant={viewMode === "cards" ? "default" : "ghost"}
                  size="sm"
                  onClick={() => setViewMode("cards")}
                  data-testid="button-view-cards"
                >
                  <LayoutGrid className="h-4 w-4" />
                </Button>
                <Button
                  variant={viewMode === "list" ? "default" : "ghost"}
                  size="sm"
                  onClick={() => setViewMode("list")}
                  data-testid="button-view-list"
                >
                  <List className="h-4 w-4" />
                </Button>
              </div>
              
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
          </div>

      {/* Running Timer Alert */}
      {runningEntry && (
        <Card className="border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-green-600 animate-pulse" />
                <span className="font-medium text-green-800 dark:text-green-200">
                  Timer is running
                </span>
              </div>
              <Badge variant="secondary" className="animate-pulse">
                {taskMap.get(runningEntry.taskId)?.title || "Unknown Task"}
              </Badge>
              <span className="text-sm text-green-700 dark:text-green-300">
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
      {viewMode === "list" ? (
        <DataTable
          tableId="timesheet-entries"
          columns={columns}
          data={tableData}
          searchPlaceholder="Cerca time entries..."
          configurableColumns={true}
          enableAdvancedFilters={true}
          enableColumnReordering={true}
          enableAggregation={true}
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
    </div>
  );
}