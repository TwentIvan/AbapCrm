import { useState, useRef } from "react";
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
import { Send, Upload, Trash2 } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

export default function AccountPage() {
  const [location] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showSendDialog, setShowSendDialog] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [formData, setFormData] = useState({
    firstName: user?.firstName || "",
    lastName: user?.lastName || "",
    email: user?.email || "",
  });

  const userInitials = user?.firstName && user?.lastName 
    ? `${user.firstName[0]}${user.lastName[0]}` 
    : user?.username?.[0]?.toUpperCase() || "U";

  const handleImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      toast({
        title: "Errore",
        description: "Per favore seleziona un'immagine valida",
        variant: "destructive",
      });
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast({
        title: "Errore",
        description: "L'immagine non può superare i 5MB",
        variant: "destructive",
      });
      return;
    }

    setIsUploadingImage(true);

    try {
      // Get the upload URL
      const response = await fetch('/api/users/profile-image-upload-url');
      if (!response.ok) {
        throw new Error('Could not get upload URL');
      }
      
      const { uploadUrl, objectPath } = await response.json();

      // Upload the file directly to the storage
      const uploadResponse = await fetch(uploadUrl, {
        method: 'PUT',
        body: file,
        headers: {
          'Content-Type': file.type,
        },
      });

      if (!uploadResponse.ok) {
        throw new Error('Upload failed');
      }

      // Update user with new profile image URL
      await apiRequest("PUT", `/api/users/${user?.id}`, {
        profileImageUrl: objectPath,
      });

      queryClient.invalidateQueries({ queryKey: ["/api/user"] });
      
      toast({
        title: "Successo",
        description: "Immagine profilo aggiornata",
      });
    } catch (error) {
      console.error('Image upload error:', error);
      toast({
        title: "Errore",
        description: "Impossibile caricare l'immagine",
        variant: "destructive",
      });
    } finally {
      setIsUploadingImage(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleRemoveImage = async () => {
    try {
      await apiRequest("PUT", `/api/users/${user?.id}`, {
        profileImageUrl: null,
      });

      queryClient.invalidateQueries({ queryKey: ["/api/user"] });
      
      toast({
        title: "Successo",
        description: "Immagine profilo rimossa",
      });
    } catch (error) {
      toast({
        title: "Errore",
        description: "Impossibile rimuovere l'immagine",
        variant: "destructive",
      });
    }
  };

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
                    {/* Profile Image Section */}
                    <Card className="mb-6">
                      <CardHeader>
                        <CardTitle>Immagine Profilo</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="flex items-center gap-6">
                          <Avatar className="w-24 h-24 rounded-lg">
                            {user?.profileImageUrl && (
                              <AvatarImage 
                                src={user.profileImageUrl.startsWith('/objects/') 
                                  ? user.profileImageUrl 
                                  : user.profileImageUrl} 
                                alt="Profile" 
                                className="object-cover"
                              />
                            )}
                            <AvatarFallback className="text-2xl font-medium bg-primary text-primary-foreground rounded-lg">
                              {userInitials}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex flex-col gap-2">
                            <input
                              type="file"
                              ref={fileInputRef}
                              onChange={handleImageUpload}
                              accept="image/*"
                              className="hidden"
                              data-testid="input-profile-image"
                            />
                            <Button
                              type="button"
                              variant="outline"
                              onClick={() => fileInputRef.current?.click()}
                              disabled={isUploadingImage}
                              data-testid="button-upload-image"
                            >
                              <Upload className="mr-2 h-4 w-4" />
                              {isUploadingImage ? "Caricamento..." : "Carica immagine"}
                            </Button>
                            {user?.profileImageUrl && (
                              <Button
                                type="button"
                                variant="outline"
                                className="text-destructive"
                                onClick={handleRemoveImage}
                                data-testid="button-remove-image"
                              >
                                <Trash2 className="mr-2 h-4 w-4" />
                                Rimuovi
                              </Button>
                            )}
                            <p className="text-xs text-muted-foreground">
                              JPG, PNG o GIF. Max 5MB.
                            </p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>

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