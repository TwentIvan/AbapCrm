import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { insertSapSystemSchema, type SapSystem, type Partner } from "@shared/schema";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Server, Building, Globe } from "lucide-react";

// Extend the schema for form validation
const formSchema = insertSapSystemSchema.extend({
  applicationServerPort: z.coerce.number().min(1).max(65535).optional(),
});

interface SapSystemFormProps {
  system?: SapSystem | null;
  onSuccess?: () => void;
}

export default function SapSystemForm({ system, onSuccess }: SapSystemFormProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch partners for the partner selection
  const { data: partners } = useQuery<Partner[]>({
    queryKey: ["/api/partners"],
    queryFn: async () => {
      const res = await fetch("/api/partners", { credentials: "include" });
      if (!res.ok) throw new Error('Failed to fetch partners');
      return res.json();
    },
  });

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: system?.name || "",
      serverHost: system?.serverHost || "",
      systemNumber: system?.systemNumber || "00",
      clientNumber: system?.clientNumber || "100",
      applicationServerPort: system?.applicationServerPort || 3200,
      landscape: system?.landscape || "development",
      description: system?.description || "",
      partnerId: system?.partnerId || "",
      isActive: system?.isActive ?? true,
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: z.infer<typeof formSchema>) => {
      const response = await fetch("/api/sap-systems", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(data),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.details || 'Failed to create SAP system');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sap-systems"] });
      toast({
        title: "SAP System Created",
        description: "The SAP system has been successfully created.",
      });
      onSuccess?.();
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create SAP system.",
        variant: "destructive",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: z.infer<typeof formSchema>) => {
      const response = await fetch(`/api/sap-systems/${system!.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(data),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.details || 'Failed to update SAP system');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sap-systems"] });
      queryClient.invalidateQueries({ queryKey: ["/api/sap-systems", system!.id] });
      toast({
        title: "SAP System Updated",
        description: "The SAP system has been successfully updated.",
      });
      onSuccess?.();
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update SAP system.",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: z.infer<typeof formSchema>) => {
    if (system) {
      updateMutation.mutate(data);
    } else {
      createMutation.mutate(data);
    }
  };

  const isLoading = createMutation.isPending || updateMutation.isPending;

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Basic Information */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Server className="h-5 w-5" />
                Basic Information
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>System Name</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. Production ERP" {...field} value={field.value || ''} data-testid="input-name" />
                    </FormControl>
                    <FormDescription>
                      Descriptive name for this SAP system
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="systemNumber"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>System Number</FormLabel>
                    <FormControl>
                      <Input 
                        placeholder="e.g. 00" 
                        {...field} 
                        maxLength={2}
                        data-testid="input-system-number"
                      />
                    </FormControl>
                    <FormDescription>
                      2-digit SAP system instance number
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="landscape"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Landscape</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value || undefined}>
                      <FormControl>
                        <SelectTrigger data-testid="select-landscape">
                          <SelectValue placeholder="Select landscape" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="development">
                          <div className="flex items-center gap-2">
                            <Badge className="bg-blue-100 text-blue-800">Development</Badge>
                          </div>
                        </SelectItem>
                        <SelectItem value="test">
                          <div className="flex items-center gap-2">
                            <Badge className="bg-yellow-100 text-yellow-800">Test</Badge>
                          </div>
                        </SelectItem>
                        <SelectItem value="production">
                          <div className="flex items-center gap-2">
                            <Badge className="bg-red-100 text-red-800">Production</Badge>
                          </div>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      Select the landscape type for this SAP system
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description</FormLabel>
                    <FormControl>
                      <Textarea 
                        placeholder="Additional details about this SAP system..."
                        {...field}
                        value={field.value || ''}
                        data-testid="input-description"
                      />
                    </FormControl>
                    <FormDescription>
                      Optional description and notes about this system
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          {/* Connection Details */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Globe className="h-5 w-5" />
                Connection Details
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <FormField
                control={form.control}
                name="serverHost"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Server Host</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. sap-prod.company.com" {...field} data-testid="input-server-host" />
                    </FormControl>
                    <FormDescription>
                      Server hostname or IP address
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="applicationServerPort"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Application Server Port</FormLabel>
                      <FormControl>
                        <Input 
                          type="number" 
                          placeholder="3200" 
                          {...field}
                          onChange={(e) => field.onChange(e.target.value ? parseInt(e.target.value) : undefined)}
                          data-testid="input-application-server-port"
                        />
                      </FormControl>
                      <FormDescription>
                        SAP application server port
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="clientNumber"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Client Number</FormLabel>
                      <FormControl>
                        <Input 
                          placeholder="100" 
                          {...field}
                          maxLength={3}
                          data-testid="input-client-number"
                        />
                      </FormControl>
                      <FormDescription>
                        3-digit SAP client number
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="partnerId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Associated Partner</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-partner">
                          <SelectValue placeholder="Select a partner (optional)" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="">
                          <span className="text-gray-500">No partner selected</span>
                        </SelectItem>
                        {partners?.map((partner) => (
                          <SelectItem key={partner.id} value={partner.id}>
                            <div className="flex items-center gap-2">
                              <Building className="h-4 w-4" />
                              {partner.name}
                              {partner.company && (
                                <span className="text-sm text-gray-500">({partner.company})</span>
                              )}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      Link this SAP system to a business partner
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>
        </div>

        {/* Submit Button */}
        <div className="flex justify-end gap-3">
          <Button type="button" variant="outline" onClick={onSuccess} data-testid="button-cancel">
            Cancel
          </Button>
          <Button type="submit" disabled={isLoading} data-testid="button-submit">
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {system ? "Update System" : "Create System"}
          </Button>
        </div>
      </form>
    </Form>
  );
}