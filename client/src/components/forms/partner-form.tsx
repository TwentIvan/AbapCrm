import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { insertPartnerSchema } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2 } from "lucide-react";

type FormData = typeof insertPartnerSchema._type;

interface PartnerFormProps {
  onSuccess?: () => void;
}

export default function PartnerForm({ onSuccess }: PartnerFormProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const form = useForm<FormData>({
    resolver: zodResolver(insertPartnerSchema),
    defaultValues: {
      name: "",
      email: "",
      phone: "",
      company: "",
      position: "",
      address: "",
      type: "client",
      notes: "",
    },
  });

  const createPartnerMutation = useMutation({
    mutationFn: async (data: FormData) => {
      const partnerData = {
        ...data,
        userId: user!.id,
        email: data.email || null,
        phone: data.phone || null,
        company: data.company || null,
        position: data.position || null,
        address: data.address || null,
        notes: data.notes || null,
      };
      const res = await apiRequest("POST", "/api/partners", partnerData);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/partners"] });
      toast({ title: "Partner created successfully" });
      onSuccess?.();
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to create partner",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: FormData) => {
    createPartnerMutation.mutate(data);
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Name</FormLabel>
              <FormControl>
                <Input {...field} data-testid="input-partner-name" placeholder="Enter partner name" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Email (Optional)</FormLabel>
                <FormControl>
                  <Input 
                    {...field} 
                    type="email"
                    data-testid="input-partner-email" 
                    placeholder="email@example.com" 
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="phone"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Phone (Optional)</FormLabel>
                <FormControl>
                  <Input 
                    {...field} 
                    type="tel"
                    data-testid="input-partner-phone" 
                    placeholder="+1234567890" 
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
            name="company"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Company (Optional)</FormLabel>
                <FormControl>
                  <Input 
                    {...field} 
                    data-testid="input-partner-company" 
                    placeholder="Company name" 
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="position"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Position (Optional)</FormLabel>
                <FormControl>
                  <Input 
                    {...field} 
                    data-testid="input-partner-position" 
                    placeholder="Job title" 
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="type"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Type</FormLabel>
              <Select onValueChange={field.onChange} defaultValue={field.value}>
                <FormControl>
                  <SelectTrigger data-testid="select-partner-type">
                    <SelectValue placeholder="Select partner type" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="client">Client</SelectItem>
                  <SelectItem value="vendor">Vendor</SelectItem>
                  <SelectItem value="consultant">Consultant</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="address"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Address (Optional)</FormLabel>
              <FormControl>
                <Textarea 
                  {...field} 
                  data-testid="input-partner-address"
                  placeholder="Full address..."
                  rows={2}
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
                  data-testid="input-partner-notes"
                  placeholder="Additional notes about this partner..."
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
            disabled={createPartnerMutation.isPending}
            data-testid="button-submit-partner"
          >
            {createPartnerMutation.isPending && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            )}
            Create Partner
          </Button>
        </div>
      </form>
    </Form>
  );
}
