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
import { Loader2, Server, Building, Globe, Link, FileText, Cloud, Search, FolderOpen } from "lucide-react";

// Create a form-specific schema with proper types
const formSchema = z.object({
  name: z.string().min(1, "Nome richiesto"),
  systemId: z.string().min(1, "System ID richiesto").max(3, "Max 3 caratteri"),
  connectionType: z.string().default("sapgui"),
  serverHost: z.string().optional(),
  systemNumber: z.string().optional(),
  applicationServerPort: z.coerce.number().min(1).max(65535).optional(),
  landscape: z.string().optional(),
  landscapeType: z.string().optional(),
  landscapeTypeCustom: z.string().optional().nullable(),
  landscapeLevel: z.coerce.number().min(1).max(10).optional().nullable(),
  cloudLink: z.string().url("URL non valido").optional().nullable().or(z.literal("")),
  citrixLink: z.string().url("URL non valido").optional().nullable().or(z.literal("")),
  citrixAppName: z.string().optional().nullable(),
  webLink: z.string().url("URL non valido").optional().nullable().or(z.literal("")),
  sapShortcutFile: z.string().optional().nullable(),
  // Portal Cookie fields
  portalUrl: z.string().url("URL non valido").optional().nullable().or(z.literal("")),
  shortcutPattern: z.string().optional().nullable(),
  cookieTargetPath: z.string().optional().nullable(),
  cookieSystemMatch: z.string().optional().nullable(),
  description: z.string().optional(),
  partnerId: z.string().optional().nullable(),
  systemType: z.string().optional(),
  status: z.string().optional(),
  messageServerHost: z.string().optional(),
  messageServerPort: z.coerce.number().optional(),
  routerString: z.string().optional(),
  vpnConnectionId: z.string().optional(),
  defaultUsername: z.string().optional(),
  defaultPassword: z.string().optional(),
  isActive: z.boolean().optional(),
});

interface SapSystemFormProps {
  system?: SapSystem | null;
  editingSystem?: SapSystem | null;
  onSuccess?: () => void;
  onCancel?: () => void;
  defaultConnectionType?: string;
}

