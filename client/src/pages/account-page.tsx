import { useState } from "react";
import { useLocation } from "wouter";
import Sidebar from "@/components/layout/sidebar";
import Header from "@/components/layout/header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import EmailConfig from "@/components/email-config";
import { EmailSendDialog } from "@/components/email-send-dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Send } from "lucide-react";

export default function AccountPage() {
  const [location] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showSendDialog, setShowSendDialog] = useState(false);
  
  const [formData, setFormData] = useState({
    firstName: user?.firstName || "",
    lastName: user?.lastName || "",
    email: user?.email || "",
  });

  const updateUserMutation = useMutation({
    mutationFn: async (data: any) => {
      return await apiRequest("PUT", `/api/users/${user?.id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/user"] });
      toast({
        title: "Successo",
        description: "Impostazioni account aggiornate",
      });
    },
    onError: () => {
      toast({
        title: "Errore",
        description: "Impossibile aggiornare le impostazioni",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateUserMutation.mutate(formData);
  };

  const handleChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };
  
  // Route detection for full-page mode
  const isFullPageMode = location.startsWith("/account");
  
  // Handle full-page mode: when user navigates directly to /account or /account/settings
  if (isFullPageMode) {
    return (
      <>
        <div className="min-h-screen bg-background flex">
          <Sidebar />
          <div className="flex-1 flex flex-col">
            <Header />
            <main className="flex-1 p-6 overflow-auto">
              <div className="max-w-4xl mx-auto space-y-6">
                <div>
                  <h1 className="text-2xl font-bold text-foreground">Impostazioni Account</h1>
                  <p className="text-muted-foreground mt-1">
                    Gestisci le informazioni del tuo account, configurazioni email e preferenze.
                  </p>
                </div>

                <Tabs defaultValue="account" className="w-full">
                  <TabsList>
                    <TabsTrigger value="account">Account</TabsTrigger>
                    <TabsTrigger value="email">Email</TabsTrigger>
                    <TabsTrigger value="preferences">Preferenze</TabsTrigger>
                  </TabsList>
                  
                  <TabsContent value="account" className="space-y-4">
                    <form onSubmit={handleSubmit} className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="firstName">Nome</Label>
                        <Input
                          id="firstName"
                          value={formData.firstName}
                          onChange={(e) => handleChange("firstName", e.target.value)}
                          data-testid="input-first-name"
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="lastName">Cognome</Label>
                        <Input
                          id="lastName"
                          value={formData.lastName}
                          onChange={(e) => handleChange("lastName", e.target.value)}
                          data-testid="input-last-name"
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="email">Email</Label>
                        <Input
                          id="email"
                          type="email"
                          value={formData.email}
                          onChange={(e) => handleChange("email", e.target.value)}
                          data-testid="input-email"
                        />
                      </div>

                      <div className="flex justify-end space-x-2 pt-4">
                        <Button
                          type="submit"
                          data-testid="button-save"
                          disabled={updateUserMutation.isPending}
                        >
                          {updateUserMutation.isPending ? "Salvataggio..." : "Salva"}
                        </Button>
                      </div>
                    </form>
                  </TabsContent>
                  
                  <TabsContent value="email" className="space-y-4">
                    <div className="space-y-6">
                      {/* Test Invio Email */}
                      <Card>
                        <CardHeader>
                          <CardTitle className="flex items-center gap-2">
                            <Send className="h-5 w-5" />
                            Test Invio Email
                          </CardTitle>
                          <p className="text-sm text-muted-foreground">
                            Testa l'invio email con i tuoi account configurati.
                          </p>
                        </CardHeader>
                        <CardContent>
                          <Button 
                            onClick={() => setShowSendDialog(true)}
                            className="w-full sm:w-auto"
                            data-testid="button-test-send-email"
                          >
                            <Send className="mr-2 h-4 w-4" />
                            Invia Email
                          </Button>
                        </CardContent>
                      </Card>

                      {/* Configurazioni Email */}
                      <EmailConfig />
                    </div>
                  </TabsContent>
                  
                  <TabsContent value="preferences" className="space-y-4">
                    <p className="text-muted-foreground">
                      Le preferenze saranno disponibili in una versione futura.
                    </p>
                  </TabsContent>
                </Tabs>
              </div>
            </main>
          </div>
        </div>
        
        {/* Dialog di invio email */}
        <EmailSendDialog 
          open={showSendDialog} 
          onOpenChange={setShowSendDialog} 
        />
      </>
    );
  }
  
  // This should not happen since all /account routes should be full-page
  return <div>Caricamento...</div>;
}