import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { DataTable } from "@/components/ui/data-table";
import { Button } from "@/components/ui/button";
import { Trash2, Clock, Calendar, Eye } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { it } from "date-fns/locale";
import type { Timesheet } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export default function TimesheetsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: timesheets = [], isLoading } = useQuery<Timesheet[]>({
    queryKey: ["/api/timesheets"],
    queryFn: async () => {
      const res = await fetch("/api/timesheets", { credentials: "include" });
      if (!res.ok) throw new Error('Failed to fetch timesheets');
      return res.json();
    },
  });

  const deleteTimesheet = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/timesheets/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/timesheets"] });
      toast({ title: "✓ Timesheet eliminato con successo" });
    },
    onError: () => {
      toast({
        title: "Errore nell'eliminazione del timesheet",
        variant: "destructive",
      });
    },
  });

  const columns = [
    {
      accessorKey: "name",
      header: "Nome",
      cell: ({ row }: { row: any }) => (
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-blue-500" />
          <span className="font-medium">{row.getValue("name")}</span>
        </div>
      ),
    },
    {
      accessorKey: "groupingFields",
      header: "Raggruppamento",
      cell: ({ row }: { row: any }) => {
        const fields = row.getValue("groupingFields") as string[];
        return (
          <div className="flex gap-1">
            {fields.map((field, index) => (
              <span
                key={index}
                className="bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded-full"
              >
                {field === "taskId" ? "Task" : 
                 field === "projectId" ? "Progetto" :
                 field === "date" ? "Data" : field}
              </span>
            ))}
          </div>
        );
      },
    },
    {
      accessorKey: "totalEntries",
      header: "Voci",
      cell: ({ row }: { row: any }) => (
        <span className="text-sm font-mono">
          {row.getValue("totalEntries")} entry
        </span>
      ),
    },
    {
      accessorKey: "totalDuration",
      header: "Durata Totale", 
      cell: ({ row }: { row: any }) => {
        const duration = row.getValue("totalDuration") as number;
        const hours = Math.floor(duration / 60);
        const minutes = duration % 60;
        return (
          <span className="text-sm font-mono">
            {hours}h {minutes}m
          </span>
        );
      },
    },
    {
      accessorKey: "createdAt",
      header: "Creato",
      cell: ({ row }: { row: any }) => {
        const date = new Date(row.getValue("createdAt"));
        return (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Calendar className="h-4 w-4" />
            {formatDistanceToNow(date, { addSuffix: true, locale: it })}
          </div>
        );
      },
    },
    {
      id: "actions",
      header: "Azioni",
      cell: ({ row }: { row: any }) => {
        const timesheet = row.original as Timesheet;
        return (
          <div className="flex items-center gap-2">
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="ghost" size="sm" data-testid="button-view-timesheet">
                  <Eye className="h-4 w-4" />
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>{timesheet.name}</DialogTitle>
                  <DialogDescription>
                    {timesheet.description && (
                      <p className="text-sm text-muted-foreground mb-4">
                        {timesheet.description}
                      </p>
                    )}
                  </DialogDescription>
                </DialogHeader>
                <TimesheetDetails timesheet={timesheet} />
              </DialogContent>
            </Dialog>
            
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="ghost" size="sm" data-testid="button-delete-timesheet">
                  <Trash2 className="h-4 w-4 text-red-500" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Elimina Timesheet</AlertDialogTitle>
                  <AlertDialogDescription>
                    Sei sicuro di voler eliminare questo timesheet? Questa azione non può essere annullata.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Annulla</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => deleteTimesheet.mutate(timesheet.id)}
                    className="bg-red-600 hover:bg-red-700"
                  >
                    Elimina
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        );
      },
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold" data-testid="text-timesheets-title">Timesheet Creati</h1>
          <p className="text-muted-foreground">
            Visualizza e gestisci i timesheet che hai salvato dalle entry di tempo
          </p>
        </div>
      </div>

      {timesheets.length === 0 && !isLoading ? (
        <div className="text-center py-12">
          <Clock className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <p className="text-muted-foreground">
            Nessun timesheet creato ancora. Vai alla pagina Time Entries e usa 'Crea Timesheet' per crearne uno.
          </p>
        </div>
      ) : (
        <DataTable 
          columns={columns} 
          data={timesheets} 
          searchPlaceholder="Cerca timesheet..."
          tableId="timesheets"
        />
      )}
    </div>
  );
}

function TimesheetDetails({ timesheet }: { timesheet: Timesheet }) {
  let groupedData;
  try {
    groupedData = JSON.parse(timesheet.groupedData);
  } catch (e) {
    groupedData = {};
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-4 p-4 bg-gray-50 rounded-lg">
        <div className="text-center">
          <div className="text-2xl font-bold text-blue-600">{timesheet.totalEntries}</div>
          <div className="text-sm text-muted-foreground">Voci totali</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold text-green-600">
            {Math.floor(timesheet.totalDuration / 60)}h {timesheet.totalDuration % 60}m
          </div>
          <div className="text-sm text-muted-foreground">Durata totale</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold text-purple-600">{Object.keys(groupedData).length}</div>
          <div className="text-sm text-muted-foreground">Gruppi</div>
        </div>
      </div>

      <div>
        <h3 className="text-lg font-semibold mb-3">Dati Raggruppati</h3>
        <div className="space-y-3">
          {Object.entries(groupedData).map(([groupKey, entries]: [string, any]) => (
            <div key={groupKey} className="border rounded-lg p-4">
              <div className="font-medium text-sm text-gray-600 mb-2">
                {groupKey}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                {Array.isArray(entries) && entries.map((entry: any, index: number) => (
                  <div key={index} className="bg-white p-3 rounded border">
                    <div className="flex justify-between items-start">
                      <div className="text-sm">
                        <div className="font-medium">{entry.taskTitle}</div>
                        <div className="text-gray-500">{entry.projectName}</div>
                        <div className="text-xs text-gray-400">{entry.formattedTime}</div>
                      </div>
                      <div className="text-xs font-mono bg-blue-100 px-2 py-1 rounded">
                        {entry.formattedDuration}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}