export default function SapSystemForm({ system, editingSystem, onSuccess, onCancel, defaultConnectionType }: SapSystemFormProps) {
  const effectiveSystem = editingSystem || system;
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

  const existingLandscapeType = (effectiveSystem as any)?.landscapeType || effectiveSystem?.landscape || "development";
  const isCustomLandscape = !["development", "test", "quality", "pre_production", "production"].includes(existingLandscapeType);
  
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: effectiveSystem?.name || "",
      systemId: effectiveSystem?.systemId || "",
      connectionType: (effectiveSystem as any)?.connectionType || defaultConnectionType || "sapgui",
      serverHost: effectiveSystem?.serverHost || "",
      systemNumber: effectiveSystem?.systemNumber || "00",
      applicationServerPort: effectiveSystem?.applicationServerPort || 3200,
      landscape: effectiveSystem?.landscape || "development",
      landscapeType: isCustomLandscape ? "other" : existingLandscapeType,
      landscapeTypeCustom: isCustomLandscape ? existingLandscapeType : "",
      landscapeLevel: (effectiveSystem as any)?.landscapeLevel || null,
      cloudLink: (effectiveSystem as any)?.cloudLink || "",
      citrixLink: (effectiveSystem as any)?.citrixLink || "",
      citrixAppName: (effectiveSystem as any)?.citrixAppName || "",
      webLink: (effectiveSystem as any)?.webLink || "",
      sapShortcutFile: (effectiveSystem as any)?.sapShortcutFile || "",
      portalUrl: (effectiveSystem as any)?.portalUrl || "",
      shortcutPattern: (effectiveSystem as any)?.shortcutPattern || "tx*.sap",
      cookieTargetPath: (effectiveSystem as any)?.cookieTargetPath || "",
      cookieSystemMatch: (effectiveSystem as any)?.cookieSystemMatch || "",
      description: effectiveSystem?.description || "",
      partnerId: effectiveSystem?.partnerId || undefined,
      defaultUsername: effectiveSystem?.defaultUsername || "",
      defaultPassword: effectiveSystem?.defaultPassword || "",
      isActive: effectiveSystem?.isActive ?? true,
    },
  });
  
  const watchLandscapeType = form.watch("landscapeType");
  const watchConnectionType = form.watch("connectionType");

  const createMutation = useMutation({
    mutationFn: async (data: z.infer<typeof formSchema>) => {
      // Handle custom landscape type
      const effectiveLandscapeType = data.landscapeType === "other" && data.landscapeTypeCustom
        ? data.landscapeTypeCustom
        : data.landscapeType;
      
      // Convert systemId to uppercase before sending
      const payload = {
        ...data,
        systemId: data.systemId?.toUpperCase() || '',
        landscapeType: effectiveLandscapeType,
        landscape: effectiveLandscapeType,
      };
      // Remove the custom field from payload
      delete (payload as any).landscapeTypeCustom;
      
      const response = await fetch("/api/sap-systems", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
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
      // Handle custom landscape type
      const effectiveLandscapeType = data.landscapeType === "other" && data.landscapeTypeCustom
        ? data.landscapeTypeCustom
        : data.landscapeType;
      
      // Convert systemId to uppercase before sending
      const payload = {
        ...data,
        systemId: data.systemId?.toUpperCase() || '',
        landscapeType: effectiveLandscapeType,
        landscape: effectiveLandscapeType,
      };
      // Remove the custom field from payload
      delete (payload as any).landscapeTypeCustom;
      
      const response = await fetch(`/api/sap-systems/${system!.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
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
                Informazioni Base
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nome Sistema</FormLabel>
                    <FormControl>
                      <Input placeholder="es. ERP Produzione" {...field} value={field.value || ''} data-testid="input-name" />
                    </FormControl>
                    <FormDescription>
                      Nome descrittivo per questo sistema SAP
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
                        placeholder="es. 00" 
                        {...field} 
                        maxLength={2}
                        data-testid="input-system-number"
                      />
                    </FormControl>
                    <FormDescription>
                      Numero istanza SAP a 2 cifre
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="landscapeType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tipo Landscape</FormLabel>
                    <Select onValueChange={(value) => {
                      field.onChange(value);
                      if (value !== "other") {
                        form.setValue('landscape', value);
                        form.setValue('landscapeTypeCustom', '');
                      }
                    }} defaultValue={field.value || undefined}>
                      <FormControl>
                        <SelectTrigger data-testid="select-landscape-type">
                          <SelectValue placeholder="Seleziona tipo landscape" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="development">
                          <div className="flex items-center gap-2">
                            <Badge className="bg-primary/10 text-primary">Sviluppo</Badge>
                          </div>
                        </SelectItem>
                        <SelectItem value="test">
                          <div className="flex items-center gap-2">
                            <Badge className="bg-warning/10 text-warning">Test</Badge>
                          </div>
                        </SelectItem>
                        <SelectItem value="quality">
                          <div className="flex items-center gap-2">
                            <Badge className="bg-purple-100 text-purple-800">Quality</Badge>
                          </div>
                        </SelectItem>
                        <SelectItem value="pre_production">
                          <div className="flex items-center gap-2">
                            <Badge className="bg-warning/10 text-warning">Pre-Produzione</Badge>
                          </div>
                        </SelectItem>
                        <SelectItem value="production">
                          <div className="flex items-center gap-2">
                            <Badge className="bg-destructive/10 text-destructive">Produzione</Badge>
                          </div>
                        </SelectItem>
                        <SelectItem value="other">
                          <div className="flex items-center gap-2">
                            <Badge className="bg-muted text-foreground">Altro...</Badge>
                          </div>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      Seleziona il tipo di landscape per questo sistema SAP
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {watchLandscapeType === "other" && (
                <FormField
                  control={form.control}
                  name="landscapeTypeCustom"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Tipo Landscape Personalizzato</FormLabel>
                      <FormControl>
                        <Input 
                          placeholder="es. sandbox, demo, training..." 
                          {...field}
                          value={field.value || ''}
                          onChange={(e) => {
                            field.onChange(e.target.value);
                            form.setValue('landscape', e.target.value || 'other');
                          }}
                          data-testid="input-landscape-type-custom"
                        />
                      </FormControl>
                      <FormDescription>
                        Inserisci un tipo di landscape personalizzato
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              <FormField
                control={form.control}
                name="landscapeLevel"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Livello Landscape</FormLabel>
                    <FormControl>
                      <Input 
                        type="number" 
                        placeholder="es. 1, 2, 3..." 
                        {...field}
                        value={field.value || ''}
                        onChange={(e) => field.onChange(e.target.value ? parseInt(e.target.value) : null)}
                        data-testid="input-landscape-level"
                      />
                    </FormControl>
                    <FormDescription>
                      Livello numerico del landscape (1=sviluppo, 5=produzione)
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
                Dettagli Connessione
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <FormField
                control={form.control}
                name="connectionType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tipo Connessione</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value || "sapgui"}>
                      <FormControl>
                        <SelectTrigger data-testid="select-connection-type">
                          <SelectValue placeholder="Seleziona tipo connessione" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="sapgui">
                          <div className="flex items-center gap-2">
                            <Server className="h-4 w-4" />
                            SAP GUI
                          </div>
                        </SelectItem>
                        <SelectItem value="cloud">
                          <div className="flex items-center gap-2">
                            <Cloud className="h-4 w-4" />
                            Cloud (Web)
                          </div>
                        </SelectItem>
                        <SelectItem value="citrix">
                          <div className="flex items-center gap-2">
                            <Globe className="h-4 w-4" />
                            Citrix
                          </div>
                        </SelectItem>
                        <SelectItem value="weblink">
                          <div className="flex items-center gap-2">
                            <Link className="h-4 w-4" />
                            Link Web
                          </div>
                        </SelectItem>
                        <SelectItem value="portal_cookie">
                          <div className="flex items-center gap-2">
                            <Globe className="h-4 w-4" />
                            Portal + Cookie
                          </div>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      Scegli come ci si connette a questo sistema SAP
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* SAP GUI Connection Fields */}
              {watchConnectionType === "sapgui" && (
                <>
                  <FormField
                    control={form.control}
                    name="serverHost"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Server Host</FormLabel>
                        <FormControl>
                          <Input placeholder="es. sap-prod.azienda.com" {...field} data-testid="input-server-host" />
                        </FormControl>
                        <FormDescription>
                          Hostname o indirizzo IP del server
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
                          <FormLabel>Porta Application Server</FormLabel>
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
                            Porta SAP application server
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="systemId"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>System ID</FormLabel>
                          <FormControl>
                            <Input 
                              placeholder="PRD" 
                              {...field}
                              maxLength={3}
                              data-testid="input-system-id"
                            />
                          </FormControl>
                          <FormDescription>
                            3-caratteri System ID SAP (es. PRD, DEV, QAS)
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <FormField
                    control={form.control}
                    name="sapShortcutFile"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="flex items-center gap-2">
                          <FileText className="h-4 w-4" />
                          File SAP Shortcut
                        </FormLabel>
                        <FormControl>
                          <div className="flex gap-2">
                            <Input 
                              placeholder="Nome file .sap (es. PRD_SE80.sap)" 
                              {...field}
                              value={field.value || ''}
                              data-testid="input-sap-shortcut-file"
                              className="flex-1"
                            />
                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              onClick={() => {
                                const input = document.createElement('input');
                                input.type = 'file';
                                input.accept = '.sap';
                                input.onchange = (e) => {
                                  const file = (e.target as HTMLInputElement).files?.[0];
                                  if (file) {
                                    field.onChange(file.name);
                                  }
                                };
                                input.click();
                              }}
                              data-testid="button-browse-sap-file"
                            >
                              <FolderOpen className="h-4 w-4" />
                            </Button>
                          </div>
                        </FormControl>
                        <FormDescription>
                          Seleziona o inserisci il nome del file .sap shortcut
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </>
              )}

              {/* Cloud Connection Fields */}
              {watchConnectionType === "cloud" && (
                <FormField
                  control={form.control}
                  name="cloudLink"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="flex items-center gap-2">
                        <Cloud className="h-4 w-4" />
                        Link Cloud
                      </FormLabel>
                      <FormControl>
                        <Input 
                          type="url"
                          placeholder="https://my-company.s4hana.cloud.sap" 
                          {...field}
                          value={field.value || ''}
                          data-testid="input-cloud-link"
                        />
                      </FormControl>
                      <FormDescription>
                        URL per sistemi SAP cloud (BTP, S/4HANA Cloud, etc.)
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              {/* Citrix Connection Fields */}
              {watchConnectionType === "citrix" && (
                <>
                  <FormField
                    control={form.control}
                    name="citrixLink"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="flex items-center gap-2">
                          <Globe className="h-4 w-4" />
                          Link Citrix
                        </FormLabel>
                        <FormControl>
                          <Input 
                            type="url"
                            placeholder="https://citrix.azienda.com" 
                            {...field}
                            value={field.value || ''}
                            data-testid="input-citrix-link"
                          />
                        </FormControl>
                        <FormDescription>
                          URL del portale Citrix per l'accesso remoto
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="citrixAppName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Nome Applicazione Citrix</FormLabel>
                        <FormControl>
                          <Input 
                            placeholder="es. SAP PRD, SAP Logon" 
                            {...field}
                            value={field.value || ''}
                            data-testid="input-citrix-app-name"
                          />
                        </FormControl>
                        <FormDescription>
                          Nome dell'applicazione SAP pubblicata su Citrix
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </>
              )}

              {/* Web Link Connection Fields */}
              {watchConnectionType === "weblink" && (
                <FormField
                  control={form.control}
                  name="webLink"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="flex items-center gap-2">
                        <Link className="h-4 w-4" />
                        Link Web
                      </FormLabel>
                      <FormControl>
                        <Input 
                          type="url"
                          placeholder="https://portale.azienda.com/sap" 
                          {...field}
                          value={field.value || ''}
                          data-testid="input-web-link"
                        />
                      </FormControl>
                      <FormDescription>
                        URL generico per accesso web (portali, webapp, etc.)
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              {/* Portal + Cookie Connection Fields */}
              {watchConnectionType === "portal_cookie" && (
                <>
                  <FormField
                    control={form.control}
                    name="portalUrl"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="flex items-center gap-2">
                          <Globe className="h-4 w-4" />
                          URL Portale
                        </FormLabel>
                        <FormControl>
                          <Input
                            type="url"
                            placeholder="https://portale.cliente.com/sap"
                            {...field}
                            value={field.value || ''}
                            data-testid="input-portal-url"
                          />
                        </FormControl>
                        <FormDescription>
                          URL del portale web da cui scaricare il file shortcut .sap
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="shortcutPattern"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Pattern file shortcut (glob)</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="tx*.sap"
                            {...field}
                            value={field.value || ''}
                            data-testid="input-shortcut-pattern"
                          />
                        </FormControl>
                        <FormDescription>
                          Pattern glob per identificare il file .sap scaricato (es. tx*.sap, HTS*.sap)
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="cookieTargetPath"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Percorso cookie di destinazione</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="C:\\Users\\user\\AppData\\Local\\SAP\\cookies\\"
                            {...field}
                            value={field.value || ''}
                            data-testid="input-cookie-target-path"
                          />
                        </FormControl>
                        <FormDescription>
                          Percorso locale dove il cookie estratto viene scritto
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="cookieSystemMatch"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Filtro [System] Name</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="HTS"
                            {...field}
                            value={field.value || ''}
                            data-testid="input-cookie-system-match"
                          />
                        </FormControl>
                        <FormDescription>
                          Valore da cercare nel campo [System] Name= dello shortcut per identificare il sistema
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </>
              )}

              <FormField
                control={form.control}
                name="partnerId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Partner Associato</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value || undefined}>
                      <FormControl>
                        <SelectTrigger data-testid="select-partner">
                          <SelectValue placeholder="Seleziona un partner (opzionale)" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {partners?.map((partner) => (
                          <SelectItem key={partner.id} value={partner.id}>
                            <div className="flex items-center gap-2">
                              <Building className="h-4 w-4" />
                              {partner.name}
                              {partner.company && (
                                <span className="text-sm text-muted-foreground">({partner.company})</span>
                              )}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      Collega questo sistema SAP a un partner
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          {/* Default Credentials */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Server className="h-5 w-5" />
                Credenziali di Default
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <FormField
                control={form.control}
                name="defaultUsername"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Username di Default</FormLabel>
                    <FormControl>
                      <Input 
                        placeholder="es. IDG-DELGIU" 
                        {...field} 
                        value={field.value || ''}
                        data-testid="input-default-username"
                      />
                    </FormControl>
                    <FormDescription>
                      Username da utilizzare quando non ci sono credenziali specifiche configurate
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="defaultPassword"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Password di Default</FormLabel>
                    <FormControl>
                      <Input 
                        type="password"
                        placeholder="Password di default" 
                        {...field} 
                        value={field.value || ''}
                        data-testid="input-default-password"
                      />
                    </FormControl>
                    <FormDescription>
                      Password da utilizzare quando non ci sono credenziali specifiche configurate
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
            Annulla
          </Button>
          <Button type="submit" disabled={isLoading} data-testid="button-submit">
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {system ? "Aggiorna Sistema" : "Crea Sistema"}
          </Button>
        </div>
      </form>
    </Form>
  );
}