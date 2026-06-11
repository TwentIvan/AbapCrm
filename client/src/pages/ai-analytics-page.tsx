import { useQuery } from "@tanstack/react-query";
import { getQueryFn } from "@/lib/queryClient";
import { useOrganization } from "@/contexts/organization-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import Sidebar from "@/components/layout/sidebar";
import Header from "@/components/layout/header";
import { Brain, TrendingUp, Cpu, FolderOpen, Loader2 } from "lucide-react";

interface ModelRow {
  modelKey: string;
  spendEur: number;
  executions: number;
  avgRating: number | null;
}
interface TaskTypeRow {
  taskType: string;
  spendEur: number;
  executions: number;
}
interface ProjectRow {
  projectId: string;
  name: string;
  spendEur: number;
}
interface AnalyticsData {
  totalSpendEur: number;
  byModel: ModelRow[];
  byTaskType: TaskTypeRow[];
  byProject: ProjectRow[];
}

const TASK_TYPE_LABELS: Record<string, string> = {
  development: "Sviluppo",
  analysis: "Analisi",
  design: "Design",
  testing: "Testing",
  documentation: "Documentazione",
  support: "Supporto",
  maintenance: "Manutenzione",
  consulting: "Consulenza",
  meeting: "Meeting",
  other: "Altro",
};

export default function AiAnalyticsPage() {
  const { currentOrganizationId } = useOrganization();

  const { data, isLoading, error } = useQuery<AnalyticsData>({
    queryKey: ["/api/ai/analytics"],
    queryFn: getQueryFn({ on401: "throw" }),
    enabled: !!currentOrganizationId,
  });

  return (
    <div className="flex h-screen bg-background">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header title="AI Analytics" subtitle="Monitoraggio spesa AI ultimi 90 giorni" />
        <main className="flex-1 overflow-auto p-6 space-y-6">
          {isLoading && (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          )}
          {error && (
            <div className="text-destructive text-sm">
              Errore nel caricamento dei dati analytics.
            </div>
          )}
          {!isLoading && data && (
            <>
              {/* Total spend */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Brain className="h-5 w-5 text-primary" />
                    Spesa Totale AI — ultimi 90 giorni
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-4xl font-bold tabular-nums">
                    €{data.totalSpendEur.toFixed(4)}
                  </p>
                  <p className="text-sm text-muted-foreground mt-1">
                    {(data.byModel ?? []).reduce((s, m) => s + m.executions, 0)} esecuzioni
                    completate
                  </p>
                </CardContent>
              </Card>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* By model */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Cpu className="h-4 w-4" />
                      Per Modello
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Modello</TableHead>
                          <TableHead className="text-right">Spesa EUR</TableHead>
                          <TableHead className="text-right">Exec.</TableHead>
                          <TableHead className="text-right">Rating</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(data.byModel ?? []).map((row) => (
                          <TableRow key={row.modelKey}>
                            <TableCell>
                              <code className="text-xs bg-muted px-1 py-0.5 rounded">
                                {row.modelKey}
                              </code>
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              €{row.spendEur.toFixed(4)}
                            </TableCell>
                            <TableCell className="text-right">{row.executions}</TableCell>
                            <TableCell className="text-right">
                              {row.avgRating != null ? (
                                <Badge variant="outline">{row.avgRating.toFixed(1)} ⭐</Badge>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                        {(data.byModel ?? []).length === 0 && (
                          <TableRow>
                            <TableCell
                              colSpan={4}
                              className="text-center text-muted-foreground py-8"
                            >
                              Nessuna esecuzione nei 90 giorni
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>

                {/* By task type */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                      <TrendingUp className="h-4 w-4" />
                      Per Tipo Attività
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Tipo</TableHead>
                          <TableHead className="text-right">Spesa EUR</TableHead>
                          <TableHead className="text-right">Exec.</TableHead>
                          <TableHead className="text-right">Costo medio</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(data.byTaskType ?? []).map((row) => (
                          <TableRow key={row.taskType}>
                            <TableCell>
                              {TASK_TYPE_LABELS[row.taskType] ?? row.taskType}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              €{row.spendEur.toFixed(4)}
                            </TableCell>
                            <TableCell className="text-right">{row.executions}</TableCell>
                            <TableCell className="text-right tabular-nums text-muted-foreground">
                              €
                              {row.executions > 0
                                ? (row.spendEur / row.executions).toFixed(4)
                                : "0.0000"}
                            </TableCell>
                          </TableRow>
                        ))}
                        {(data.byTaskType ?? []).length === 0 && (
                          <TableRow>
                            <TableCell
                              colSpan={4}
                              className="text-center text-muted-foreground py-8"
                            >
                              Nessun dato
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              </div>

              {/* By project */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <FolderOpen className="h-4 w-4" />
                    Per Progetto
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Progetto</TableHead>
                        <TableHead className="text-right">Spesa EUR</TableHead>
                        <TableHead className="text-right">% sul totale</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(data.byProject ?? []).map((row) => (
                        <TableRow key={row.projectId}>
                          <TableCell className="font-medium">{row.name}</TableCell>
                          <TableCell className="text-right tabular-nums">
                            €{row.spendEur.toFixed(4)}
                          </TableCell>
                          <TableCell className="text-right text-muted-foreground">
                            {data.totalSpendEur > 0
                              ? ((row.spendEur / data.totalSpendEur) * 100).toFixed(1) + "%"
                              : "—"}
                          </TableCell>
                        </TableRow>
                      ))}
                      {(data.byProject ?? []).length === 0 && (
                        <TableRow>
                          <TableCell
                            colSpan={3}
                            className="text-center text-muted-foreground py-8"
                          >
                            Nessun dato
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </>
          )}
        </main>
      </div>
    </div>
  );
}
