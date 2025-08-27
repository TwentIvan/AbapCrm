import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { insertDealSchema, Partner } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2 } from "lucide-react";

const formSchema = insertDealSchema.extend({
  expectedCloseDate: z.string().optional(),
});

type FormData = z.infer<typeof formSchema>;

interface DealFormProps {
  onSuccess?: () => void;
}

export default function DealForm({ onSuccess }: DealFormProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: partners } = useQuery<Partner[]>({
    queryKey: ["/api/partners"],
  });

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      title: "",
      description: "",
      value: "",
      stage: "prospecting",
      probability: 50,
      partnerId: "",
      expectedCloseDate: "",
      notes: "",
    },
  });

  const createDealMutation = useMutation({
    mutationFn: async (data: FormData) => {
      const dealData = {
        ...data,
        userId: user!.id,
        expectedCloseDate: data.expectedCloseDate ? new Date(data.expectedCloseDate).toISOString() : null,
      };
      const res = await apiRequest("POST", "/api/deals", dealData);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/deals"] });
      toast({ title: "Deal created successfully" });
      onSuccess?.();
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to create deal",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: FormData) => {
    createDealMutation.mutate(data);
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="title"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Deal Title</FormLabel>
              <FormControl>
                <Input {...field} data-testid="input-deal-title" placeholder="Enter deal title" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Description (Optional)</FormLabel>
              <FormControl>
                <Textarea 
                  {...field} 
                  data-testid="input-deal-description"
                  placeholder="Describe the opportunity..."
                  rows={3}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="value"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Deal Value (€)</FormLabel>
                <FormControl>
                  <Input 
                    {...field} 
                    type="number"
                    step="0.01"
                    data-testid="input-deal-value"
                    placeholder="0.00"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="probability"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Probability (%)</FormLabel>
                <FormControl>
                  <Input 
                    {...field} 
                    type="number"
                    min="0"
                    max="100"
                    data-testid="input-deal-probability"
                    onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="stage"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Stage</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <FormControl>
                    <SelectTrigger data-testid="select-deal-stage">
                      <SelectValue placeholder="Select stage" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="prospecting">Prospecting</SelectItem>
                    <SelectItem value="proposal">Proposal</SelectItem>
                    <SelectItem value="negotiation">Negotiation</SelectItem>
                    <SelectItem value="closing">Closing</SelectItem>
                    <SelectItem value="won">Won</SelectItem>
                    <SelectItem value="lost">Lost</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="partnerId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Partner</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger data-testid="select-deal-partner">
                      <SelectValue placeholder="Select partner" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {partners?.map((partner) => (
                      <SelectItem key={partner.id} value={partner.id}>
                        {partner.name} ({partner.type})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="expectedCloseDate"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Expected Close Date (Optional)</FormLabel>
              <FormControl>
                <Input 
                  {...field} 
                  type="date"
                  data-testid="input-deal-close-date"
                />
              </FormControl>
              <FormMessage />
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
                  {...field} 
                  data-testid="input-deal-notes"
                  placeholder="Additional notes about this deal..."
                  rows={3}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="flex justify-end space-x-2 pt-4">
          <Button
            type="submit"
            disabled={createDealMutation.isPending}
            data-testid="button-submit-deal"
          >
            {createDealMutation.isPending && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            )}
            Create Deal
          </Button>
        </div>
      </form>
    </Form>
  );
}
