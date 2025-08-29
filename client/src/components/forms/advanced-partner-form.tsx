import { useState, useCallback, useRef, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { insertPartnerSchema } from "@shared/schema";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { ObjectUploader } from "@/components/ObjectUploader";
import { Loader2, Upload, MapPin, Building2, Globe, CreditCard, FileText, Camera, Search } from "lucide-react";
import type { UploadResult } from "@uppy/core";

// Extended schema with validation for Italian CF and VAT
const advancedPartnerSchema = insertPartnerSchema.extend({
  // Rendi tutti i campi opzionali tranne il nome
  email: z.string().optional(),
  phone: z.string().optional(),
  company: z.string().optional(),
  position: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  postalCode: z.string().optional(),
  country: z.string().optional(),
  fiscalCode: z.string().optional().refine(
    (val) => !val || val.length === 11 || val.length === 16,
    "Codice fiscale non valido (11 caratteri per aziende, 16 per persone fisiche)"
  ),
  vatNumber: z.string().optional().refine(
    (val) => !val || /^(IT)?[0-9]{11}$/.test(val.replace(/\s/g, '')),
    "Partita IVA non valida (deve essere di 11 cifre)"
  ),
  logoUrl: z.string().optional(),
  website: z.string().optional().refine(
    (val) => !val || val.startsWith('http'),
    "Il sito web deve iniziare con http:// o https://"
  ),
  notes: z.string().optional(),
  // Rendi userId opzionale nel form dato che lo aggiungiamo programmaticamente
  userId: z.string().optional(),
});

type FormData = z.infer<typeof advancedPartnerSchema>;

interface AddressSuggestion {
  formatted: string;
  street?: string;
  city?: string;
  postcode?: string;
  country?: string;
}

interface CompanyInfo {
  name: string;
  legalName?: string;
  address?: string;
  city?: string;
  postalCode?: string;
  country?: string;
  fiscalCode?: string;
  vatNumber?: string;
  website?: string;
  logoUrl?: string;
  description?: string;
  sector?: string;
}

interface AdvancedPartnerFormProps {
  onSuccess?: () => void;
}

export default function AdvancedPartnerForm({ onSuccess }: AdvancedPartnerFormProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [logoPreview, setLogoPreview] = useState<string>("");
  const [addressSuggestions, setAddressSuggestions] = useState<AddressSuggestion[]>([]);
  const [showAddressSuggestions, setShowAddressSuggestions] = useState(false);
  const [companySuggestions, setCompanySuggestions] = useState<CompanyInfo[]>([]);
  const [showCompanySuggestions, setShowCompanySuggestions] = useState(false);
  const [isSearchingCompany, setIsSearchingCompany] = useState(false);
  const [showSearchDialog, setShowSearchDialog] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [isValidatingFiscalCode, setIsValidatingFiscalCode] = useState(false);
  const [isValidatingVatNumber, setIsValidatingVatNumber] = useState(false);

  const form = useForm<FormData>({
    resolver: zodResolver(advancedPartnerSchema),
    defaultValues: {
      name: "",
      email: "",
      phone: "",
      company: "",
      position: "",
      address: "",
      city: "",
      postalCode: "",
      country: "IT",
      fiscalCode: "",
      vatNumber: "",
      logoUrl: "",
      website: "",
      type: "client",
      notes: "",
    },
  });

  // Address autocomplete
  const handleAddressSearch = useCallback(async (query: string) => {
    if (query.length < 3) {
      setAddressSuggestions([]);
      setShowAddressSuggestions(false);
      return;
    }

    try {
      const response = await fetch(`/api/address/suggestions?q=${encodeURIComponent(query)}`);
      const suggestions = await response.json();
      setAddressSuggestions(suggestions);
      setShowAddressSuggestions(suggestions.length > 0);
    } catch (error) {
      console.error('Address search error:', error);
      setAddressSuggestions([]);
      setShowAddressSuggestions(false);
    }
  }, []);

  const selectAddressSuggestion = (suggestion: AddressSuggestion) => {
    form.setValue('address', suggestion.formatted);
    if (suggestion.city) form.setValue('city', suggestion.city);
    if (suggestion.postcode) form.setValue('postalCode', suggestion.postcode);
    if (suggestion.country) form.setValue('country', suggestion.country === 'Italy' ? 'IT' : suggestion.country);
    setShowAddressSuggestions(false);
    setAddressSuggestions([]);
  };

  // Ref per mantenere l'ultimo valore di ricerca senza causare re-render
  const lastSearchValueRef = useRef<string>('');

  // Apri dialog di ricerca
  const openSearchDialog = () => {
    setShowSearchDialog(true);
    setSearchQuery("");
    setCompanySuggestions([]);
    setShowCompanySuggestions(false);
  };

  // Company search dal dialog
  const searchCompanyInDialog = async () => {
    if (!searchQuery || searchQuery.length < 2) {
      toast({ 
        title: "Inserisci almeno 2 caratteri per cercare", 
        variant: "destructive" 
      });
      return;
    }

    setIsSearchingCompany(true);
    
    try {
      console.log(`Manual search for: ${searchQuery}`);
      const response = await fetch(`/api/companies/search?q=${encodeURIComponent(searchQuery)}`);
      const companies = await response.json();
      console.log(`Found ${companies.length} companies:`, companies);
      
      setCompanySuggestions(companies);
      
      if (companies.length === 0) {
        toast({ 
          title: "Azienda non presente nel database", 
          description: "Puoi compilare i dati manualmente nel form" 
        });
      }
    } catch (error) {
      console.error('Company search error:', error);
      setCompanySuggestions([]);
      toast({ 
        title: "Errore nella ricerca", 
        description: "Impossibile cercare le aziende al momento",
        variant: "destructive" 
      });
    } finally {
      setIsSearchingCompany(false);
    }
  };


  const selectCompanySuggestion = (company: CompanyInfo) => {
    // Auto-populate all company fields
    form.setValue('name', company.legalName || company.name);
    form.setValue('company', company.name);
    if (company.address) form.setValue('address', company.address);
    if (company.city) form.setValue('city', company.city);
    if (company.postalCode) form.setValue('postalCode', company.postalCode);
    if (company.country) form.setValue('country', company.country);
    if (company.fiscalCode) form.setValue('fiscalCode', company.fiscalCode);
    if (company.vatNumber) form.setValue('vatNumber', company.vatNumber.replace('IT', ''));
    if (company.website) form.setValue('website', company.website);
    
    // Set logo preview immediately
    if (company.logoUrl) {
      form.setValue('logoUrl', company.logoUrl);
      setLogoPreview(company.logoUrl);
    }
    
    // Close search dialog
    setShowSearchDialog(false);
    setCompanySuggestions([]);
    setSearchQuery("");
    
    toast({ 
      title: "Informazioni azienda caricate!", 
      description: `Dati di ${company.name} inseriti automaticamente` 
    });
  };

  // Fiscal code validation
  const validateFiscalCode = async (fiscalCode: string) => {
    if (!fiscalCode) return;
    setIsValidatingFiscalCode(true);
    
    try {
      const response = await fetch('/api/validate/fiscal-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fiscalCode }),
      });
      const result = await response.json();
      
      if (!result.valid && result.error) {
        form.setError('fiscalCode', { message: result.error });
      }
    } catch (error) {
      console.error('Fiscal code validation error:', error);
    } finally {
      setIsValidatingFiscalCode(false);
    }
  };

  // VAT number validation
  const validateVatNumber = async (vatNumber: string) => {
    if (!vatNumber) return;
    setIsValidatingVatNumber(true);
    
    try {
      const response = await fetch('/api/validate/vat-number', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vatNumber }),
      });
      const result = await response.json();
      
      if (!result.valid && result.error) {
        form.setError('vatNumber', { message: result.error });
      }
    } catch (error) {
      console.error('VAT number validation error:', error);
    } finally {
      setIsValidatingVatNumber(false);
    }
  };

  // Logo upload handling
  const handleGetLogoUploadParameters = async () => {
    const response = await apiRequest("POST", "/api/partners/logo/upload");
    const data = await response.json();
    return {
      method: "PUT" as const,
      url: data.uploadURL,
    };
  };

  const handleLogoUploadComplete = async (result: UploadResult<Record<string, unknown>, Record<string, unknown>>) => {
    if (result.successful && result.successful.length > 0) {
      const uploadURL = result.successful[0].uploadURL;
      if (uploadURL) {
        console.log('Logo uploaded to:', uploadURL);
        
        // Invia l'URL di upload al server per normalizzarlo
        try {
          const response = await apiRequest("POST", "/api/partners/logo/normalize", { 
            uploadURL: uploadURL 
          });
          const { normalizedPath } = await response.json();
          
          // Usa il percorso normalizzato per preview e storage
          const previewURL = normalizedPath;
          console.log('Normalized logo path:', previewURL);
          
          form.setValue('logoUrl', previewURL);
          setLogoPreview(previewURL);
          toast({ title: "Logo caricato con successo!" });
        } catch (error) {
          console.error('Error normalizing logo URL:', error);
          // Fallback: usa l'URL originale
          form.setValue('logoUrl', uploadURL);
          setLogoPreview(uploadURL);
          toast({ title: "Logo caricato (URL non ottimizzato)" });
        }
      }
    }
  };

  const createPartnerMutation = useMutation({
    mutationFn: async (data: FormData & { userId?: string }) => {
      console.log('Mutation function called with:', data);
      
      const partnerData = {
        name: data.name,
        type: data.type,
        userId: data.userId || user!.id,
        email: data.email || null,
        phone: data.phone || null,
        company: data.company || null,
        position: data.position || null,
        address: data.address || null,
        city: data.city || null,
        postalCode: data.postalCode || null,
        country: data.country || "IT",
        fiscalCode: data.fiscalCode || null,
        vatNumber: data.vatNumber || null,
        logoUrl: data.logoUrl || null,
        website: data.website || null,
        notes: data.notes || null,
      };
      
      console.log('Sending partner data to API:', partnerData);
      const res = await apiRequest("POST", "/api/partners", partnerData);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/partners"] });
      toast({ title: "Partner creato con successo!" });
      onSuccess?.();
    },
    onError: (error: Error) => {
      toast({
        title: "Errore nella creazione del partner",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: FormData) => {
    console.log('=== FORM SUBMISSION ===');
    console.log('Form submitted with data:', data);
    console.log('Form errors:', form.formState.errors);
    console.log('Form is valid:', form.formState.isValid);
    console.log('User:', user);
    
    if (!user) {
      toast({
        title: "Errore di autenticazione", 
        description: "Devi essere loggato per creare un partner",
        variant: "destructive"
      });
      return;
    }
    
    // Aggiungere valori di default mancanti
    const completeData = {
      ...data,
      country: data.country || "IT", // Default Italia
      userId: user.id
    };
    
    console.log('Submitting complete data:', completeData);
    createPartnerMutation.mutate(completeData);
  };

  return (
    <div className="space-y-6">
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          
          {/* Basic Information Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="h-5 w-5" />
                Informazioni Base
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nome / Denominazione *</FormLabel>
                      <FormControl>
                        <div className="flex gap-2">
                          <Input 
                            {...field}
                            value={field.value || ""}
                            placeholder="Nome azienda o persona"
                            onChange={field.onChange}
                            autoComplete="off"
                            data-testid="input-partner-name"
                            className="flex-1"
                          />
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            onClick={openSearchDialog}
                            data-testid="button-search-company"
                            title="Cerca aziende (Google Places + database italiano)"
                          >
                            <Search className="h-4 w-4" />
                          </Button>
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="type"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Tipologia</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-partner-type">
                            <SelectValue placeholder="Seleziona tipologia" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="client">Cliente</SelectItem>
                          <SelectItem value="vendor">Fornitore</SelectItem>
                          <SelectItem value="consultant">Consulente</SelectItem>
                          <SelectItem value="other">Altro</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <Input 
                          {...field}
                          value={field.value || ""} 
                          type="email" 
                          placeholder="mario@example.com"
                          data-testid="input-partner-email"
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
                      <FormLabel>Telefono</FormLabel>
                      <FormControl>
                        <Input 
                          {...field}
                          value={field.value || ""} 
                          placeholder="+39 333 123 4567"
                          data-testid="input-partner-phone"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="company"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Azienda</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Input 
                            {...field}
                            value={field.value || ""}
                            placeholder="Nome commerciale dell'azienda"
                            onChange={(e) => {
                              field.onChange(e);
                            }}
                            autoComplete="off"
                            data-testid="input-partner-company"
                          />
                        </div>
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
                      <FormLabel>Ruolo / Posizione</FormLabel>
                      <FormControl>
                        <Input 
                          {...field}
                          value={field.value || ""} 
                          placeholder="CTO, Project Manager..."
                          data-testid="input-partner-position"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </CardContent>
          </Card>

          {/* Address Information Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MapPin className="h-5 w-5" />
                Informazioni Indirizzo
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <FormField
                control={form.control}
                name="address"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Indirizzo</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Input 
                          {...field}
                          value={field.value || ""}
                          placeholder="Via Roma 123, Milano"
                          onChange={(e) => {
                            field.onChange(e);
                          }}
                          data-testid="input-partner-address"
                        />
                        {showAddressSuggestions && (
                          <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg max-h-48 overflow-y-auto">
                            {addressSuggestions.map((suggestion, index) => (
                              <button
                                key={index}
                                type="button"
                                className="w-full px-3 py-2 text-left hover:bg-gray-100 text-sm"
                                onClick={() => selectAddressSuggestion(suggestion)}
                                data-testid={`suggestion-${index}`}
                              >
                                {suggestion.formatted}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <FormField
                  control={form.control}
                  name="city"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Città</FormLabel>
                      <FormControl>
                        <Input 
                          {...field}
                          value={field.value || ""} 
                          placeholder="Milano"
                          data-testid="input-partner-city"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="postalCode"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>CAP</FormLabel>
                      <FormControl>
                        <Input 
                          {...field}
                          value={field.value || ""} 
                          placeholder="20121"
                          data-testid="input-partner-postal-code"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="country"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Paese</FormLabel>
                      <FormControl>
                        <Input 
                          {...field}
                          value={field.value || ""} 
                          placeholder="IT"
                          data-testid="input-partner-country"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </CardContent>
          </Card>

          {/* Tax Information Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CreditCard className="h-5 w-5" />
                Informazioni Fiscali
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="fiscalCode"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Codice Fiscale</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Input 
                            {...field}
                            placeholder="RSSMRA80A01F205X"
                            onBlur={(e) => {
                              field.onBlur();
                              validateFiscalCode(e.target.value);
                            }}
                            data-testid="input-partner-fiscal-code"
                          />
                          {isValidatingFiscalCode && (
                            <Loader2 className="absolute right-3 top-2.5 h-4 w-4 animate-spin" />
                          )}
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="vatNumber"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Partita IVA</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Input 
                            {...field}
                            placeholder="IT12345678901"
                            onBlur={(e) => {
                              field.onBlur();
                              validateVatNumber(e.target.value);
                            }}
                            data-testid="input-partner-vat-number"
                          />
                          {isValidatingVatNumber && (
                            <Loader2 className="absolute right-3 top-2.5 h-4 w-4 animate-spin" />
                          )}
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </CardContent>
          </Card>

          {/* Logo and Website Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Globe className="h-5 w-5" />
                Logo e Sito Web
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Logo Aziendale</label>
                  <div className="flex items-center gap-4">
                    {logoPreview && (
                      <div className="w-16 h-16 border border-gray-200 rounded-lg p-2 bg-gray-50">
                        <img 
                          src={logoPreview} 
                          alt="Logo preview" 
                          className="w-full h-full object-contain"
                          onError={(e) => {
                            console.error('Logo preview error:', e);
                            setLogoPreview("");
                          }}
                        />
                      </div>
                    )}
                    <div className="flex-1">
                      <ObjectUploader
                        maxNumberOfFiles={1}
                        maxFileSize={5242880} // 5MB
                        onGetUploadParameters={handleGetLogoUploadParameters}
                        onComplete={handleLogoUploadComplete}
                        buttonClassName="w-full"
                      >
                        <Camera className="mr-2 h-4 w-4" />
                        {logoPreview ? 'Cambia Logo' : 'Carica Logo'}
                      </ObjectUploader>
                    </div>
                  </div>
                  {(form.getValues('logoUrl') || logoPreview) && (
                    <p className="text-xs text-gray-500">
                      Logo: {form.getValues('logoUrl')?.split('/').pop() || 'Logo caricato'}
                    </p>
                  )}
                </div>

                <FormField
                  control={form.control}
                  name="website"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Sito Web</FormLabel>
                      <FormControl>
                        <Input 
                          {...field} 
                          placeholder="https://www.example.com"
                          data-testid="input-partner-website"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </CardContent>
          </Card>

          {/* Notes Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Note
              </CardTitle>
            </CardHeader>
            <CardContent>
              <FormField
                control={form.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Note aggiuntive</FormLabel>
                    <FormControl>
                      <Textarea 
                        {...field}
                        value={field.value || ""} 
                        placeholder="Inserisci note, preferenze o informazioni aggiuntive..."
                        className="min-h-[100px]"
                        data-testid="textarea-partner-notes"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          {/* Submit Button */}
          <div className="flex justify-end">
            <Button
              type="submit"
              disabled={createPartnerMutation.isPending}
              className="w-full md:w-auto"
              data-testid="button-submit-partner"
            >
              {createPartnerMutation.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Crea Partner
            </Button>
          </div>
        </form>
      </Form>

      {/* Dialog di ricerca azienda */}
      <Dialog open={showSearchDialog} onOpenChange={setShowSearchDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Cerca Aziende</DialogTitle>
            <p className="text-sm text-gray-600 mt-2">
              Ricerca tramite Google Places (qualsiasi azienda) + database aziende italiane famose. Se non trovi risultati, compila i dati manualmente.
            </p>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex gap-2">
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Digita il nome dell'azienda da cercare..."
                className="flex-1"
                data-testid="input-search-company"
                onFocus={(e) => {
                  // Previeni la selezione automatica del testo
                  e.preventDefault();
                  setTimeout(() => {
                    e.target.setSelectionRange(e.target.value.length, e.target.value.length);
                  }, 0);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    searchCompanyInDialog();
                  }
                }}
                autoFocus={false}
              />
              <Button
                type="button"
                onClick={searchCompanyInDialog}
                disabled={isSearchingCompany}
                data-testid="button-search-in-dialog"
              >
                {isSearchingCompany ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Search className="mr-2 h-4 w-4" />
                )}
                Cerca
              </Button>
            </div>

            {/* Risultati ricerca */}
            {companySuggestions.length > 0 && (
              <div className="border border-gray-200 rounded-lg max-h-80 overflow-y-auto">
                {companySuggestions.map((company, index) => (
                  <button
                    key={index}
                    type="button"
                    className="w-full px-4 py-4 text-left hover:bg-gray-50 border-b border-gray-100 last:border-b-0 transition-colors"
                    onClick={() => selectCompanySuggestion(company)}
                    data-testid={`dialog-suggestion-${index}`}
                  >
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <div className="font-medium text-base mb-1">{company.name}</div>
                        {company.legalName && company.legalName !== company.name && (
                          <div className="text-sm text-gray-600 mb-1">{company.legalName}</div>
                        )}
                        <div className="flex items-center gap-4 text-sm text-gray-500">
                          {company.address && <span>📍 {company.address}</span>}
                          {company.sector && <span>🏢 {company.sector}</span>}
                        </div>
                        {company.description && (
                          <div className="text-sm text-gray-600 mt-2 line-clamp-2">
                            {company.description}
                          </div>
                        )}
                      </div>
                      {company.logoUrl && (
                        <div className="w-12 h-12 bg-gray-100 rounded-lg p-1 ml-4">
                          <img 
                            src={company.logoUrl} 
                            alt={`Logo ${company.name}`}
                            className="w-full h-full object-contain"
                          />
                        </div>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}

            {!isSearchingCompany && companySuggestions.length === 0 && searchQuery && (
              <div className="text-center py-8">
                <Building2 className="mx-auto h-12 w-12 mb-4 text-gray-300" />
                <p className="text-gray-600 mb-2">Nessuna azienda trovata per "{searchQuery}"</p>
                <p className="text-sm text-gray-500 mb-4">Prova con un nome diverso o più specifico</p>
                <Button 
                  onClick={() => setShowSearchDialog(false)}
                  variant="outline"
                  className="mt-2"
                >
                  Chiudi e compila manualmente
                </Button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}