import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, getQueryFn } from "@/lib/queryClient";
import { insertTestExecutionSchema, type TestExecution, type Project } from "@shared/schema";
import { useOrganization } from "@/contexts/organization-context";
import { CheckCircle2, XCircle, AlertCircle, Ban, TestTube } from "lucide-react";

const formSchema = insertTestExecutionSchema.extend({
  testName: z.string().min(1, "Nome test richiesto"),
  projectId: z.string().min(1, "Progetto richiesto"),
  testResult: z.enum(["success", "failed", "partial", "blocked"]),
  description: z.string().optional(),
  executionLog: z.string().optional(),
}).omit({ userId: true, organizationId: true, executedBy: true, screenshotPaths: true });

type TestExecutionFormData = z.infer<typeof formSchema>;

interface TestExecutionFormProps {
  execution?: TestExecution;
  projectId?: string;
  onSuccess?: () => void;
  onCancel?: () => void;
}

export default function TestExecutionForm({ execution, projectId, onSuccess, onCancel }: TestExecutionFormProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { currentOrganizationId } = useOrganization();

  const { data: projects = [] } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
    queryFn: getQueryFn({ on401: "throw" }),
    enabled: !!currentOrganizationId,
    staleTime: 5 * 60 * 1000,
  });

  const form = useForm<TestExecutionFormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      testName: execution?.testName || "",
      description: execution?.description || "",
      executionLog: execution?.executionLog || "",
      projectId: execution?.projectId || projectId || "",
      testResult: execution?.testResult || "success",
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: TestExecutionFormData) => {
      return await apiRequest("POST", "/api/test-executions", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/test-executions"] });
      if (projectId) {
        queryClient.invalidateQueries({ queryKey: ["/api/test-executions/project", projectId] });
      }
      toast({
        title: "Test registrato",
        description: "L'esecuzione del test è stata registrata con successo",
      });
      onSuccess?.();
    },
    onError: (error: any) => {
      toast({
        title: "Errore",
        description: error.message || "Errore durante la registrazione del test",
        variant: "destructive",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: TestExecutionFormData) => {
      return await apiRequest("PUT", `/api/test-executions/${execution!.id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/test-executions"] });
      if (execution?.projectId) {
        queryClient.invalidateQueries({ queryKey: ["/api/test-executions/project", execution.projectId] });
      }
      toast({
        title: "Test aggiornato",
        description: "L'esecuzione del test è stata aggiornata con successo",
      });
      onSuccess?.();
    },
    onError: (error: any) => {
      toast({
        title: "Errore",
        description: error.message || "Errore durante l'aggiornamento del test",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: TestExecutionFormData) => {
    if (execution) {
      updateMutation.mutate(data);
    } else {
      createMutation.mutate(data);
    }
  };

  const getResultIcon = (result: string) => {
    switch (result) {
      case "success":
        return <CheckCircle2 className="h-4 w-4 text-success dark:text-success" />;
      case "failed":
        return <XCircle className="h-4 w-4 text-destructive dark:text-destructive" />;
      case "partial":
        return <AlertCircle className="h-4 w-4 text-warning" />;
      case "blocked":
        return <Ban className="h-4 w-4 text-muted-foreground dark:text-muted-foreground" />;
      default:
        return null;
    }
  };

  const isLoading = createMutation.isPending || updateMutation.isPending;

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <div className="grid gap-4">
          {/* Project Selection */}
          <FormField
            control={form.control}
            name="projectId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Progetto *</FormLabel>
                <Select onValueChange={field.onChange} value={field.value} disabled={!!projectId || !!execution}>
                  <FormControl>
                    <SelectTrigger data-testid="select-project">
                      <SelectValue placeholder="Seleziona progetto" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {projects.map((project) => (
                      <SelectItem key={project.id} value={project.id}>
                        {project.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Test Name */}
          <FormField
            control={form.control}
            name="testName"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Nome Test *</FormLabel>
                <FormControl>
                  <Input 
                    {...field} 
                    placeholder="es: Test Login Utente, Test Export Dati, ecc." 
                    data-testid="input-test-name"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Test Result */}
          <FormField
            control={form.control}
            name="testResult"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Risultato *</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger data-testid="select-result">
                      <SelectValue placeholder="Seleziona risultato" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="success">
                      <div className="flex items-center gap-2">
                        {getResultIcon("success")}
                        <span>Successo</span>
                      </div>
                    </SelectItem>
                    <SelectItem value="failed">
                      <div className="flex items-center gap-2">
                        {getResultIcon("failed")}
                        <span>Fallito</span>
                      </div>
                    </SelectItem>
                    <SelectItem value="partial">
                      <div className="flex items-center gap-2">
                        {getResultIcon("partial")}
                        <span>Parziale</span>
                      </div>
                    </SelectItem>
                    <SelectItem value="blocked">
                      <div className="flex items-center gap-2">
                        {getResultIcon("blocked")}
                        <span>Bloccato</span>
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Description */}
          <FormField
            control={form.control}
            name="description"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Descrizione</FormLabel>
                <FormControl>
                  <Textarea 
                    {...field} 
                    placeholder="Descrizione dell'esecuzione del test"
                    rows={3}
                    data-testid="textarea-description"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Execution Log */}
          <FormField
            control={form.control}
            name="executionLog"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Log Esecuzione</FormLabel>
                <FormControl>
                  <Textarea 
                    {...field} 
                    placeholder="Log dettagliato dell'esecuzione del test"
                    rows={6}
                    className="font-mono text-sm"
                    data-testid="textarea-log"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* TODO: Screenshot Upload Section - will be added next */}
        </div>

        <div className="flex justify-end gap-2">
          {onCancel && (
            <Button
              type="button"
              variant="outline"
              onClick={onCancel}
              disabled={isLoading}
              data-testid="button-cancel"
            >
              Annulla
            </Button>
          )}
          <Button type="submit" disabled={isLoading} data-testid="button-submit">
            <TestTube className="mr-2 h-4 w-4" />
            {isLoading ? "Salvataggio..." : execution ? "Aggiorna" : "Registra Test"}
          </Button>
        </div>
      </form>
    </Form>
  );
}
