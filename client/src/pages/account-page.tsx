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
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest, getQueryFn } from "@/lib/queryClient";
import EmailConfig from "@/components/email-config";
import { EmailSendDialog } from "@/components/email-send-dialog";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Send, Upload, Trash2, Clock, Bot, CheckCircle, Plus, Pencil, Settings2, Power, PowerOff, FlaskConical } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useOrganization } from "@/contexts/organization-context";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export default function AccountPage() {
  const [location] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { currentOrganizationId, currentOrganization } = useOrganization();
  const [showSendDialog, setShowSendDialog] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [formData, setFormData] = useState({
    firstName: user?.firstName || "",
    lastName: user?.lastName || "",
    email: user?.email || "",
  });
  
  const [calendarScrollHour, setCalendarScrollHour] = useState<number>(
    user?.calendarScrollHour ?? 9
  );

  // AI model selection state
  const [selectedModelKey, setSelectedModelKey] = useState<string>("");

  const { data: aiModels = [] } = useQuery<any[]>({
    queryKey: ["/api/ai/models"],
    queryFn: getQueryFn({ on401: "throw" }),
  });

  const { data: allAiModels = [], refetch: refetchAllModels } = useQuery<any[]>({
    queryKey: ["/api/ai/models/all"],
    queryFn: getQueryFn({ on401: "throw" }),
  });

  const { data: aiProviders = [] } = useQuery<any[]>({
    queryKey: ["/api/ai/providers"],
    queryFn: getQueryFn({ on401: "throw" }),
  });

  const { data: orgData } = useQuery<any>({
    queryKey: ["/api/organizations", currentOrganizationId],
    queryFn: getQueryFn({ on401: "throw" }),
    enabled: !!currentOrganizationId,
  });

  // Sync selected model from org settings when org data loads
  const currentOrgModelKey = orgData?.settings?.aiDefaultModelKey || "";

  // Model management state
  const [showAddModel, setShowAddModel] = useState(false);
  const [editingModel, setEditingModel] = useState<any>(null);
  const [deletingModelId, setDeletingModelId] = useState<string | null>(null);
  const [modelForm, setModelForm] = useState({
    providerId: "", modelKey: "", modelId: "", displayName: "",
    inputPricePerMToken: "", outputPricePerMToken: "", status: "active",
  });

  const saveAiModelMutation = useMutation({
    mutationFn: async (modelKey: string) => {
      return await apiRequest("PATCH", `/api/organizations/${currentOrganizationId}/settings`, {
        aiDefaultModelKey: modelKey,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/organizations", currentOrganizationId] });
      toast({ title: "Salvato", description: "Modello AI aggiornato per questa organizzazione" });
    },
    onError: () => {
      toast({ title: "Errore", description: "Impossibile salvare il modello AI", variant: "destructive" });
    },
  });

  const createModelMutation = useMutation({
    mutationFn: async (data: any) => apiRequest("POST", "/api/ai/models", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ai/models"] });
      queryClient.invalidateQueries({ queryKey: ["/api/ai/models/all"] });
      setShowAddModel(false);
      setModelForm({ providerId: "", modelKey: "", modelId: "", displayName: "", inputPricePerMToken: "", outputPricePerMToken: "", status: "active" });
      toast({ title: "Modello aggiunto" });
    },
    onError: (e: any) => toast({ title: "Errore", description: e.message, variant: "destructive" }),
  });

  const updateModelMutation = useMutation({
    mutationFn: async ({ id, ...data }: any) => apiRequest("PATCH", `/api/ai/models/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ai/models"] });
      queryClient.invalidateQueries({ queryKey: ["/api/ai/models/all"] });
      setEditingModel(null);
      toast({ title: "Modello aggiornato" });
    },
    onError: (e: any) => toast({ title: "Errore", description: e.message, variant: "destructive" }),
  });

  const deleteModelMutation = useMutation({
    mutationFn: async (id: string) => apiRequest("DELETE", `/api/ai/models/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ai/models"] });
      queryClient.invalidateQueries({ queryKey: ["/api/ai/models/all"] });
      setDeletingModelId(null);
      toast({ title: "Modello eliminato" });
    },
    onError: (e: any) => toast({ title: "Errore", description: e.message, variant: "destructive" }),
  });

  const statusCycleMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) =>
      apiRequest("PATCH", `/api/ai/models/${id}`, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ai/models"] });
      queryClient.invalidateQueries({ queryKey: ["/api/ai/models/all"] });
    },
  });

  const STATUS_NEXT: Record<string, string> = { active: "deprecated", deprecated: "active", beta: "active" };
  const STATUS_LABEL: Record<string, { label: string; icon: any; cls: string }> = {
    active: { label: "Attivo", icon: Power, cls: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200" },
    deprecated: { label: "Deprecato", icon: PowerOff, cls: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400" },
    beta: { label: "Beta", icon: FlaskConical, cls: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200" },
  };

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
  
  const updateCalendarPreferencesMutation = useMutation({
    mutationFn: async (hour: number) => {
      return await apiRequest("PUT", `/api/users/${user?.id}`, { calendarScrollHour: hour });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/user"] });
      toast({
        title: "Successo",
        description: "Preferenze calendario aggiornate",
      });
    },
    onError: () => {
      toast({
        title: "Errore",
        description: "Impossibile aggiornare le preferenze",
        variant: "destructive",
      });
    },
  });
  
  const handleCalendarScrollHourChange = (value: string) => {
    const hour = parseInt(value);
    setCalendarScrollHour(hour);
    updateCalendarPreferencesMutation.mutate(hour);
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
                    <TabsTrigger value="ai">Modello AI</TabsTrigger>
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
                    <Card>
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                          <Clock className="h-5 w-5" />
                          Preferenze Calendario
                        </CardTitle>
                        <CardDescription>
                          Configura il comportamento del calendario globale
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="space-y-2">
                          <Label htmlFor="calendarScrollHour">
                            Ora di scroll predefinita
                          </Label>
                          <p className="text-sm text-muted-foreground">
                            Quando apri la vista giorno o settimana, il calendario scorrerà automaticamente a quest'ora
                          </p>
                          <Select
                            value={calendarScrollHour.toString()}
                            onValueChange={handleCalendarScrollHourChange}
                            disabled={updateCalendarPreferencesMutation.isPending}
                            data-testid="select-calendar-scroll-hour"
                          >
                            <SelectTrigger className="w-48" data-testid="select-trigger-calendar-scroll-hour">
                              <SelectValue placeholder="Seleziona ora" />
                            </SelectTrigger>
                            <SelectContent>
                              {Array.from({ length: 24 }, (_, i) => (
                                <SelectItem key={i} value={i.toString()}>
                                  {i.toString().padStart(2, '0')}:00
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </CardContent>
                    </Card>
                  </TabsContent>

                  <TabsContent value="ai" className="space-y-4">
                    {/* Default model selector */}
                    <Card>
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                          <Bot className="h-5 w-5" />
                          Modello predefinito per questa organizzazione
                        </CardTitle>
                        <CardDescription>
                          Usato dall'agente AI quando non selezioni un modello specifico. Organizzazione: <strong>{currentOrganization?.name || currentOrganizationId}</strong>.
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        {currentOrgModelKey && (
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <CheckCircle className="h-4 w-4 text-green-500" />
                            Attuale: <Badge variant="secondary">{currentOrgModelKey}</Badge>
                          </div>
                        )}
                        {!currentOrgModelKey && (
                          <p className="text-sm text-muted-foreground">
                            Nessuno impostato — verrà usato <code>openai/gpt-5</code>.
                          </p>
                        )}
                        <div className="flex items-end gap-2">
                          <div className="flex-1 space-y-1">
                            <Label>Seleziona modello</Label>
                            <Select value={selectedModelKey || currentOrgModelKey || ""} onValueChange={setSelectedModelKey} data-testid="select-ai-model">
                              <SelectTrigger data-testid="select-trigger-ai-model"><SelectValue placeholder="Seleziona..." /></SelectTrigger>
                              <SelectContent>
                                {Object.entries(aiModels.reduce((acc: Record<string, any[]>, m: any) => {
                                  const p = m.providerName || m.providerSlug || "Altro";
                                  if (!acc[p]) acc[p] = [];
                                  acc[p].push(m); return acc;
                                }, {})).map(([provider, models]) => (
                                  <div key={provider}>
                                    <div className="px-2 py-1 text-xs font-semibold text-muted-foreground uppercase">{provider}</div>
                                    {(models as any[]).map((m: any) => (
                                      <SelectItem key={m.modelKey} value={m.modelKey}>{m.displayName}</SelectItem>
                                    ))}
                                  </div>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <Button onClick={() => saveAiModelMutation.mutate(selectedModelKey || currentOrgModelKey)} disabled={saveAiModelMutation.isPending || !(selectedModelKey || currentOrgModelKey)} data-testid="button-save-ai-model">
                            {saveAiModelMutation.isPending ? "..." : "Salva"}
                          </Button>
                        </div>
                        <div className="p-3 bg-muted rounded-md text-xs text-muted-foreground space-y-1">
                          <p className="font-medium text-foreground">Chiavi API necessarie:</p>
                          <p><code>OPENAI_API_KEY</code> — OpenAI (GPT-4o, GPT-5) · <code>ANTHROPIC_API_KEY</code> — Anthropic (Claude)</p>
                        </div>
                      </CardContent>
                    </Card>

                    {/* Model catalog management */}
                    <Card>
                      <CardHeader>
                        <div className="flex items-center justify-between">
                          <div>
                            <CardTitle className="flex items-center gap-2">
                              <Settings2 className="h-5 w-5" />
                              Catalogo modelli
                            </CardTitle>
                            <CardDescription>Aggiungi, modifica o disattiva i modelli AI disponibili nel sistema.</CardDescription>
                          </div>
                          <Button size="sm" onClick={() => { setModelForm({ providerId: aiProviders[0]?.id || "", modelKey: "", modelId: "", displayName: "", inputPricePerMToken: "", outputPricePerMToken: "", status: "active" }); setShowAddModel(true); }} className="gap-1">
                            <Plus className="h-4 w-4" /> Aggiungi
                          </Button>
                        </div>
                      </CardHeader>
                      <CardContent className="p-0">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Provider</TableHead>
                              <TableHead>Nome</TableHead>
                              <TableHead>Model ID</TableHead>
                              <TableHead className="text-right">In $/M</TableHead>
                              <TableHead className="text-right">Out $/M</TableHead>
                              <TableHead>Stato</TableHead>
                              <TableHead className="w-20"></TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {allAiModels.map((m: any) => {
                              const s = STATUS_LABEL[m.status] || STATUS_LABEL.active;
                              const StatusIcon = s.icon;
                              return (
                                <TableRow key={m.id} className={m.status === "deprecated" ? "opacity-50" : ""}>
                                  <TableCell><Badge variant="outline" className="text-xs">{m.providerSlug}</Badge></TableCell>
                                  <TableCell className="font-medium text-sm">{m.displayName}</TableCell>
                                  <TableCell className="text-xs text-muted-foreground font-mono">{m.modelId}</TableCell>
                                  <TableCell className="text-right text-xs">{m.inputPricePerMToken ?? "—"}</TableCell>
                                  <TableCell className="text-right text-xs">{m.outputPricePerMToken ?? "—"}</TableCell>
                                  <TableCell>
                                    <button
                                      onClick={() => statusCycleMutation.mutate({ id: m.id, status: STATUS_NEXT[m.status] || "active" })}
                                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium cursor-pointer hover:opacity-80 transition-opacity ${s.cls}`}
                                      title={`Clicca per → ${STATUS_NEXT[m.status]}`}
                                    >
                                      <StatusIcon className="h-3 w-3" />{s.label}
                                    </button>
                                  </TableCell>
                                  <TableCell>
                                    <div className="flex items-center gap-1 justify-end">
                                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setEditingModel({ ...m }); setModelForm({ providerId: m.providerId, modelKey: m.modelKey, modelId: m.modelId, displayName: m.displayName, inputPricePerMToken: m.inputPricePerMToken ?? "", outputPricePerMToken: m.outputPricePerMToken ?? "", status: m.status }); }}>
                                        <Pencil className="h-3.5 w-3.5" />
                                      </Button>
                                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => setDeletingModelId(m.id)}>
                                        <Trash2 className="h-3.5 w-3.5" />
                                      </Button>
                                    </div>
                                  </TableCell>
                                </TableRow>
                              );
                            })}
                            {allAiModels.length === 0 && (
                              <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground text-sm py-6">Nessun modello nel catalogo</TableCell></TableRow>
                            )}
                          </TableBody>
                        </Table>
                      </CardContent>
                    </Card>

                    {/* Add/Edit model dialog */}
                    <Dialog open={showAddModel || !!editingModel} onOpenChange={(v) => { if (!v) { setShowAddModel(false); setEditingModel(null); } }}>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>{editingModel ? "Modifica modello" : "Aggiungi modello AI"}</DialogTitle>
                        </DialogHeader>
                        <div className="space-y-3">
                          {!editingModel && (
                            <div className="space-y-1">
                              <Label>Provider</Label>
                              <Select value={modelForm.providerId} onValueChange={v => setModelForm(f => ({ ...f, providerId: v }))}>
                                <SelectTrigger><SelectValue placeholder="Seleziona provider..." /></SelectTrigger>
                                <SelectContent>
                                  {aiProviders.map((p: any) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                                </SelectContent>
                              </Select>
                            </div>
                          )}
                          <div className="space-y-1">
                            <Label>Model Key <span className="text-muted-foreground text-xs">(es. anthropic/claude-opus-4-8)</span></Label>
                            <Input value={modelForm.modelKey} onChange={e => setModelForm(f => ({ ...f, modelKey: e.target.value }))} disabled={!!editingModel} placeholder="provider/model-name" />
                          </div>
                          <div className="space-y-1">
                            <Label>Model ID <span className="text-muted-foreground text-xs">(ID reale inviato all'API)</span></Label>
                            <Input value={modelForm.modelId} onChange={e => setModelForm(f => ({ ...f, modelId: e.target.value }))} placeholder="claude-opus-4-8-20260101" />
                          </div>
                          <div className="space-y-1">
                            <Label>Nome visualizzato</Label>
                            <Input value={modelForm.displayName} onChange={e => setModelForm(f => ({ ...f, displayName: e.target.value }))} placeholder="Claude Opus 4.8" />
                          </div>
                          <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1">
                              <Label>Prezzo input ($/M token)</Label>
                              <Input type="number" step="0.01" value={modelForm.inputPricePerMToken} onChange={e => setModelForm(f => ({ ...f, inputPricePerMToken: e.target.value }))} placeholder="15.00" />
                            </div>
                            <div className="space-y-1">
                              <Label>Prezzo output ($/M token)</Label>
                              <Input type="number" step="0.01" value={modelForm.outputPricePerMToken} onChange={e => setModelForm(f => ({ ...f, outputPricePerMToken: e.target.value }))} placeholder="75.00" />
                            </div>
                          </div>
                          <div className="space-y-1">
                            <Label>Stato</Label>
                            <Select value={modelForm.status} onValueChange={v => setModelForm(f => ({ ...f, status: v }))}>
                              <SelectTrigger><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="active">Attivo</SelectItem>
                                <SelectItem value="beta">Beta</SelectItem>
                                <SelectItem value="deprecated">Deprecato</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                        <DialogFooter>
                          <Button variant="outline" onClick={() => { setShowAddModel(false); setEditingModel(null); }}>Annulla</Button>
                          <Button
                            onClick={() => editingModel
                              ? updateModelMutation.mutate({ id: editingModel.id, ...modelForm })
                              : createModelMutation.mutate(modelForm)
                            }
                            disabled={createModelMutation.isPending || updateModelMutation.isPending || !modelForm.modelKey || !modelForm.modelId || !modelForm.displayName}
                          >
                            {(createModelMutation.isPending || updateModelMutation.isPending) ? "Salvataggio..." : "Salva"}
                          </Button>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>

                    {/* Delete confirm */}
                    <AlertDialog open={!!deletingModelId} onOpenChange={v => !v && setDeletingModelId(null)}>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Eliminare il modello?</AlertDialogTitle>
                          <AlertDialogDescription>L'azione è irreversibile. Il modello verrà rimosso dal catalogo.</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Annulla</AlertDialogCancel>
                          <AlertDialogAction onClick={() => deletingModelId && deleteModelMutation.mutate(deletingModelId)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                            Elimina
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
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