import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Search, CheckCircle, Loader2, Wifi, Key, Bot, Zap, AlertTriangle, User, Smartphone, RefreshCw } from "lucide-react";
import { z } from "zod";

interface SimpleVPNFormProps {
  onSuccess: () => void;
  onCancel: () => void;
  partners: Array<{ id: string; name: string; company: string }>;
}

interface VpnSoftware {
  id: string;
  name: string;
  vendor: string;
  version?: string;
  description?: string;
  canReadConfigs?: boolean;
  automationType?: 'full' | 'credentials' | 'manual';
}

const formSchema = z.object({
  name: z.string().min(1, "Nome richiesto"),
  partnerId: z.string().min(1, "Cliente richiesto"),
  vpnSoftware: z.string().min(1, "Software VPN richiesto"),
  existingConnectionId: z.string().min(1, "Seleziona una connessione esistente"),
});

interface DiscoveredConnection {
  id: string;
  name: string;
  type: string;
  details: string;
  configured: boolean;
}

export default function SimpleVPNForm({ onSuccess, onCancel, partners }: SimpleVPNFormProps) {
  const { toast } = useToast();
  const [discoveredConnections, setDiscoveredConnections] = useState<DiscoveredConnection[]>([]);
  const [isDiscovering, setIsDiscovering] = useState(false);
  const [discoveryComplete, setDiscoveryComplete] = useState(false);
  const [selectedSoftware, setSelectedSoftware] = useState<VpnSoftware | null>(null);
  const [showCredentialsForm, setShowCredentialsForm] = useState(false);
  const [isScanning, setIsScanning] = useState(false);

  // Scan "server-triggered": accoda un job e attende che il companion sul Mac
  // esegua il probe, poi ricarica la lista del software rilevato.
  const scanMyMac = async () => {
    setIsScanning(true);
    try {
      const res = await apiRequest("POST", "/api/hubup/jobs", {});
      const job = await res.json();
      toast({ title: "Scansione richiesta", description: "In attesa del companion sul Mac..." });
      const started = Date.now();
      let done = false;
      while (Date.now() - started < 120000) {
        await new Promise((r) => setTimeout(r, 2500));
        const jr = await fetch(`/api/hubup/jobs/${job.id}`, { credentials: "include" });
        if (!jr.ok) break;
        const j = await jr.json();
        if (j.status === "done") {
          await refetchSoftware();
          toast({ title: "Scansione completata", description: `Rilevati ${j.methodsCount ?? 0} metodi su ${j.hostname || "il tuo Mac"}.` });
          done = true;
          break;
        }
        if (j.status === "error") {
          toast({ variant: "destructive", title: "Scansione fallita", description: j.error || "Errore del companion" });
          done = true;
          break;
        }
      }
      if (!done) {
        toast({ variant: "destructive", title: "Nessuna risposta", description: "Il companion non ha risposto. È in esecuzione sul Mac?" });
      }
    } catch (error: any) {
      toast({ variant: "destructive", title: "Errore", description: error?.message || "Impossibile avviare la scansione" });
    } finally {
      setIsScanning(false);
    }
  };

  // Load VPN software from the real workstation scan (Hub Up probe), not the
  // static catalog: mostra solo il software VPN effettivamente rilevato.
  const { data: vpnSoftware = [], isLoading: isLoadingSoftware, refetch: refetchSoftware } = useQuery<VpnSoftware[]>({
    queryKey: ["/api/vpn-software/discovered"],
    queryFn: async () => {
      try {
        const res = await fetch("/api/vpn-software/discovered", { credentials: "include" });
        if (!res.ok) {
          console.log('[VPN-SOFTWARE] Error loading discovered software:', res.status);
          return []; // Return empty array instead of throwing
        }
        return res.json();
      } catch (error) {
        console.log('[VPN-SOFTWARE] Network error:', error);
        return []; // Return empty array on any error
      }
    },
    retry: false, // Don't retry failed requests
  });

  const form = useForm({
    resolver: zodResolver(formSchema),
    mode: "onChange",
    defaultValues: {
      name: "",
      partnerId: "",
      vpnSoftware: "",
      existingConnectionId: "",
    },
  });

  const discoverMutation = useMutation({
    mutationFn: async (software: string) => {
      console.log("🔍 Discovering connections for software:", software);
      const response = await apiRequest("POST", "/api/vpn/discover", { software });
      const data = await response.json();
      console.log("🔍 Raw response data:", data);
      return data;
    },
    onMutate: () => {
      setIsDiscovering(true);
      setDiscoveredConnections([]);
      setDiscoveryComplete(false);
    },
    onSuccess: (data: any) => {
      console.log("🔍 Discovery result:", data);
      const connections = data.connections || [];
      setDiscoveredConnections(connections);
      setDiscoveryComplete(true);
      setIsDiscovering(false);
      
      if (connections.length > 0) {
        // Found real configurations
        toast({
          title: "Configurazioni Trovate",
          description: `Trovate ${connections.length} configurazioni reali per ${selectedSoftware?.name}`,
        });
      } else {
        // No real configurations found - show credentials form
        console.log("🔍 No real configurations found - showing credentials form");
        setShowCredentialsForm(true);
        toast({
          title: "Configurazioni Non Trovate",
          description: `Nessuna configurazione esistente per ${selectedSoftware?.name}. Inserisci le credenziali manualmente.`,
        });
      }
    },
    onError: (error: any) => {
      setIsDiscovering(false);
      toast({
        variant: "destructive",
        title: "Errore Discovery",
        description: "Impossibile cercare connessioni esistenti",
      });
    }
  });

  const createMutation = useMutation({
    mutationFn: (data: z.infer<typeof formSchema>) => {
      const selectedConnection = discoveredConnections.find(c => c.id === data.existingConnectionId);
      
      return apiRequest("POST", "/api/vpn-connections", {
        name: data.name,
        partnerId: data.partnerId,
        vpnSoftware: data.vpnSoftware,
        existingConnectionRef: data.existingConnectionId,
        existingConnectionName: selectedConnection?.name,
        existingConnectionDetails: selectedConnection?.details,
        connectionType: selectedConnection?.type,
        isActive: true,
      });
    },
    onSuccess: () => {
      toast({
        title: "Connessione VPN Configurata",
        description: "Riferimento alla connessione esistente salvato con successo",
      });
      onSuccess();
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Errore",
        description: error.message || "Impossibile salvare la configurazione VPN",
      });
    }
  });

  // Handle software selection change with automatic discovery
  const handleSoftwareChange = async (softwareId: string) => {
    console.log('🔍 Software changed to:', softwareId);
    
    // Reset states
    setDiscoveredConnections([]);
    setDiscoveryComplete(false);
    setShowCredentialsForm(false);
    
    // Find the selected software
    const software = vpnSoftware.find(s => s.id === softwareId);
    setSelectedSoftware(software || null);
    
    if (!software) return;
    
    console.log('🔍 Selected software:', software.name, 'Vendor:', software.vendor);
    console.log('🔍 Automation type:', software.automationType, 'Can read configs:', software.canReadConfigs);
    
    // If software can read configurations, do automatic discovery
    if (software.canReadConfigs || software.automationType === 'full') {
      console.log('🔍 Software can read configs - starting automatic discovery');
      discoverMutation.mutate(softwareId);
    } else {
      // Software requires manual credentials
      console.log('🔍 Software requires credentials - showing credentials form');
      setShowCredentialsForm(true);
      setDiscoveryComplete(true);
    }
  };

  const handleDiscover = () => {
    const software = form.getValues('vpnSoftware');
    discoverMutation.mutate(software);
  };

  const onSubmit = (data: z.infer<typeof formSchema>) => {
    console.log("🔍 Simple VPN form submit:", data);
    createMutation.mutate(data);
  };

  const selectedSoftwareLabels = {
    forticlient: 'FortiClient',
    macos_native: 'VPN nativa macOS',
    openconnect: 'OpenConnect (Cisco)',
    openvpn: 'OpenVPN'
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        
        {/* Basic Info */}
        <Card>
          <CardHeader>
            <CardTitle>Nuova Connessione VPN</CardTitle>
            <CardDescription>
              Configura una nuova connessione usando software già installato
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nome Connessione *</FormLabel>
                  <FormControl>
                    <input
                      type="text"
                      placeholder="es. Dolomiti Energia VPN"
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                      {...field}
                      data-testid="input-name"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="partnerId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Cliente/Partner *</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value} data-testid="select-partner">
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Seleziona cliente" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {partners.map((partner) => (
                        <SelectItem key={partner.id} value={partner.id}>
                          {partner.name} - {partner.company}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        {/* Software Selection */}
        <Card>
          <CardHeader>
            <CardTitle>Software VPN</CardTitle>
            <CardDescription>
              Quale software VPN usi per connetterti?
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">

            <div className="flex items-center justify-between rounded-md border border-dashed p-3">
              <p className="text-sm text-muted-foreground">
                Non vedi il tuo software? Avvia una scansione del Mac (richiede il companion attivo).
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={scanMyMac}
                disabled={isScanning}
                data-testid="button-scan-mac"
              >
                {isScanning ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Scansione...</>
                ) : (
                  <><RefreshCw className="mr-2 h-4 w-4" /> Scansiona il mio Mac</>
                )}
              </Button>
            </div>

            <FormField
              control={form.control}
              name="vpnSoftware"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Software Installato</FormLabel>
                  <Select onValueChange={(value) => {
                    field.onChange(value);
                    handleSoftwareChange(value);
                  }} defaultValue={field.value} data-testid="select-vpn-software">
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {isLoadingSoftware ? (
                        <SelectItem value="loading" disabled>
                          <Loader2 className="h-4 w-4 animate-spin mr-2" />
                          Caricamento software...
                        </SelectItem>
                      ) : vpnSoftware.length > 0 ? (
                        vpnSoftware.map((software) => (
                          <SelectItem key={software.id} value={software.id}>
                            {software.name} {software.vendor && `(${software.vendor})`}
                            {software.version && ` v${software.version}`}
                          </SelectItem>
                        ))
                      ) : (
                        <SelectItem value="none" disabled>
                          Nessun software disponibile
                        </SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Only show manual discovery button if software requires manual discovery */}
            {selectedSoftware && !selectedSoftware.canReadConfigs && selectedSoftware.automationType !== 'full' && (
              <Button
                type="button"
                variant="outline"
                onClick={handleDiscover}
                disabled={isDiscovering || !form.getValues('vpnSoftware')}
                className="w-full"
                data-testid="button-discover"
              >
                {isDiscovering ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Cercando connessioni...
                  </>
                ) : (
                  <>
                    <Search className="mr-2 h-4 w-4" />
                    Trova Connessioni Esistenti
                  </>
                )}
              </Button>
            )}
            
            {/* Show automatic discovery status */}
            {selectedSoftware && (selectedSoftware.canReadConfigs || selectedSoftware.automationType === 'full') && (
              <Alert>
                <CheckCircle className="h-4 w-4" />
                <AlertDescription>
                  Discovery automatico per {selectedSoftware.name}...
                  {isDiscovering && (
                    <Loader2 className="ml-2 h-4 w-4 animate-spin inline" />
                  )}
                </AlertDescription>
              </Alert>
            )}

            {isDiscovering && (
              <Alert>
                <Loader2 className="h-4 w-4 animate-spin" />
                <AlertDescription>
                  Scansionando {selectedSoftwareLabels[form.getValues('vpnSoftware') as keyof typeof selectedSoftwareLabels]} per connessioni configurate...
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>

        {/* Credentials Form for Software that Cannot Read Configs */}
        {showCredentialsForm && selectedSoftware && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Key className="h-5 w-5" />
                Configurazione {selectedSoftware.name}
              </CardTitle>
              <CardDescription>
                {selectedSoftware.name} richiede l'inserimento manuale delle credenziali
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Alert>
                <AlertDescription>
                  Questo software non può leggere configurazioni esistenti. 
                  Inserisci le credenziali VPN per {form.getValues('name') || 'questo cliente'}.
                </AlertDescription>
              </Alert>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="server">Server VPN</Label>
                  <input 
                    id="server"
                    type="text" 
                    placeholder="vpn.company.com"
                    className="w-full p-2 border rounded"
                  />
                </div>
                <div>
                  <Label htmlFor="port">Porta</Label>
                  <input 
                    id="port"
                    type="text" 
                    placeholder="443"
                    className="w-full p-2 border rounded"
                  />
                </div>
                <div>
                  <Label htmlFor="username">Username</Label>
                  <input 
                    id="username"
                    type="text" 
                    placeholder="usuario@company.com"
                    className="w-full p-2 border rounded"
                  />
                </div>
                <div>
                  <Label htmlFor="password">Password</Label>
                  <input 
                    id="password"
                    type="password" 
                    placeholder="••••••••"
                    className="w-full p-2 border rounded"
                  />
                </div>
              </div>
              
              <Button className="w-full" type="submit">
                Salva Configurazione Manuale
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Connection Selection - only shown if real configurations were found */}
        {discoveryComplete && discoveredConnections.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Configurazioni Reali Trovate</CardTitle>
              <CardDescription>
                Seleziona la configurazione esistente che vuoi usare per {form.getValues('name') || 'questo cliente'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {discoveredConnections.length > 0 && (
                <FormField
                  control={form.control}
                  name="existingConnectionId"
                  render={({ field }) => (
                    <FormItem>
                      <div className="space-y-3">
                        {discoveredConnections.map((connection) => {
                          // Determine automation level display
                          const getAutomationInfo = (conn: any) => {
                            if (conn.automationLevel === 'full') {
                              return { 
                                label: 'Automazione Completa', 
                                color: 'bg-success/10 text-success',
                                icon: <Bot className="h-3 w-3" />,
                                description: 'Connessione automatica via sistema'
                              };
                            } else if (conn.automationLevel === 'cli') {
                              return { 
                                label: 'Automazione CLI', 
                                color: 'bg-primary/10 text-primary',
                                icon: <Zap className="h-3 w-3" />,
                                description: 'Connessione via comando CLI'
                              };
                            } else if (conn.automationLevel === 'limited') {
                              return { 
                                label: 'Automazione Limitata', 
                                color: 'bg-warning/10 text-warning',
                                icon: <AlertTriangle className="h-3 w-3" />,
                                description: 'Apre app, potrebbe servire selezione manuale'
                              };
                            } else if (conn.automationLevel === 'manual') {
                              return { 
                                label: 'Manuale', 
                                color: 'bg-warning/10 text-warning',
                                icon: <User className="h-3 w-3" />,
                                description: 'Apre app, connessione manuale richiesta'
                              };
                            }
                            return { 
                              label: 'Standard', 
                              color: 'bg-muted text-foreground',
                              icon: <Smartphone className="h-3 w-3" />,
                              description: 'Automazione standard'
                            };
                          };

                          const automationInfo = getAutomationInfo(connection);

                          return (
                            <Label
                              key={connection.id}
                              className="flex items-center space-x-3 p-4 border rounded-lg cursor-pointer hover:bg-accent"
                              data-testid={`connection-${connection.id}`}
                            >
                              <input
                                type="radio"
                                value={connection.id}
                                checked={field.value === connection.id}
                                onChange={() => field.onChange(connection.id)}
                                className="text-primary"
                              />
                              <div className="flex-1">
                                <div className="flex items-center gap-2 mb-1">
                                  <Wifi className="h-4 w-4 text-primary" />
                                  <span className="font-medium">{connection.name}</span>
                                  {connection.configured && (
                                    <Badge variant="outline" className="text-success">
                                      <CheckCircle className="h-3 w-3 mr-1" />
                                      Configurata
                                    </Badge>
                                  )}
                                </div>
                                
                                {/* Automation level indicator */}
                                <div className="flex items-center gap-2 mb-2">
                                  <span className={`px-2 py-1 rounded-full text-xs flex items-center gap-1 w-fit ${automationInfo.color}`}>
                                    {automationInfo.icon} {automationInfo.label}
                                  </span>
                                </div>
                                
                                <p className="text-sm text-muted-foreground">
                                  {connection.details}
                                </p>
                                
                                {/* Automation description */}
                                <p className="text-xs text-muted-foreground mt-1 italic">
                                  {automationInfo.description}
                                </p>
                              </div>
                            </Label>
                          );
                        })}
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
            </CardContent>
          </Card>
        )}

        {/* Actions */}
        <div className="flex justify-end space-x-2">
          <Button 
            type="button" 
            variant="outline" 
            onClick={onCancel} 
            data-testid="button-cancel"
          >
            Annulla
          </Button>
          <Button 
            type="submit" 
            disabled={createMutation.isPending || !discoveryComplete || !form.getValues('existingConnectionId')} 
            data-testid="button-save"
          >
            {createMutation.isPending ? "Salvando..." : "Configura VPN"}
          </Button>
        </div>
      </form>
    </Form>
  );
}