import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Sidebar from "@/components/layout/sidebar";
import Header from "@/components/layout/header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { 
  Shield, 
  Network, 
  Terminal, 
  ExternalLink, 
  RefreshCw,
  CheckCircle,
  AlertCircle,
  Info
} from "lucide-react";

interface VPNConnection {
  id: string;
  name: string;
  type: 'forticlient' | 'native' | 'openfortivpn';
  server?: string;
  port?: number;
  status: 'available' | 'configured' | 'error';
  automationScript?: string;
  description?: string;
}

export default function VPNDiscoveryPage() {
  const { toast } = useToast();

  const { data: vpnConnections, isLoading, refetch } = useQuery<VPNConnection[]>({
    queryKey: ["/api/vpn/discover"],
    queryFn: async () => {
      try {
        const res = await fetch("/api/vpn/discover", { credentials: "include" });
        if (!res.ok) {
          console.log('API non disponibile - nessuna connessione disponibile');
          return [];
        }
        const data = await res.json();
        console.log('✅ Connessioni VPN reali caricate:', data.length);
        return data || [];
      } catch (error) {
        console.log('Errore API - nessuna connessione disponibile:', error);
        return [];
      }
    },
  });

  // No more demo/fake data - only real configurations

  const handleRefresh = () => {
    refetch();
    toast({
      title: "Aggiornamento",
      description: "Ricerca connessioni VPN aggiornata"
    });
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

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'forticlient':
        return <Shield className="h-5 w-5 text-orange-600" />;
      case 'native':
        return <Network className="h-5 w-5 text-blue-600" />;
      case 'openfortivpn':
        return <Terminal className="h-5 w-5 text-green-600" />;
      default:
        return <Network className="h-5 w-5 text-gray-600" />;
    }
  };

  const getTypeBadgeColor = (type: string) => {
    switch (type) {
      case 'forticlient':
        return 'bg-orange-100 text-orange-800 hover:bg-orange-200';
      case 'native':
        return 'bg-blue-100 text-blue-800 hover:bg-blue-200';
      case 'openfortivpn':
        return 'bg-green-100 text-green-800 hover:bg-green-200';
      default:
        return 'bg-gray-100 text-gray-800 hover:bg-gray-200';
    }
  };

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-auto">
        <Header 
          title="Scoperta Connessioni VPN" 
          subtitle="Identifica e configura le connessioni VPN disponibili sul sistema"
          onNewClick={handleRefresh}
        />
        
        <div className="p-6 space-y-6">
          {/* Introduction Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5" />
                Automazione VPN per macOS
              </CardTitle>
              <CardDescription>
                Il sistema identifica automaticamente le connessioni VPN disponibili sul tuo MacBook 
                e genera script di automazione per ciascuna di esse.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="flex items-center gap-3">
                  <Shield className="h-8 w-8 text-orange-600 bg-orange-100 p-2 rounded" />
                  <div>
                    <div className="font-medium">FortiClient</div>
                    <div className="text-sm text-muted-foreground">GUI Automation via AppleScript</div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Network className="h-8 w-8 text-blue-600 bg-blue-100 p-2 rounded" />
                  <div>
                    <div className="font-medium">Native macOS</div>
                    <div className="text-sm text-muted-foreground">Controllo CLI con scutil</div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Terminal className="h-8 w-8 text-green-600 bg-green-100 p-2 rounded" />
                  <div>
                    <div className="font-medium">OpenFortiVPN</div>
                    <div className="text-sm text-muted-foreground">Alternativa Open Source</div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* VPN Connections List */}
          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {[...Array(6)].map((_, i) => (
                <Card key={i} className="animate-pulse">
                  <CardHeader>
                    <div className="h-4 bg-gray-200 rounded w-3/4"></div>
                    <div className="h-3 bg-gray-200 rounded w-1/2"></div>
                  </CardHeader>
                  <CardContent>
                    <div className="h-16 bg-gray-200 rounded"></div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : vpnConnections?.length === 0 ? (
            <Card>
              <CardContent className="text-center py-12">
                <Network className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium text-foreground mb-2">Nessuna connessione VPN trovata</h3>
                <p className="text-muted-foreground mb-4">
                  Non sono state trovate connessioni VPN configurate sul sistema
                </p>
                <Button onClick={handleRefresh} data-testid="button-refresh-vpn">
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Riprova
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {vpnConnections?.map((connection) => (
                <Card 
                  key={connection.id} 
                  className="transition-all hover:shadow-md"
                  data-testid={`card-vpn-${connection.id}`}
                >
                  <CardHeader>
                    <CardTitle className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {getTypeIcon(connection.type)}
                        <span className="truncate">{connection.name}</span>
                      </div>
                      {getStatusIcon(connection.status)}
                    </CardTitle>
                    <CardDescription className="flex items-center gap-2">
                      <Badge className={getTypeBadgeColor(connection.type)}>
                        {connection.type}
                      </Badge>
                      <Badge variant="outline" className="capitalize">
                        {connection.status}
                      </Badge>
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      <p className="text-sm text-muted-foreground">
                        {connection.description}
                      </p>
                      
                      {connection.server && (
                        <div className="flex items-center gap-2 text-sm">
                          <ExternalLink className="h-3 w-3" />
                          <span>{connection.server}{connection.port ? `:${connection.port}` : ''}</span>
                        </div>
                      )}
                      
                      {connection.automationScript && (
                        <div className="bg-muted p-2 rounded text-xs font-mono">
                          Automation: {connection.automationScript}
                        </div>
                      )}
                      
                      <div className="flex gap-2 pt-2">
                        <Button 
                          size="sm" 
                          variant="outline" 
                          className="flex-1"
                          data-testid={`button-test-vpn-${connection.id}`}
                        >
                          <Terminal className="h-3 w-3 mr-1" />
                          Test
                        </Button>
                        <Button 
                          size="sm" 
                          className="flex-1"
                          data-testid={`button-configure-vpn-${connection.id}`}
                        >
                          <Shield className="h-3 w-3 mr-1" />
                          Configura
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}