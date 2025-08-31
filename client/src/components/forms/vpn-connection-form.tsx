import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { insertVpnConnectionSchema } from "@shared/schema";
import { VpnConnection } from "@shared/schema";
import { Zap, Settings, CheckCircle, AlertCircle, Copy } from "lucide-react";
import { z } from "zod";

interface VPNConnectionFormProps {
  vpnConnection?: VpnConnection | null;
  onSuccess: () => void;
  onCancel: () => void;
  partners: Array<{ id: string; name: string; company: string }>;
}

const formSchema = insertVpnConnectionSchema.extend({
  connectionType: z.enum(['openvpn', 'ipsec', 'wireguard', 'cisco_anyconnect', 'fortigate', 'other']),
  vpnSoftwareType: z.enum(['forticlient', 'native', 'openfortivpn']).optional(),
});

export default function VPNConnectionForm({ vpnConnection, onSuccess, onCancel, partners }: VPNConnectionFormProps) {
  const { toast } = useToast();
  const [generatedScript, setGeneratedScript] = useState<any>(null);
  const [isGeneratingScript, setIsGeneratingScript] = useState(false);

  const form = useForm({
    resolver: zodResolver(formSchema),
    mode: "onChange",
    defaultValues: {
      name: vpnConnection?.name || "",
      description: vpnConnection?.description || "",
      partnerId: vpnConnection?.partnerId || "",
      connectionType: vpnConnection?.connectionType || "openvpn",
      serverHost: vpnConnection?.serverHost || "",
      serverPort: vpnConnection?.serverPort || 1194,
      protocol: vpnConnection?.protocol || "udp",
      configFileContent: vpnConnection?.configFileContent || "",
      allowedIpRanges: vpnConnection?.allowedIpRanges || [],
      dnsServers: vpnConnection?.dnsServers || [],
      autoConnect: vpnConnection?.autoConnect || false,
      isActive: vpnConnection?.isActive !== false,
      notes: vpnConnection?.notes || "",
      vpnSoftwareType: 'forticlient'
    },
  });

  console.log("🔍 VPN Form rendered, partners count:", partners.length);

  const createMutation = useMutation({
    mutationFn: (data: z.infer<typeof formSchema>) => 
      apiRequest("POST", "/api/vpn-connections", data),
    onSuccess: (newConnection: any) => {
      toast({ title: "Connessione VPN creata", description: "La connessione VPN è stata configurata con successo" });
      
      // If we have a VPN software type selected, automatically generate the script
      if (form.getValues('vpnSoftwareType') && newConnection?.id) {
        handleGenerateScript(newConnection.id, form.getValues('vpnSoftwareType')!);
      } else {
        onSuccess();
      }
    },
    onError: (error: any) => {
      toast({ variant: "destructive", title: "Errore", description: error.message });
    }
  });

  const updateMutation = useMutation({
    mutationFn: (data: z.infer<typeof formSchema>) => 
      apiRequest("PUT", `/api/vpn-connections/${vpnConnection!.id}`, data),
    onSuccess: () => {
      toast({ title: "Connessione VPN aggiornata", description: "Le modifiche sono state salvate" });
      onSuccess();
    },
    onError: (error: any) => {
      toast({ variant: "destructive", title: "Errore", description: error.message });
    }
  });

  const generateScriptMutation = useMutation({
    mutationFn: ({ connectionId, connectionType }: { connectionId: string, connectionType: string }) =>
      apiRequest("POST", `/api/vpn-connections/${connectionId}/generate-script`, { connectionType }),
    onSuccess: (result) => {
      setGeneratedScript(result);
      setIsGeneratingScript(false);
      toast({ 
        title: "🚀 Script Generato!", 
        description: "Script di automazione VPN creato e salvato nel database" 
      });
    },
    onError: (error: any) => {
      setIsGeneratingScript(false);
      toast({ 
        variant: "destructive", 
        title: "Errore Generazione Script", 
        description: error.message 
      });
    }
  });

  const handleGenerateScript = (connectionId: string, connectionType: string) => {
    setIsGeneratingScript(true);
    generateScriptMutation.mutate({ connectionId, connectionType });
  };

  const onSubmit = (data: any) => {
    console.log("🔍 Form submit called with data:", data);
    // Remove vpnSoftwareType from the data sent to the server
    const { vpnSoftwareType, ...vpnData } = data;
    
    if (vpnConnection) {
      console.log("🔍 Updating existing VPN connection");
      updateMutation.mutate(vpnData);
    } else {
      console.log("🔍 Creating new VPN connection");
      createMutation.mutate(vpnData);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: "Copiato!", description: "Script copiato negli appunti" });
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6" data-testid="vpn-connection-form">
        {/* Basic Information */}
        <Card>
          <CardHeader>
            <CardTitle>Informazioni Base</CardTitle>
            <CardDescription>Configura i dettagli della connessione VPN</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nome Connessione *</FormLabel>
                    <FormControl>
                      <Input placeholder="Cliente ABC VPN" {...field} data-testid="input-name" />
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
            </div>

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Descrizione</FormLabel>
                  <FormControl>
                    <Textarea placeholder="Connessione VPN per accesso ai sistemi..." {...field} data-testid="textarea-description" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        {/* Connection Details */}
        <Card>
          <CardHeader>
            <CardTitle>Dettagli Connessione</CardTitle>
            <CardDescription>Parametri tecnici per la connessione VPN</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <FormField
                control={form.control}
                name="serverHost"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Server VPN *</FormLabel>
                    <FormControl>
                      <Input placeholder="vpn.cliente.com" {...field} data-testid="input-server" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="serverPort"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Porta</FormLabel>
                    <FormControl>
                      <Input type="number" placeholder="1194" {...field} 
                        onChange={e => field.onChange(parseInt(e.target.value))}
                        data-testid="input-port" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="protocol"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Protocollo</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value} data-testid="select-protocol">
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="udp">UDP</SelectItem>
                        <SelectItem value="tcp">TCP</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="connectionType"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tipo Connessione</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value} data-testid="select-connection-type">
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="openvpn">OpenVPN</SelectItem>
                      <SelectItem value="ipsec">IPSec</SelectItem>
                      <SelectItem value="pptp">PPTP</SelectItem>
                      <SelectItem value="l2tp">L2TP</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        {/* VPN Automation */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Zap className="h-5 w-5 text-blue-500" />
              Automazione VPN
            </CardTitle>
            <CardDescription>
              Genera script personalizzato per connessione automatica. 
              <strong> Ideale quando la VPN è attiva</strong> per validazione immediata.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <FormField
              control={form.control}
              name="vpnSoftwareType"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Software VPN</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value} data-testid="select-vpn-software">
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Seleziona software VPN" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="forticlient">FortiClient (AppleScript)</SelectItem>
                      <SelectItem value="native">VPN nativa macOS (scutil)</SelectItem>
                      <SelectItem value="openfortivpn">OpenFortiVPN (CLI)</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {vpnConnection && (
              <div className="space-y-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => handleGenerateScript(vpnConnection.id, form.getValues('vpnSoftwareType') || 'forticlient')}
                  disabled={isGeneratingScript}
                  className="w-full"
                  data-testid="button-generate-script"
                >
                  <Zap className="mr-2 h-4 w-4" />
                  {isGeneratingScript ? "Generando Script..." : "🚀 Genera Script Automazione"}
                </Button>

                {vpnConnection.automationScript && !generatedScript && (
                  <Alert>
                    <CheckCircle className="h-4 w-4" />
                    <AlertDescription>
                      <div className="flex items-center justify-between">
                        <span>Script già configurato ({vpnConnection.scriptType})</span>
                        <Badge variant="outline">
                          {new Date(vpnConnection.scriptGeneratedAt!).toLocaleDateString()}
                        </Badge>
                      </div>
                    </AlertDescription>
                  </Alert>
                )}

                {generatedScript && (
                  <Card className="border-green-200">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <CheckCircle className="h-4 w-4 text-green-500" />
                        Script Generato con Successo!
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="bg-gray-50 p-3 rounded-md">
                        <div className="text-xs text-gray-600 mb-1">Comando di Esecuzione:</div>
                        <div className="font-mono text-sm bg-black text-green-400 p-2 rounded flex items-center justify-between">
                          <span className="truncate">{generatedScript.automationResult.executionCommand}</span>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => copyToClipboard(generatedScript.automationResult.executionCommand)}
                            data-testid="button-copy-script"
                          >
                            <Copy className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                      
                      <div className="text-sm text-gray-600">
                        <strong>Istruzioni:</strong>
                        <pre className="whitespace-pre-wrap mt-1 text-xs">
                          {generatedScript.automationResult.instructions}
                        </pre>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Options */}
        <Card>
          <CardHeader>
            <CardTitle>Opzioni</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center space-x-2">
              <FormField
                control={form.control}
                name="autoConnect"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm">
                    <div className="space-y-0.5">
                      <FormLabel>Connessione Automatica</FormLabel>
                      <div className="text-sm text-muted-foreground">
                        Avvia automaticamente questa VPN quando necessario
                      </div>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        data-testid="switch-auto-connect"
                      />
                    </FormControl>
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
                    <Textarea placeholder="Note aggiuntive sulla configurazione..." {...field} data-testid="textarea-notes" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        {/* Actions */}
        <div className="flex justify-end space-x-2">
          <Button type="button" variant="outline" onClick={() => {
            console.log("🔍 Cancel button clicked");
            onCancel();
          }} data-testid="button-cancel">
            Annulla
          </Button>
          <Button 
            type="submit" 
            disabled={createMutation.isPending || updateMutation.isPending} 
            data-testid="button-save"
            onClick={() => {
              console.log("🔍 Submit button clicked");
              console.log("🔍 Form errors:", form.formState.errors);
              console.log("🔍 Form is valid:", form.formState.isValid);
              console.log("🔍 Form values:", form.getValues());
            }}
          >
            {createMutation.isPending || updateMutation.isPending ? "Salvando..." : 
             vpnConnection ? "Aggiorna" : "Crea"}
          </Button>
        </div>
      </form>
    </Form>
  );
}