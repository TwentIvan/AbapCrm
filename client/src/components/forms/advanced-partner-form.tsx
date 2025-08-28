import { useState, useCallback } from "react";
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
import { Separator } from "@/components/ui/separator";
import { ObjectUploader } from "@/components/ObjectUploader";
import { Loader2, Upload, MapPin, Building2, Globe, CreditCard, FileText, Camera } from "lucide-react";
import type { UploadResult } from "@uppy/core";

// Extended schema with validation for Italian CF and VAT
const advancedPartnerSchema = insertPartnerSchema.extend({
  fiscalCode: z.string().optional().refine(
    (val) => !val || val.length === 11 || val.length === 16,
    "Codice fiscale non valido (11 caratteri per aziende, 16 per persone fisiche)"
  ),
  vatNumber: z.string().optional().refine(
    (val) => !val || /^(IT)?[0-9]{11}$/.test(val.replace(/\s/g, '')),
    "Partita IVA non valida (deve essere di 11 cifre)"
  ),
  website: z.string().optional().refine(
    (val) => !val || val.startsWith('http'),
    "Il sito web deve iniziare con http:// o https://"
  ),
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
  
  const [addressSuggestions, setAddressSuggestions] = useState<AddressSuggestion[]>([]);
  const [showAddressSuggestions, setShowAddressSuggestions] = useState(false);
  const [companySuggestions, setCompanySuggestions] = useState<CompanyInfo[]>([]);
  const [showCompanySuggestions, setShowCompanySuggestions] = useState(false);
  const [isValidatingFiscalCode, setIsValidatingFiscalCode] = useState(false);
  const [isValidatingVatNumber, setIsValidatingVatNumber] = useState(false);
  const [logoPreview, setLogoPreview] = useState<string>("");

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

  // Company autocomplete with debouncing to avoid excessive API calls
  const handleCompanySearch = useCallback(
    debounce(async (query: string) => {
      if (query.length < 2) {
        setCompanySuggestions([]);
        setShowCompanySuggestions(false);
        return;
      }

      try {
        console.log(`Searching companies for: "${query}"`);
        const response = await fetch(`/api/companies/search?q=${encodeURIComponent(query)}`);
        const companies = await response.json();
        console.log(`Found ${companies.length} companies:`, companies);
        setCompanySuggestions(companies);
        setShowCompanySuggestions(companies.length > 0);
      } catch (error) {
        console.error('Company search error:', error);
        setCompanySuggestions([]);
        setShowCompanySuggestions(false);
      }
    }, 300),
    []
  );

  // Simple debounce function
  function debounce<T extends (...args: any[]) => void>(func: T, delay: number): T {
    let timeoutId: NodeJS.Timeout;
    return ((...args: any[]) => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => func(...args), delay);
    }) as T;
  }

  const selectCompanySuggestion = (company: CompanyInfo) => {
    // Close suggestions immediately to prevent focus issues
    setShowCompanySuggestions(false);
    setCompanySuggestions([]);
    
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

  const handleLogoUploadComplete = (result: UploadResult<Record<string, unknown>, Record<string, unknown>>) => {
    if (result.successful && result.successful.length > 0) {
      const uploadURL = result.successful[0].uploadURL;
      if (uploadURL) {
        // Convert storage URL to local path
        const logoPath = `/objects/logos/${uploadURL.split('/').pop()}`;
        form.setValue('logoUrl', logoPath);
        setLogoPreview(logoPath);
        toast({ title: "Logo caricato con successo!" });
      }
    }
  };

  const createPartnerMutation = useMutation({
    mutationFn: async (data: FormData) => {
      const partnerData = {
        ...data,
        userId: user!.id,
        email: data.email || null,
        phone: data.phone || null,
        company: data.company || null,
        position: data.position || null,
        address: data.address || null,
        city: data.city || null,
        postalCode: data.postalCode || null,
        fiscalCode: data.fiscalCode || null,
        vatNumber: data.vatNumber || null,
        logoUrl: data.logoUrl || null,
        website: data.website || null,
        notes: data.notes || null,
      };
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
    createPartnerMutation.mutate(data);
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
                        <div className="relative">
                          <Input 
                            {...field}
                            placeholder="Inizia a digitare il nome dell'azienda..."
                            onChange={(e) => {
                              field.onChange(e);
                              handleCompanySearch(e.target.value);
                            }}
                            autoComplete="off"
                            data-testid="input-partner-name"
                          />
                          {showCompanySuggestions && (
                            <div className="absolute z-20 w-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg max-h-64 overflow-y-auto">
                              {companySuggestions.map((company, index) => (
                                <button
                                  key={index}
                                  type="button"
                                  className="w-full px-3 py-3 hover:bg-gray-50 cursor-pointer border-b border-gray-100 last:border-0 text-left"
                                  onMouseDown={(e) => {
                                    // Prevent default to avoid focus loss
                                    e.preventDefault();
                                    selectCompanySuggestion(company);
                                  }}
                                  data-testid={`company-suggestion-${index}`}
                                >
                                  <div className="flex items-center gap-3">
                                    {company.logoUrl && (
                                      <img 
                                        src={company.logoUrl} 
                                        alt={`${company.name} logo`}
                                        className="w-8 h-8 object-contain rounded"
                                      />
                                    )}
                                    <div className="flex-1 min-w-0">
                                      <div className="font-medium text-sm text-gray-900 truncate">
                                        {company.name}
                                      </div>
                                      {company.legalName && company.legalName !== company.name && (
                                        <div className="text-xs text-gray-500 truncate">
                                          {company.legalName}
                                        </div>
                                      )}
                                      {company.sector && (
                                        <div className="text-xs text-blue-600">
                                          {company.sector}
                                        </div>
                                      )}
                                      {company.city && (
                                        <div className="text-xs text-gray-500">
                                          📍 {company.city}
                                        </div>
                                      )}
                                    </div>
                                  </div>
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
                            placeholder="Nome commerciale dell'azienda"
                            onChange={(e) => {
                              field.onChange(e);
                              handleCompanySearch(e.target.value);
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
                          placeholder="Via Roma 123, Milano"
                          onChange={(e) => {
                            field.onChange(e);
                            handleAddressSearch(e.target.value);
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
                  {form.getValues('logoUrl') && (
                    <p className="text-xs text-gray-500">
                      Logo: {form.getValues('logoUrl').split('/').pop()}
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
    </div>
  );
}