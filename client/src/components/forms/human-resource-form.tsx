import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { insertHumanResourceSchema, type HumanResource, type User } from "@shared/schema";
import { Users, DollarSign, Calendar, User as UserIcon } from "lucide-react";

const SKILL_LEVELS = [
  { value: "junior", label: "Junior" },
  { value: "mid", label: "Mid" },
  { value: "senior", label: "Senior" },
  { value: "lead", label: "Lead" },
  { value: "principal", label: "Principal" }
];

const ROLES = [
  { value: "developer", label: "Developer" },
  { value: "analyst", label: "Analyst" },
  { value: "consultant", label: "Consultant" },
  { value: "designer", label: "Designer" },
  { value: "manager", label: "Manager" },
  { value: "architect", label: "Architect" },
  { value: "tester", label: "Tester" }
];

const DEPARTMENTS = [
  { value: "IT", label: "IT" },
  { value: "Consulting", label: "Consulting" },
  { value: "Analysis", label: "Analysis" },
  { value: "Design", label: "Design" },
  { value: "Management", label: "Management" }
];

// Schema personalizzato per il form (string values per compatibility con HTML inputs)
const formSchema = z.object({
  name: z.string().min(1, "Nome richiesto"),
  role: z.string().min(1, "Ruolo richiesto"),
  skillLevel: z.string().min(1, "Livello richiesto"),
  department: z.string().optional(),
  costCenter: z.string().optional(),
  linkedUserId: z.string().optional(),
  baseHourlyRate: z.string().optional(),
  isActive: z.boolean().default(true),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  notes: z.string().optional(),
});

type HumanResourceFormData = z.infer<typeof formSchema>;

interface HumanResourceFormProps {
  humanResource?: HumanResource;
  onSuccess?: () => void;
}

export function HumanResourceForm({ humanResource, onSuccess }: HumanResourceFormProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Carica tutti gli utenti per il collegamento
  const { data: users = [], isLoading: usersLoading, error: usersError } = useQuery<User[]>({
    queryKey: ["/api/users"],
    staleTime: 5 * 60 * 1000,
  });

  // Debug degli utenti
  console.log("Users data:", users);
  console.log("Users loading:", usersLoading);
  console.log("Users error:", usersError);

  const form = useForm<HumanResourceFormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: humanResource?.name || "",
      role: humanResource?.role || "",
      skillLevel: humanResource?.skillLevel || "",
      department: humanResource?.department || "",
      costCenter: humanResource?.costCenter || "",
      linkedUserId: humanResource?.linkedUserId || undefined,
      baseHourlyRate: humanResource?.baseHourlyRate ? humanResource.baseHourlyRate.toString() : "",
      isActive: humanResource?.isActive ?? true,
      startDate: humanResource?.startDate ? new Date(humanResource.startDate).toISOString().split('T')[0] : "",
      endDate: humanResource?.endDate ? new Date(humanResource.endDate).toISOString().split('T')[0] : "",
      notes: humanResource?.notes || "",
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (data: HumanResourceFormData) => {
      // Prepara i dati per l'API
      const resourceData = {
        name: data.name,
        role: data.role,
        skillLevel: data.skillLevel,
        department: data.department && data.department !== "none" ? data.department : null,
        costCenter: data.costCenter || null,
        linkedUserId: data.linkedUserId && data.linkedUserId !== "none" ? data.linkedUserId : null,
        baseHourlyRate: data.baseHourlyRate ? parseFloat(data.baseHourlyRate) : null,
        isActive: data.isActive,
        startDate: data.startDate ? new Date(data.startDate) : null,
        endDate: data.endDate ? new Date(data.endDate) : null,
        notes: data.notes || null,
      };

      if (humanResource) {
        const res = await apiRequest("PUT", `/api/human-resources/${humanResource.id}`, resourceData);
        return res.json();
      } else {
        const res = await apiRequest("POST", "/api/human-resources", resourceData);
        return res.json();
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/human-resources"] });
      toast({
        title: "Successo",
        description: humanResource ? "Risorsa aggiornata" : "Risorsa creata con successo",
      });
      onSuccess?.();
    },
    onError: (error) => {
      toast({
        title: "Errore",
        description: "Errore durante il salvataggio della risorsa",
        variant: "destructive",
      });
    }
  });

  const onSubmit = (data: HumanResourceFormData) => {
    saveMutation.mutate(data);
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6" data-testid="form-human-resource">
        {/* Informazioni Base */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserIcon className="h-5 w-5" />
              Informazioni Base
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nome Risorsa *</FormLabel>
                    <FormControl>
                      <Input placeholder="Mario Rossi" {...field} data-testid="input-name" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="linkedUserId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Utente Collegato</FormLabel>
                    <FormControl>
                      <Select value={field.value || ""} onValueChange={field.onChange}>
                        <SelectTrigger data-testid="select-linked-user">
                          <SelectValue placeholder="Seleziona utente (opzionale)" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Nessun utente collegato</SelectItem>
                          {users.map(user => (
                            <SelectItem key={user.id} value={user.id}>
                              {user.username} - {user.firstName} {user.lastName}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <FormField
                control={form.control}
                name="role"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Ruolo *</FormLabel>
                    <FormControl>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <SelectTrigger data-testid="select-role">
                          <SelectValue placeholder="Seleziona ruolo" />
                        </SelectTrigger>
                        <SelectContent>
                          {ROLES.map(role => (
                            <SelectItem key={role.value} value={role.value}>
                              {role.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="skillLevel"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Livello *</FormLabel>
                    <FormControl>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <SelectTrigger data-testid="select-skill-level">
                          <SelectValue placeholder="Seleziona livello" />
                        </SelectTrigger>
                        <SelectContent>
                          {SKILL_LEVELS.map(level => (
                            <SelectItem key={level.value} value={level.value}>
                              {level.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="department"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Dipartimento</FormLabel>
                    <FormControl>
                      <Select value={field.value || ""} onValueChange={field.onChange}>
                        <SelectTrigger data-testid="select-department">
                          <SelectValue placeholder="Seleziona dipartimento" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Nessun dipartimento</SelectItem>
                          {DEPARTMENTS.map(dept => (
                            <SelectItem key={dept.value} value={dept.value}>
                              {dept.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="costCenter"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Centro di Costo</FormLabel>
                  <FormControl>
                    <Input placeholder="CC001" {...field} data-testid="input-cost-center" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        {/* Tariffa e Disponibilità */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <DollarSign className="h-5 w-5" />
              Tariffa e Disponibilità
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <FormField
                control={form.control}
                name="baseHourlyRate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tariffa Base Oraria (€)</FormLabel>
                    <FormControl>
                      <Input 
                        type="number"
                        step="0.01"
                        placeholder="75.00"
                        {...field}
                        data-testid="input-base-hourly-rate"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="startDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Data Inizio</FormLabel>
                    <FormControl>
                      <Input 
                        type="date"
                        {...field}
                        data-testid="input-start-date"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="endDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Data Fine</FormLabel>
                    <FormControl>
                      <Input 
                        type="date"
                        {...field}
                        data-testid="input-end-date"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Note</FormLabel>
                  <FormControl>
                    <Textarea 
                      placeholder="Note aggiuntive sulla risorsa..."
                      className="h-20"
                      {...field}
                      data-testid="textarea-notes"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        <div className="flex justify-end gap-3">
          <Button
            type="submit"
            disabled={saveMutation.isPending}
            data-testid="button-save"
          >
            {saveMutation.isPending ? "Salvando..." : (humanResource ? "Aggiorna Risorsa" : "Crea Risorsa")}
          </Button>
        </div>
      </form>
    </Form>
  );
}