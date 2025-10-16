import { ProjectMilestone } from "@shared/schema";
import { format, differenceInDays, min, max } from "date-fns";
import { it } from "date-fns/locale";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { ArrowRight } from "lucide-react";

interface GanttChartProps {
  milestones: ProjectMilestone[];
  projects: Array<{ id: string; name: string }>;
  onMilestoneClick?: (milestone: ProjectMilestone) => void;
}

export function GanttChart({ milestones, projects, onMilestoneClick }: GanttChartProps) {
  if (milestones.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        Nessuna milestone da visualizzare
      </div>
    );
  }

  // Filtra milestone con date valide
  const validMilestones = milestones.filter(m => m.startDate && m.endDate);
  
  if (validMilestones.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        Aggiungi date alle milestone per visualizzare il Gantt
      </div>
    );
  }

  // Calcola range date
  const allDates = validMilestones.flatMap(m => [new Date(m.startDate!), new Date(m.endDate!)]);
  const minDate = min(allDates);
  const maxDate = max(allDates);
  const totalDays = differenceInDays(maxDate, minDate) + 1;

  const getPosition = (date: Date) => {
    const days = differenceInDays(date, minDate);
    return (days / totalDays) * 100;
  };

  const getWidth = (start: Date, end: Date) => {
    const days = differenceInDays(end, start) + 1;
    return (days / totalDays) * 100;
  };

  const statusColors = {
    planned: "bg-blue-500",
    in_progress: "bg-yellow-500",
    completed: "bg-green-500",
    cancelled: "bg-red-500"
  };

  const statusLabels = {
    planned: "Pianificato",
    in_progress: "In Corso",
    completed: "Completato",
    cancelled: "Annullato"
  };

  // Raggruppa per progetto
  const milestonesByProject = validMilestones.reduce((acc, milestone) => {
    const projectId = milestone.projectId || 'no-project';
    if (!acc[projectId]) acc[projectId] = [];
    acc[projectId].push(milestone);
    return acc;
  }, {} as Record<string, ProjectMilestone[]>);

  return (
    <div className="space-y-8">
      {/* Timeline Header */}
      <div className="relative">
        <div className="flex justify-between text-sm text-muted-foreground mb-2">
          <span>{format(minDate, "dd MMM yyyy", { locale: it })}</span>
          <span>{format(maxDate, "dd MMM yyyy", { locale: it })}</span>
        </div>
        <div className="relative h-1 bg-gray-200 dark:bg-gray-700 rounded"></div>
      </div>

      {/* Gantt per progetto */}
      {Object.entries(milestonesByProject).map(([projectId, projectMilestones]) => {
        const project = projects.find(p => p.id === projectId);
        const sortedMilestones = [...projectMilestones].sort((a, b) => 
          (a.displayOrder || 0) - (b.displayOrder || 0)
        );

        return (
          <div key={projectId} className="space-y-4">
            <h3 className="font-semibold text-lg">
              {project?.name || 'Progetto non assegnato'}
            </h3>
            
            <div className="space-y-3">
              {sortedMilestones.map((milestone) => {
                const start = new Date(milestone.startDate!);
                const end = new Date(milestone.endDate!);
                const leftPos = getPosition(start);
                const barWidth = getWidth(start, end);
                
                // Trova dipendenza (milestone prerequisito)
                const prerequisite = milestone.dependsOnMilestoneId 
                  ? validMilestones.find(m => m.id === milestone.dependsOnMilestoneId)
                  : null;

                return (
                  <div key={milestone.id} className="relative">
                    {/* Milestone info */}
                    <div className="flex items-center gap-4 mb-1">
                      <div className="w-48 flex-shrink-0">
                        <button
                          onClick={() => onMilestoneClick?.(milestone)}
                          className="text-sm font-medium hover:underline text-left"
                          data-testid={`gantt-milestone-${milestone.id}`}
                        >
                          {milestone.name}
                        </button>
                        <div className="flex items-center gap-2 mt-1">
                          <Badge className={`${statusColors[milestone.status || "planned"]} text-white text-xs`}>
                            {statusLabels[milestone.status || "planned"]}
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            {milestone.progress || 0}%
                          </span>
                        </div>
                      </div>

                      {/* Timeline bar */}
                      <div className="flex-1 relative h-10">
                        {/* Linea dipendenza */}
                        {prerequisite && prerequisite.endDate && (
                          (() => {
                            const prereqEnd = new Date(prerequisite.endDate);
                            const prereqPos = getPosition(prereqEnd);
                            
                            // La linea parte sempre dal prerequisito e va verso il dipendente
                            const isForward = prereqPos <= leftPos;
                            const lineWidth = Math.abs(leftPos - prereqPos);
                            
                            // Stile dinamico per posizionamento
                            const lineStyle = isForward 
                              ? { left: `${prereqPos}%`, width: `${lineWidth}%` }
                              : { right: `${100 - prereqPos}%`, width: `${lineWidth}%` };
                            
                            return (
                              <div
                                className="absolute top-1/2 h-0.5 bg-gray-400 dark:bg-gray-600"
                                style={lineStyle}
                              >
                                {/* Freccia sempre sul dipendente (milestone corrente) */}
                                <ArrowRight 
                                  className={`absolute -top-2 h-4 w-4 text-gray-400 dark:text-gray-600 ${
                                    isForward ? 'right-0' : 'left-0 rotate-180'
                                  }`}
                                />
                              </div>
                            );
                          })()
                        )}
                        
                        {/* Warning se dipendenza senza date */}
                        {prerequisite && !prerequisite.endDate && (
                          <div className="absolute top-0 left-0 text-xs text-yellow-600 dark:text-yellow-400">
                            ⚠️ Prerequisito senza data fine
                          </div>
                        )}

                        {/* Barra milestone */}
                        <div
                          className={`absolute top-1/2 -translate-y-1/2 h-8 rounded-md cursor-pointer transition-all hover:opacity-80 ${statusColors[milestone.status || "planned"]}`}
                          style={{
                            left: `${leftPos}%`,
                            width: `${barWidth}%`,
                          }}
                          onClick={() => onMilestoneClick?.(milestone)}
                        >
                          <div className="px-2 h-full flex items-center justify-center">
                            <Progress 
                              value={milestone.progress || 0} 
                              className="h-1 bg-white/30"
                            />
                          </div>
                        </div>

                        {/* Date tooltip */}
                        <div 
                          className="absolute top-full mt-1 text-xs text-muted-foreground whitespace-nowrap"
                          style={{ left: `${leftPos}%` }}
                        >
                          {format(start, "dd/MM")} - {format(end, "dd/MM")}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
