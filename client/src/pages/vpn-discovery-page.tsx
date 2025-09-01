import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import Sidebar from "@/components/layout/sidebar";
import Header from "@/components/layout/header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { 
  Shield, 
  Network, 
  Terminal, 
  ExternalLink, 
  RefreshCw,
  CheckCircle,
  AlertCircle,
  Info,
  Settings,
  Key,
  Copy,
  Eye
} from "lucide-react";

interface VPNSoftware {
  software: string;
  name: string;
  installed: boolean;
  canReadConfigs: boolean;
  configCount: number;
  description: string;
  automationType: 'full' | 'credentials' | 'manual';
}

interface VPNConnection {
  id: string;
  name: string;
  type: string;
  server?: string;
  port?: number;
  details: string;
  configured: boolean;
}

interface CredentialsForm {
  server: string;
  port: string;
  username: string;
  password: string;
}

export default function VPNDiscoveryPage() {
  const { toast } = useToast();
  const [selectedSoftware, setSelectedSoftware] = useState<string>("");
  const [credentials, setCredentials] = useState<CredentialsForm>({
    server: "",
    port: "",
    username: "",
    password: ""
  });

  // Discover available VPN software installed on the system
  const { data: availableSoftware, isLoading: isLoadingSoftware, refetch: refetchSoftware } = useQuery<VPNSoftware[]>({
    queryKey: ["/api/vpn/software"],
    queryFn: async () => {
      try {
        const res = await fetch("/api/vpn/software", { credentials: "include" });
        if (!res.ok) {
          console.log('API non disponibile - nessun software VPN disponibile');
          return [];
        }
        const data = await res.json();
        console.log('✅ Software VPN disponibile:', data.software);
        return data.software || [];
      } catch (error) {
        console.log('Errore API - nessun software VPN disponibile:', error);
        return [];
      }
    },
  });

  // Discover VPN connections for selected software
  const { data: vpnConnections, isLoading: isLoadingConnections, refetch: refetchConnections } = useQuery<VPNConnection[]>({
    queryKey: ["/api/vpn/discover", selectedSoftware],
    queryFn: async () => {
      if (!selectedSoftware) return [];
      
      try {
        const res = await fetch("/api/vpn/discover", { 
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: "include",
          body: JSON.stringify({ software: selectedSoftware })
        });
        if (!res.ok) {
          console.log('Discovery API non disponibile');
          return [];
        }
        const data = await res.json();
        console.log('✅ Connessioni trovate per', selectedSoftware, ':', data.connections);
        return data.connections || [];
      } catch (error) {
        console.log('Errore discovery:', error);
        return [];
      }
    },
    enabled: !!selectedSoftware
  });

  const handleRefresh = () => {
    refetchSoftware();
    if (selectedSoftware) {
      refetchConnections();
    }
    toast({
      title: "Aggiornamento",
      description: "Ricerca software e connessioni VPN aggiornata"
    });
  };

  const handleSoftwareChange = (software: string) => {
    setSelectedSoftware(software);
    setCredentials({ server: "", port: "", username: "", password: "" });
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: "Copiato",
      description: `${label} copiato negli appunti`
    });
  };

  const getCurrentSoftware = (): VPNSoftware | undefined => {
    return availableSoftware?.find(sw => sw.software === selectedSoftware);
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'configured':
        return <CheckCircle className="h-4 w-4 text-green-600" />;
      case 'available':
        return <Info className="h-4 w-4 text-blue-600" />;
      case 'error':
        return <AlertCircle className="h-4 w-4 text-red-600" />;
      default:
        return <Info className="h-4 w-4 text-gray-600" />;
    }
  };

  const getSoftwareIcon = (software: string) => {
    switch (software) {
      case 'forticlient':
        return <Shield className="h-5 w-5 text-orange-600" />;
      case 'cisco_anyconnect':
        return <Network className="h-5 w-5 text-blue-600" />;
      case 'azure_vpn':
        return <Network className="h-5 w-5 text-blue-600" />;
      case 'native':
        return <Settings className="h-5 w-5 text-gray-600" />;
      case 'openvpn':
        return <Terminal className="h-5 w-5 text-green-600" />;
      default:
        return <Network className="h-5 w-5 text-gray-600" />;
    }
  };

  const getAutomationTypeIcon = (automationType: string) => {
    switch (automationType) {
      case 'full':
        return <CheckCircle className="h-4 w-4 text-green-600" />;
      case 'credentials':
        return <Key className="h-4 w-4 text-blue-600" />;
      case 'manual':
        return <Settings className="h-4 w-4 text-gray-600" />;
      default:
        return <Info className="h-4 w-4 text-gray-600" />;
    }
  };

  const getAutomationTypeLabel = (automationType: string) => {
    switch (automationType) {
      case 'full':
        return 'Automazione Completa';
      case 'credentials':
        return 'Automazione Credenziali';
      case 'manual':
        return 'Configurazione Manuale';
      default:
        return 'Non disponibile';
    }
  };

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-auto">
        <Header 
          title="Sistema VPN Ibrido Intelligente" 
          subtitle="Automazione VPN adattiva basata sui software installati e le loro capacità"
          onNewClick={handleRefresh}
        />
        
        <div className="p-6 space-y-6">
          {/* Introduction Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5" />
                Sistema VPN Ibrido e Onesto
              </CardTitle>
              <CardDescription>
                Il sistema scopre automaticamente i software VPN installati e offre diversi livelli di automazione 
                basati sulle capacità di ciascun software. Solo software realmente installato viene mostrato.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="flex items-center gap-3">
                  <CheckCircle className="h-8 w-8 text-green-600 bg-green-100 p-2 rounded" />
                  <div>
                    <div className="font-medium">Automazione Completa</div>
                    <div className="text-sm text-muted-foreground">Profili leggibili + script automatici</div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Key className="h-8 w-8 text-blue-600 bg-blue-100 p-2 rounded" />
                  <div>
                    <div className="font-medium">Automazione Credenziali</div>
                    <div className="text-sm text-muted-foreground">Form + clipboard automatico</div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Settings className="h-8 w-8 text-gray-600 bg-gray-100 p-2 rounded" />
                  <div>
                    <div className="font-medium">Configurazione Manuale</div>
                    <div className="text-sm text-muted-foreground">Istruzioni step-by-step</div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Software Selection */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Network className="h-5 w-5" />
                Software VPN Disponibili
              </CardTitle>
              <CardDescription>
                Seleziona un software VPN installato per vedere le opzioni di automazione disponibili
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoadingSoftware ? (
                <div className="animate-pulse">
                  <div className="h-10 bg-gray-200 rounded w-full"></div>
                </div>
              ) : availableSoftware?.length === 0 ? (
                <div className="text-center py-8">
                  <Network className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
                  <h3 className="text-lg font-medium text-foreground mb-2">Nessun software VPN trovato</h3>
                  <p className="text-muted-foreground mb-4">
                    Non sono stati trovati software VPN installati sul sistema
                  </p>
                  <Button onClick={handleRefresh} data-testid="button-refresh-vpn">
                    <RefreshCw className="mr-2 h-4 w-4" />
                    Ricontrolla
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  <Select onValueChange={handleSoftwareChange} value={selectedSoftware}>
                    <SelectTrigger data-testid="select-vpn-software">
                      <SelectValue placeholder="Scegli software VPN..." />
                    </SelectTrigger>
                    <SelectContent>
                      {availableSoftware?.map((sw) => (
                        <SelectItem key={sw.software} value={sw.software}>
                          <div className="flex items-center gap-2">
                            {getSoftwareIcon(sw.software)}
                            <span>{sw.name}</span>
                            <Badge variant="secondary" className="ml-2">
                              {getAutomationTypeLabel(sw.automationType)}
                            </Badge>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  
                  {selectedSoftware && (
                    <div className="mt-4 p-4 bg-muted rounded-lg">
                      <div className="flex items-center gap-2 mb-2">
                        {getSoftwareIcon(selectedSoftware)}
                        <span className="font-medium">{getCurrentSoftware()?.name}</span>
                        {getAutomationTypeIcon(getCurrentSoftware()?.automationType || '')}
                        <Badge variant="outline">
                          {getAutomationTypeLabel(getCurrentSoftware()?.automationType || '')}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {getCurrentSoftware()?.description}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Dynamic Content Based on Software Selection */}
          {selectedSoftware && (
            <>
              {getCurrentSoftware()?.automationType === 'full' && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <CheckCircle className="h-5 w-5 text-green-600" />
                      Profili VPN Configurati
                    </CardTitle>
                    <CardDescription>
                      Profili VPN trovati e leggibili per {getCurrentSoftware()?.name}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {isLoadingConnections ? (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {[...Array(2)].map((_, i) => (
                          <div key={i} className="animate-pulse">
                            <div className="h-20 bg-gray-200 rounded"></div>
                          </div>
                        ))}
                      </div>
                    ) : vpnConnections?.length === 0 ? (
                      <div className="text-center py-8">
                        <Info className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
                        <h3 className="text-lg font-medium text-foreground mb-2">Nessun profilo configurato</h3>
                        <p className="text-muted-foreground">
                          {getCurrentSoftware()?.name} è installato ma non ha profili configurati
                        </p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {vpnConnections?.map((connection) => (
                          <Card key={connection.id} className="border border-green-200">
                            <CardHeader className="pb-3">
                              <CardTitle className="flex items-center justify-between text-sm">
                                <div className="flex items-center gap-2">
                                  {getSoftwareIcon(selectedSoftware)}
                                  <span className="truncate">{connection.name}</span>
                                </div>
                                {connection.configured ? (
                                  <CheckCircle className="h-4 w-4 text-green-600" />
                                ) : (
                                  <Info className="h-4 w-4 text-blue-600" />
                                )}
                              </CardTitle>
                            </CardHeader>
                            <CardContent className="pt-0">
                              <div className="space-y-2">
                                <div className="text-sm text-muted-foreground">
                                  {connection.details}
                                </div>
                                {connection.server && (
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs font-mono bg-muted px-2 py-1 rounded">
                                      {connection.server}
                                      {connection.port && `:${connection.port}`}
                                    </span>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      onClick={() => copyToClipboard(
                                        `${connection.server}${connection.port ? `:${connection.port}` : ''}`, 
                                        'Server'
                                      )}
                                      data-testid={`button-copy-server-${connection.id}`}
                                    >
                                      <Copy className="h-3 w-3" />
                                    </Button>
                                  </div>
                                )}
                                <Badge 
                                  variant={connection.configured ? "default" : "secondary"}
                                  className="w-fit"
                                >
                                  {connection.configured ? "Configurato" : "Disponibile"}
                                </Badge>
                              </div>
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              {getCurrentSoftware()?.automationType === 'credentials' && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Key className="h-5 w-5 text-blue-600" />
                      Automazione Credenziali
                    </CardTitle>
                    <CardDescription>
                      Inserisci le credenziali VPN per {getCurrentSoftware()?.name}. Il sistema copierà automaticamente 
                      i dati negli appunti per facilitare l'inserimento.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-4">
                        <div className="space-y-2">
                          <Label htmlFor="server">Server VPN</Label>
                          <div className="flex gap-2">
                            <Input
                              id="server"
                              placeholder="es. vpn.company.com"
                              value={credentials.server}
                              onChange={(e) => setCredentials(prev => ({ ...prev, server: e.target.value }))}
                              data-testid="input-vpn-server"
                            />
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => copyToClipboard(credentials.server, 'Server')}
                              disabled={!credentials.server}
                              data-testid="button-copy-server"
                            >
                              <Copy className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                        
                        <div className="space-y-2">
                          <Label htmlFor="port">Porta (opzionale)</Label>
                          <div className="flex gap-2">
                            <Input
                              id="port"
                              placeholder="es. 443"
                              value={credentials.port}
                              onChange={(e) => setCredentials(prev => ({ ...prev, port: e.target.value }))}
                              data-testid="input-vpn-port"
                            />
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => copyToClipboard(credentials.port, 'Porta')}
                              disabled={!credentials.port}
                              data-testid="button-copy-port"
                            >
                              <Copy className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      </div>
                      
                      <div className="space-y-4">
                        <div className="space-y-2">
                          <Label htmlFor="username">Username</Label>
                          <div className="flex gap-2">
                            <Input
                              id="username"
                              placeholder="Il tuo username"
                              value={credentials.username}
                              onChange={(e) => setCredentials(prev => ({ ...prev, username: e.target.value }))}
                              data-testid="input-vpn-username"
                            />
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => copyToClipboard(credentials.username, 'Username')}
                              disabled={!credentials.username}
                              data-testid="button-copy-username"
                            >
                              <Copy className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                        
                        <div className="space-y-2">
                          <Label htmlFor="password">Password</Label>
                          <div className="flex gap-2">
                            <Input
                              id="password"
                              type="password"
                              placeholder="La tua password"
                              value={credentials.password}
                              onChange={(e) => setCredentials(prev => ({ ...prev, password: e.target.value }))}
                              data-testid="input-vpn-password"
                            />
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => copyToClipboard(credentials.password, 'Password')}
                              disabled={!credentials.password}
                              data-testid="button-copy-password"
                            >
                              <Copy className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    </div>
                    
                    <div className="mt-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
                      <div className="flex items-start gap-3">
                        <Info className="h-5 w-5 text-blue-600 mt-0.5" />
                        <div>
                          <h4 className="font-medium text-blue-900 mb-1">Come funziona l'automazione credenziali</h4>
                          <ol className="text-sm text-blue-800 space-y-1 list-decimal list-inside">
                            <li>Compila i campi sopra con le tue credenziali VPN</li>
                            <li>Usa i pulsanti "Copia" per copiare ogni campo negli appunti</li>
                            <li>Apri {getCurrentSoftware()?.name} e incolla le credenziali nei campi appropriati</li>
                            <li>Il sistema automatizza l'inserimento tramite clipboard</li>
                          </ol>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {getCurrentSoftware()?.automationType === 'manual' && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Settings className="h-5 w-5 text-gray-600" />
                      Configurazione Manuale
                    </CardTitle>
                    <CardDescription>
                      {getCurrentSoftware()?.name} richiede configurazione manuale. Segui le istruzioni passo-passo.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-6">
                      <div className="p-4 bg-gray-50 rounded-lg border">
                        <div className="flex items-start gap-3">
                          <Settings className="h-5 w-5 text-gray-600 mt-1" />
                          <div>
                            <h4 className="font-medium text-gray-900 mb-2">Istruzioni per {getCurrentSoftware()?.name}</h4>
                            
                            {selectedSoftware === 'native' && (
                              <ol className="text-sm text-gray-700 space-y-2 list-decimal list-inside">
                                <li>Apri Preferenze di Sistema → Rete</li>
                                <li>Clicca il pulsante "+" per aggiungere una nuova interfaccia</li>
                                <li>Seleziona "VPN" come interfaccia</li>
                                <li>Scegli il tipo di VPN (L2TP, IKEv2, etc.)</li>
                                <li>Inserisci indirizzo server e credenziali</li>
                                <li>Clicca "Applica" per salvare la configurazione</li>
                              </ol>
                            )}
                            
                            {selectedSoftware === 'openvpn' && (
                              <ol className="text-sm text-gray-700 space-y-2 list-decimal list-inside">
                                <li>Assicurati di avere il file di configurazione .ovpn</li>
                                <li>Apri il Terminale</li>
                                <li>Esegui: <code className="bg-gray-200 px-1 rounded">sudo openvpn /path/to/config.ovpn</code></li>
                                <li>Inserisci le credenziali quando richiesto</li>
                                <li>Premi Ctrl+C per disconnettere</li>
                              </ol>
                            )}
                          </div>
                        </div>
                      </div>
                      
                      <div className="p-4 bg-yellow-50 rounded-lg border border-yellow-200">
                        <div className="flex items-start gap-3">
                          <AlertCircle className="h-5 w-5 text-yellow-600 mt-0.5" />
                          <div>
                            <h4 className="font-medium text-yellow-900 mb-1">Importante</h4>
                            <p className="text-sm text-yellow-800">
                              La configurazione manuale richiede l'intervento dell'utente per ogni connessione. 
                              Considera l'installazione di software VPN con supporto per automazione per un'esperienza migliore.
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  );
}