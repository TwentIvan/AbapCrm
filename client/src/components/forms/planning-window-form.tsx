import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { insertPlanningWindowSchema, PlanningWindow } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Loader2 } from "lucide-react";

const formSchema = insertPlanningWindowSchema.extend({
  startDate: z.string().min(1, "Start date is required"),
  endDate: z.string().min(1, "End date is required"),
  workingHoursPerDay: z.string().optional(),
});

type FormData = z.infer<typeof formSchema>;

interface PlanningWindowFormProps {
  projectId: string;
  planningWindow?: PlanningWindow;
  onSuccess?: () => void;
}

export default function PlanningWindowForm({ projectId, planningWindow, onSuccess }: PlanningWindowFormProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      projectId,
      name: planningWindow?.name || "",
      startDate: planningWindow?.startDate ? new Date(planningWindow.startDate).toISOString().split('T')[0] : "",
      endDate: planningWindow?.endDate ? new Date(planningWindow.endDate).toISOString().split('T')[0] : "",
      workingHoursPerDay: (planningWindow?.workingHoursPerDay || 8).toString(),
      isActive: planningWindow?.isActive ?? true,
      notes: planningWindow?.notes || "",
    },
  });

  const savePlanningWindowMutation = useMutation({
    mutationFn: async (data: FormData) => {
      const windowData = {
        ...data,
        projectId,
        startDate: new Date(data.startDate),
        endDate: new Date(data.endDate),
        workingHoursPerDay: data.workingHoursPerDay ? parseInt(data.workingHoursPerDay) : 8,
      };
      
      if (planningWindow) {
        // Edit existing planning window
        const res = await apiRequest("PUT", `/api/planning-windows/${planningWindow.id}`, windowData);
        return res.json();
      } else {
        // Create new planning window
        const res = await apiRequest("POST", "/api/planning-windows", windowData);
        return res.json();
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/planning-windows"] });
      toast({ 
        title: planningWindow ? "Planning window updated successfully" : "Planning window created successfully" 
      });
      onSuccess?.();
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to save planning window",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: FormData) => {
    // Validate date range
    const startDate = new Date(data.startDate);
    const endDate = new Date(data.endDate);
    
    if (endDate <= startDate) {
      form.setError("endDate", {
        type: "manual",
        message: "End date must be after start date",
      });
      return;
    }

    savePlanningWindowMutation.mutate(data);
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6" data-testid="form-planning-window">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Window Name</FormLabel>
              <FormControl>
                <Input 
                  placeholder="e.g., Sprint 1, Phase A, Q1 Development"
                  {...field}
                  data-testid="input-planning-window-name"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="startDate"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Start Date</FormLabel>
                <FormControl>
                  <Input 
                    type="date"
                    {...field}
                    data-testid="input-planning-window-start-date"
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
                <FormLabel>End Date</FormLabel>
                <FormControl>
                  <Input 
                    type="date"
                    {...field}
                    data-testid="input-planning-window-end-date"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="workingHoursPerDay"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Working Hours per Day</FormLabel>
              <FormControl>
                <Input 
                  type="number"
                  min="1"
                  max="12"
                  placeholder="8"
                  {...field}
                  data-testid="input-planning-window-hours"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="isActive"
          render={({ field }) => (
            <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
              <div className="space-y-0.5">
                <FormLabel className="text-base">Active Window</FormLabel>
                <div className="text-[0.8rem] text-muted-foreground">
                  Active windows are used for task scheduling
                </div>
              </div>
              <FormControl>
                <Switch
                  checked={field.value}
                  onCheckedChange={field.onChange}
                  data-testid="switch-planning-window-active"
                />
              </FormControl>
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="notes"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Notes (Optional)</FormLabel>
              <FormControl>
                <Textarea 
                  placeholder="Any additional notes about this planning window..."
                  className="resize-none"
                  {...field}
                  value={field.value || ""}
                  data-testid="textarea-planning-window-notes"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="flex justify-end space-x-2">
          <Button 
            type="submit" 
            disabled={savePlanningWindowMutation.isPending}
            data-testid="button-save-planning-window"
          >
            {savePlanningWindowMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {planningWindow ? "Update Window" : "Create Window"}
          </Button>
        </div>
      </form>
    </Form>
  );
}