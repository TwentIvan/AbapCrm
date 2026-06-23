import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { insertDealSchema, Partner, type RateAgreement } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Loader2, DollarSign, Zap } from "lucide-react";

const formSchema = insertDealSchema.extend({
  expectedCloseDate: z.string().optional(),
  hourlyRate: z.string().optional(),
});

type FormData = z.infer<typeof formSchema>;

interface DealFormProps {
  deal?: any;
  onSuccess?: () => void;
}

export default function DealForm({ deal, onSuccess }: DealFormProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [resolvedRate, setResolvedRate] = useState<RateAgreement | null>(null);
  const [isResolvingRate, setIsResolvingRate] = useState(false);

  const { data: partners } = useQuery<Partner[]>({
    queryKey: ["/api/partners"],
    queryFn: async () => {
      const res = await fetch("/api/partners", { credentials: "include" });
      if (!res.ok) throw new Error('Failed to fetch partners');
      return res.json();
    },
  });

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      title: deal?.title || "",
      description: deal?.description || "",
      value: deal?.value || "",
      hourlyRate: deal?.hourlyRate || "",
      stage: deal?.stage || "prospecting",
      probability: deal?.probability || 50,
      partnerId: deal?.partnerId || "none",
      expectedCloseDate: deal?.expectedCloseDate ? new Date(deal.expectedCloseDate).toISOString().split('T')[0] : "",
      notes: deal?.notes || "",
    },
  });

  const createDealMutation = useMutation({
    mutationFn: async (data: FormData) => {
      const dealData = {
        ...data,
        userId: user!.id,
        partnerId: data.partnerId && data.partnerId !== "none" ? data.partnerId : null,
        hourlyRate: data.hourlyRate ? parseFloat(data.hourlyRate) : null,
        expectedCloseDate: data.expectedCloseDate ? new Date(data.expectedCloseDate).toISOString() : null,
      };
      
      if (deal) {
        // Update existing deal
        const res = await apiRequest("PUT", `/api/deals/${deal.id}`, dealData);
        return res.json();
      } else {
        // Create new deal
        const res = await apiRequest("POST", "/api/deals", dealData);
        return res.json();
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/deals"] });
      toast({ title: deal ? "Deal updated successfully" : "Deal created successfully" });
      onSuccess?.();
    },
    onError: (error: Error) => {
      toast({
        title: deal ? "Failed to update deal" : "Failed to create deal",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Auto-resolve rate when partner changes
  const resolveRate = async (partnerId: string | null) => {
    if (!partnerId || partnerId === "none") {
      setResolvedRate(null);
      return;
    }

    setIsResolvingRate(true);
    try {
      const res = await apiRequest("POST", "/api/rate-agreements/resolve", {
        partnerId
      });
      const agreement = await res.json();
      
      if (agreement) {
        setResolvedRate(agreement);
        // Auto-populate hourly rate if not manually set
        if (!form.getValues("hourlyRate")) {
          form.setValue("hourlyRate", agreement.hourlyRate);
        }
        toast({
          title: "Tariffa rilevata automaticamente",
          description: `Accordo: ${agreement.name} - €${agreement.hourlyRate}/h`,
        });
      } else {
        setResolvedRate(null);
      }
    } catch (error) {
      console.error("Error resolving rate:", error);
      setResolvedRate(null);
    } finally {
      setIsResolvingRate(false);
    }
  };

  // Watch partner changes for auto-resolution
  const watchedPartnerId = form.watch("partnerId");
  useEffect(() => {
    resolveRate(watchedPartnerId);
  }, [watchedPartnerId]);

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
                  value={field.value || ""}
                  data-testid="input-deal-description"
                  placeholder="Describe the opportunity..."
                  rows={3}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
            name="hourlyRate"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="flex items-center gap-2">
                  Tariffa Oraria (€/h)
                  {isResolvingRate && <Loader2 className="h-3 w-3 animate-spin" />}
                  {resolvedRate && <Zap className="h-3 w-3 text-success" />}
                </FormLabel>
                <FormControl>
                  <Input 
                    {...field} 
                    type="number"
                    step="0.01"
                    data-testid="input-deal-hourly-rate"
                    placeholder="0.00"
                  />
                </FormControl>
                {resolvedRate && (
                  <div className="text-xs text-muted-foreground">
                    <Badge variant="outline" className="text-xs">
                      <DollarSign className="h-3 w-3 mr-1" />
                      Auto: {resolvedRate.name}
                    </Badge>
                  </div>
                )}
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
                    <SelectItem value="none">No partner</SelectItem>
                    {partners
                      ?.filter(partner => partner.id && partner.id.trim() !== '')
                      ?.map((partner) => (
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
                  value={field.value || ""}
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
