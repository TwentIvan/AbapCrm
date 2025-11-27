import { useState, useCallback, useRef, useEffect, lazy, Suspense } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { useOrganization } from "@/contexts/organization-context";
import { apiRequest, getQueryFn } from "@/lib/queryClient";
import { insertPartnerSchema, Partner, PartnerEmail, PartnerPhone } from "@shared/schema";
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
import ImageContainer from "@/components/ui/image-container";
import { Checkbox } from "@/components/ui/checkbox";
import { AddressSearch, AddressResult, SelectedAddress } from "@/components/ui/address-search";
import { Loader2, Upload, MapPin, Building2, Globe, CreditCard, FileText, Camera, Search, Map, Link, CheckSquare, Plus, Trash2, Star, Mail, Phone } from "lucide-react";
import { cn } from "@/lib/utils";
import type { UploadResult } from "@uppy/core";

const MapPicker = lazy(() => import("@/components/ui/map-picker").then(m => ({ default: m.MapPicker })));

// Extended schema with validation for Italian CF and VAT
const advancedPartnerSchema = insertPartnerSchema.extend({
  // Rendi tutti i campi opzionali tranne il nome
  email: z.string().optional(),
  phone: z.string().optional(),
  company: z.string().optional(),
  position: z.string().optional(),
  address: z.string().optional(),
  street: z.string().optional(),
  streetNumber: z.string().optional(),
  city: z.string().optional(),
  province: z.string().optional(),
  postalCode: z.string().optional(),
  country: z.string().optional(),
  latitude: z.string().optional(),
  longitude: z.string().optional(),
  isLegalAddress: z.boolean().optional(),
  parentPartnerId: z.string().optional().nullable(),
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
  street?: string;
  streetNumber?: string;
  city?: string;
  province?: string;
  postalCode?: string;
  country?: string;
  latitude?: string;
  longitude?: string;
  placeId?: string;
  fiscalCode?: string;
  vatNumber?: string;
  website?: string;
  logoUrl?: string;
  description?: string;
  sector?: string;
}

interface AdvancedPartnerFormProps {
  onSuccess?: () => void;
  existingPartner?: Partner;
  onEditLocation?: (location: Partner) => void;
}

export default function AdvancedPartnerForm({ onSuccess, existingPartner, onEditLocation }: AdvancedPartnerFormProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { currentOrganizationId } = useOrganization();
  
  const { data: allPartners } = useQuery<Partner[]>({
    queryKey: ['/api/partners'],
    queryFn: getQueryFn({ on401: "throw" }),
  });

  // Query for operative locations when editing existing partner
  const { data: operativeLocations } = useQuery<Partner[]>({
    queryKey: ['/api/partners', existingPartner?.id, 'locations'],
    queryFn: getQueryFn({ on401: "throw" }),
    enabled: !!existingPartner?.id && existingPartner?.isLegalAddress === true,
  });
  
  const [logoPreview, setLogoPreview] = useState<string>("");
  const [addressSuggestions, setAddressSuggestions] = useState<AddressSuggestion[]>([]);
  const [showAddressSuggestions, setShowAddressSuggestions] = useState(false);
  const [companySuggestions, setCompanySuggestions] = useState<CompanyInfo[]>([]);
  const [showCompanySuggestions, setShowCompanySuggestions] = useState(false);
  const [isSearchingCompany, setIsSearchingCompany] = useState(false);
  const [showSearchDialog, setShowSearchDialog] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCompanyIndices, setSelectedCompanyIndices] = useState<Set<number>>(new Set());
  const [legalHeadquartersIndex, setLegalHeadquartersIndex] = useState<number | null>(null);
  const [isCreatingMultiple, setIsCreatingMultiple] = useState(false);
  const [isValidatingFiscalCode, setIsValidatingFiscalCode] = useState(false);
  const [isValidatingVatNumber, setIsValidatingVatNumber] = useState(false);

  // Multiple emails and phones management
  const [partnerEmails, setPartnerEmails] = useState<PartnerEmail[]>([]);
  const [partnerPhones, setPartnerPhones] = useState<PartnerPhone[]>([]);
  const [newEmailValue, setNewEmailValue] = useState("");
  const [newEmailLabel, setNewEmailLabel] = useState("");
  const [newPhoneValue, setNewPhoneValue] = useState("");
  const [newPhoneLabel, setNewPhoneLabel] = useState("");

  // Queries for partner emails and phones when editing
  const { data: fetchedEmails } = useQuery<PartnerEmail[]>({
    queryKey: ['/api/partners', existingPartner?.id, 'emails'],
    queryFn: getQueryFn({ on401: "throw" }),
    enabled: !!existingPartner?.id,
  });

  const { data: fetchedPhones } = useQuery<PartnerPhone[]>({
    queryKey: ['/api/partners', existingPartner?.id, 'phones'],
    queryFn: getQueryFn({ on401: "throw" }),
    enabled: !!existingPartner?.id,
  });

  // Sync fetched emails and phones with local state
  useEffect(() => {
    if (fetchedEmails) setPartnerEmails(fetchedEmails);
  }, [fetchedEmails]);

  useEffect(() => {
    if (fetchedPhones) setPartnerPhones(fetchedPhones);
  }, [fetchedPhones]);

  const form = useForm<FormData>({
    resolver: zodResolver(advancedPartnerSchema),
    defaultValues: {
      name: existingPartner?.name || "",
      email: existingPartner?.email || "",
      phone: existingPartner?.phone || "",
      company: existingPartner?.company || "",
      position: existingPartner?.position || "",
      address: existingPartner?.address || "",
      street: existingPartner?.street || "",
      streetNumber: existingPartner?.streetNumber || "",
      city: existingPartner?.city || "",
      province: existingPartner?.province || "",
      postalCode: existingPartner?.postalCode || "",
      country: existingPartner?.country || "IT",
      latitude: existingPartner?.latitude || "",
      longitude: existingPartner?.longitude || "",
      isLegalAddress: existingPartner?.isLegalAddress ?? true,
      parentPartnerId: existingPartner?.parentPartnerId || null,
      fiscalCode: existingPartner?.fiscalCode || "",
      vatNumber: existingPartner?.vatNumber || "",
      logoUrl: existingPartner?.logoUrl || "",
      website: existingPartner?.website || "",
      type: existingPartner?.type || "client",
      notes: existingPartner?.notes || "",
    },
  });

  // Update logo preview when editing existing partner
  useEffect(() => {
    if (existingPartner?.logoUrl) {
      setLogoPreview(existingPartner.logoUrl);
    }
  }, [existingPartner]);

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

  const handleAddressSelect = (address: AddressResult, isLegalAddress: boolean) => {
    form.setValue('address', address.displayName);
    form.setValue('street', address.street);
    form.setValue('streetNumber', address.streetNumber);
    form.setValue('city', address.city);
    form.setValue('province', address.province);
    form.setValue('postalCode', address.postalCode);
    form.setValue('country', address.country);
    form.setValue('latitude', address.latitude.toString());
    form.setValue('longitude', address.longitude.toString());
    form.setValue('isLegalAddress', isLegalAddress);
  };

  const handleMultiAddressSelect = async (addresses: SelectedAddress[]) => {
    if (!currentOrganizationId || !user?.id) {
      toast({ title: "Errore: organizzazione o utente non valido", variant: "destructive" });
      return;
    }

    const currentFormData = form.getValues();
    let createdCount = 0;
    let parentId: string | null = null;

    for (const address of addresses) {
      try {
        const partnerData = {
          name: currentFormData.name || `Sede ${address.city || address.street}`,
          email: currentFormData.email || "",
          phone: currentFormData.phone || "",
          company: currentFormData.company || "",
          position: currentFormData.position || "",
          address: address.displayName,
          street: address.street,
          streetNumber: address.streetNumber,
          city: address.city,
          province: address.province,
          postalCode: address.postalCode,
          country: address.country,
          latitude: address.latitude.toString(),
          longitude: address.longitude.toString(),
          isLegalAddress: address.isLegalAddress,
          parentPartnerId: address.isLegalAddress ? null : parentId,
          fiscalCode: currentFormData.fiscalCode || "",
          vatNumber: currentFormData.vatNumber || "",
          logoUrl: currentFormData.logoUrl || "",
          website: currentFormData.website || "",
          notes: currentFormData.notes || "",
          userId: user.id,
          organizationId: currentOrganizationId,
        };

        const response = await apiRequest("POST", "/api/partners", partnerData);
        const newPartner = await response.json();
        createdCount++;

        if (address.isLegalAddress && newPartner?.id) {
          parentId = newPartner.id;
        }
      } catch (error) {
        console.error("Errore creazione sede:", error);
        toast({ 
          title: `Errore nella creazione della sede ${address.city || address.street}`, 
          variant: "destructive" 
        });
      }
    }

    if (createdCount > 0) {
      queryClient.invalidateQueries({ queryKey: ["/api/partners"] });
      toast({ 
        title: `${createdCount} ${createdCount === 1 ? 'sede creata' : 'sedi create'} con successo!`,
        description: parentId ? "La prima sede legale è stata impostata come sede principale" : undefined
      });
      onSuccess?.();
    }
  };

  const handleMapLocationChange = (lat: number, lng: number) => {
    form.setValue('latitude', lat.toString());
    form.setValue('longitude', lng.toString());
  };

  // Ref per mantenere l'ultimo valore di ricerca senza causare re-render
  const lastSearchValueRef = useRef<string>('');

  // Apri dialog di ricerca con pre-fill del nome esistente
  const openSearchDialog = () => {
    const currentName = form.getValues('name');
    setShowSearchDialog(true);
    setSearchQuery(currentName || "");
    setCompanySuggestions([]);
    setShowCompanySuggestions(false);
  };

  // Email management functions
  const addEmail = async () => {
    if (!newEmailValue) {
      toast({ title: "Inserisci un indirizzo email", variant: "destructive" });
      return;
    }
    if (!existingPartner?.id) {
      // For new partners, add to local state (will be saved with partner)
      const tempEmail: PartnerEmail = {
        id: `temp-${Date.now()}`,
        partnerId: '',
        value: newEmailValue,
        label: newEmailLabel || null,
        isPrimary: partnerEmails.length === 0,
        createdAt: new Date(),
      };
      setPartnerEmails([...partnerEmails, tempEmail]);
      setNewEmailValue("");
      setNewEmailLabel("");
      return;
    }
    try {
      await apiRequest("POST", `/api/partners/${existingPartner.id}/emails`, {
        value: newEmailValue,
        label: newEmailLabel || null,
        isPrimary: partnerEmails.length === 0,
      });
      queryClient.invalidateQueries({ queryKey: ['/api/partners', existingPartner.id, 'emails'] });
      queryClient.invalidateQueries({ queryKey: ['/api/partners'] });
      setNewEmailValue("");
      setNewEmailLabel("");
      toast({ title: "Email aggiunta" });
    } catch (error) {
      toast({ title: "Errore nell'aggiungere l'email", variant: "destructive" });
    }
  };

  const removeEmail = async (emailId: string) => {
    if (emailId.startsWith('temp-')) {
      setPartnerEmails(partnerEmails.filter(e => e.id !== emailId));
      return;
    }
    if (!existingPartner?.id) return;
    try {
      await apiRequest("DELETE", `/api/partners/${existingPartner.id}/emails/${emailId}`);
      queryClient.invalidateQueries({ queryKey: ['/api/partners', existingPartner.id, 'emails'] });
      queryClient.invalidateQueries({ queryKey: ['/api/partners'] });
      toast({ title: "Email rimossa" });
    } catch (error) {
      toast({ title: "Errore nella rimozione dell'email", variant: "destructive" });
    }
  };

  const setPrimaryEmail = async (emailId: string) => {
    if (emailId.startsWith('temp-')) {
      setPartnerEmails(partnerEmails.map(e => ({ ...e, isPrimary: e.id === emailId })));
      return;
    }
    if (!existingPartner?.id) return;
    try {
      await apiRequest("PUT", `/api/partners/${existingPartner.id}/emails/${emailId}/primary`);
      queryClient.invalidateQueries({ queryKey: ['/api/partners', existingPartner.id, 'emails'] });
      queryClient.invalidateQueries({ queryKey: ['/api/partners'] });
      toast({ title: "Email principale impostata" });
    } catch (error) {
      toast({ title: "Errore nell'impostare l'email principale", variant: "destructive" });
    }
  };

  // Phone management functions
  const addPhone = async () => {
    if (!newPhoneValue) {
      toast({ title: "Inserisci un numero di telefono", variant: "destructive" });
      return;
    }
    if (!existingPartner?.id) {
      const tempPhone: PartnerPhone = {
        id: `temp-${Date.now()}`,
        partnerId: '',
        value: newPhoneValue,
        label: newPhoneLabel || null,
        isPrimary: partnerPhones.length === 0,
        createdAt: new Date(),
      };
      setPartnerPhones([...partnerPhones, tempPhone]);
      setNewPhoneValue("");
      setNewPhoneLabel("");
      return;
    }
    try {
      await apiRequest("POST", `/api/partners/${existingPartner.id}/phones`, {
        value: newPhoneValue,
        label: newPhoneLabel || null,
        isPrimary: partnerPhones.length === 0,
      });
      queryClient.invalidateQueries({ queryKey: ['/api/partners', existingPartner.id, 'phones'] });
      queryClient.invalidateQueries({ queryKey: ['/api/partners'] });
      setNewPhoneValue("");
      setNewPhoneLabel("");
      toast({ title: "Telefono aggiunto" });
    } catch (error) {
      toast({ title: "Errore nell'aggiungere il telefono", variant: "destructive" });
    }
  };

  const removePhone = async (phoneId: string) => {
    if (phoneId.startsWith('temp-')) {
      setPartnerPhones(partnerPhones.filter(p => p.id !== phoneId));
      return;
    }
    if (!existingPartner?.id) return;
    try {
      await apiRequest("DELETE", `/api/partners/${existingPartner.id}/phones/${phoneId}`);
      queryClient.invalidateQueries({ queryKey: ['/api/partners', existingPartner.id, 'phones'] });
      queryClient.invalidateQueries({ queryKey: ['/api/partners'] });
      toast({ title: "Telefono rimosso" });
    } catch (error) {
      toast({ title: "Errore nella rimozione del telefono", variant: "destructive" });
    }
  };

  const setPrimaryPhone = async (phoneId: string) => {
    if (phoneId.startsWith('temp-')) {
      setPartnerPhones(partnerPhones.map(p => ({ ...p, isPrimary: p.id === phoneId })));
      return;
    }
    if (!existingPartner?.id) return;
    try {
      await apiRequest("PUT", `/api/partners/${existingPartner.id}/phones/${phoneId}/primary`);
      queryClient.invalidateQueries({ queryKey: ['/api/partners', existingPartner.id, 'phones'] });
      queryClient.invalidateQueries({ queryKey: ['/api/partners'] });
      toast({ title: "Telefono principale impostato" });
    } catch (error) {
      toast({ title: "Errore nell'impostare il telefono principale", variant: "destructive" });
    }
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
    // Reset selection when new search is performed
    setSelectedCompanyIndices(new Set());
    setLegalHeadquartersIndex(null);
    
    try {
      const response = await fetch(`/api/companies/search?q=${encodeURIComponent(searchQuery)}`);
      const companies = await response.json();
      
      setCompanySuggestions(companies);
      
      if (companies.length === 0) {
        toast({ 
          title: "Azienda non presente nel database", 
          description: "Puoi compilare i dati manualmente nel form" 
        });
      }
    } catch (error) {
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


  const selectCompanySuggestion = async (company: CompanyInfo) => {
    // First, auto-populate all company fields with Google Places data
    form.setValue('name', company.legalName || company.name);
    form.setValue('company', company.name);
    if (company.address) form.setValue('address', company.address);
    if (company.city) form.setValue('city', company.city);
    if (company.postalCode) form.setValue('postalCode', company.postalCode);
    if (company.country) form.setValue('country', company.country);
    if (company.fiscalCode) form.setValue('fiscalCode', company.fiscalCode);
    if (company.vatNumber) form.setValue('vatNumber', company.vatNumber.replace('IT', ''));
    if (company.website) form.setValue('website', company.website);
    
    // Set logo preview immediately if available
    if (company.logoUrl) {
      form.setValue('logoUrl', company.logoUrl);
      setLogoPreview(company.logoUrl);
    }
    
    // Close search dialog
    setShowSearchDialog(false);
    setCompanySuggestions([]);
    setSearchQuery("");
    
    // Try to enrich the data with Italian fiscal information
    try {
      const response = await fetch('/api/companies/enrich', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(company),
      });
      
      if (response.ok) {
        const enrichedData = await response.json();
        
        // Update fields with enriched data (fiscal codes and logo)
        if (enrichedData.fiscalCode && !company.fiscalCode) {
          form.setValue('fiscalCode', enrichedData.fiscalCode);
        }
        if (enrichedData.vatNumber && !company.vatNumber) {
          const cleanVatNumber = enrichedData.vatNumber.replace('IT', '');
          form.setValue('vatNumber', cleanVatNumber);
        }
        if (enrichedData.logoUrl && !company.logoUrl) {
          form.setValue('logoUrl', enrichedData.logoUrl);
          setLogoPreview(enrichedData.logoUrl);
        }
        
        // Show enhanced success message if fiscal data was found
        if (enrichedData.fiscalCode || enrichedData.vatNumber) {
          toast({ 
            title: "Dati azienda completati!", 
            description: `${company.name} - Codice Fiscale e P.IVA aggiunti automaticamente` 
          });
        } else {
          toast({ 
            title: "Informazioni azienda caricate!", 
            description: `Dati di ${company.name} inseriti automaticamente` 
          });
        }
      } else {
        // Fallback to original success message
        toast({ 
          title: "Informazioni azienda caricate!", 
          description: `Dati di ${company.name} inseriti automaticamente` 
        });
      }
    } catch (error) {
      // Still show success for the basic data that was loaded
      toast({ 
        title: "Informazioni azienda caricate!", 
        description: `Dati di ${company.name} inseriti automaticamente` 
      });
    }
  };

  // Toggle company selection for multi-select (as operative site)
  const toggleCompanySelection = (index: number) => {
    setSelectedCompanyIndices(prev => {
      const newSet = new Set(prev);
      if (newSet.has(index)) {
        newSet.delete(index);
        // If removing the legal headquarters, reset it
        if (legalHeadquartersIndex === index) {
          setLegalHeadquartersIndex(null);
        }
      } else {
        newSet.add(index);
        // If this is the first selection, set it as legal headquarters
        if (newSet.size === 1) {
          setLegalHeadquartersIndex(index);
        }
      }
      return newSet;
    });
  };

  // Set a company as the legal headquarters
  const setAsLegalHeadquarters = (index: number) => {
    // Add to selection if not already selected
    if (!selectedCompanyIndices.has(index)) {
      setSelectedCompanyIndices(prev => new Set(prev).add(index));
    }
    setLegalHeadquartersIndex(index);
  };

  // Select all companies
  const selectAllCompanies = () => {
    if (selectedCompanyIndices.size === companySuggestions.length) {
      setSelectedCompanyIndices(new Set());
      setLegalHeadquartersIndex(null);
    } else {
      setSelectedCompanyIndices(new Set(companySuggestions.map((_, i) => i)));
      // Set first as legal headquarters if not already set
      if (legalHeadquartersIndex === null && companySuggestions.length > 0) {
        setLegalHeadquartersIndex(0);
      }
    }
  };

  // Create multiple partners from selected companies
  const createMultiplePartners = async () => {
    if (!user?.id) {
      toast({ title: "Errore: utente non autenticato", variant: "destructive" });
      return;
    }

    // Validate legal headquarters is selected
    if (legalHeadquartersIndex === null) {
      toast({ title: "Seleziona una sede legale", variant: "destructive" });
      return;
    }

    // Get all selected companies with their indices
    const selectedWithIndices = Array.from(selectedCompanyIndices)
      .map(i => ({ index: i, company: companySuggestions[i] }))
      .filter((item): item is { index: number; company: CompanyInfo } => item.company !== undefined);
    
    if (selectedWithIndices.length === 0) {
      toast({ title: "Seleziona almeno un'azienda", variant: "destructive" });
      return;
    }

    // Separate legal headquarters from operative sites
    const legalHQ = selectedWithIndices.find(item => item.index === legalHeadquartersIndex);
    const operativeSites = selectedWithIndices.filter(item => item.index !== legalHeadquartersIndex);

    if (!legalHQ) {
      toast({ title: "Errore: sede legale non trovata", variant: "destructive" });
      return;
    }

    setIsCreatingMultiple(true);
    let createdCount = 0;
    let parentId: string | null = null;

    // Helper function to enrich and create partner
    const createPartner = async (company: CompanyInfo, isLegal: boolean, parentPartnerId: string | null) => {
      // Try to enrich the company data first
      let enrichedCompany = { ...company };
      try {
        const enrichResponse = await fetch('/api/companies/enrich', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(company),
        });
        if (enrichResponse.ok) {
          const enrichedData = await enrichResponse.json();
          enrichedCompany = { ...company, ...enrichedData };
        }
      } catch (e) {
        // Ignore enrichment errors
      }

      // Build full address string from structured fields if available
      const fullAddress = enrichedCompany.address || [
        enrichedCompany.street,
        enrichedCompany.streetNumber,
        enrichedCompany.city,
        enrichedCompany.postalCode
      ].filter(Boolean).join(', ') || null;

      // Use same field structure as savePartnerMutation with ALL structured fields
      const partnerData = {
        name: enrichedCompany.legalName || enrichedCompany.name,
        type: "client",
        userId: user.id,
        company: enrichedCompany.name || null,
        email: null,
        phone: null,
        position: null,
        address: fullAddress?.trim() || null,
        street: enrichedCompany.street?.trim() || null,
        streetNumber: enrichedCompany.streetNumber?.trim() || null,
        city: enrichedCompany.city?.trim() || null,
        province: enrichedCompany.province?.trim() || null,
        postalCode: enrichedCompany.postalCode?.trim() || null,
        country: enrichedCompany.country || "IT",
        latitude: enrichedCompany.latitude || null,
        longitude: enrichedCompany.longitude || null,
        isLegalAddress: isLegal,
        parentPartnerId: parentPartnerId,
        fiscalCode: enrichedCompany.fiscalCode?.trim() || null,
        vatNumber: enrichedCompany.vatNumber?.replace('IT', '')?.trim() || null,
        website: enrichedCompany.website?.trim() || null,
        logoUrl: enrichedCompany.logoUrl?.trim() || null,
        notes: null,
      };

      const response = await apiRequest("POST", "/api/partners", partnerData);
      return await response.json();
    };

    try {
      // 1. Create legal headquarters FIRST
      const legalPartner = await createPartner(legalHQ.company, true, null);
      parentId = legalPartner.id;
      createdCount++;

      // 2. Create operative sites with parentPartnerId
      for (const site of operativeSites) {
        try {
          await createPartner(site.company, false, parentId);
          createdCount++;
        } catch (error) {
          console.error('Error creating operative site:', error);
          toast({ 
            title: `Errore creazione sede operativa ${site.company.name}`, 
            variant: "destructive" 
          });
        }
      }
    } catch (error) {
      console.error('Error creating legal headquarters:', error);
      toast({ 
        title: `Errore creazione sede legale ${legalHQ.company.name}`, 
        variant: "destructive" 
      });
    }

    setIsCreatingMultiple(false);
    setShowSearchDialog(false);
    setSelectedCompanyIndices(new Set());
    setLegalHeadquartersIndex(null);
    setCompanySuggestions([]);
    setSearchQuery("");

    if (createdCount > 0) {
      queryClient.invalidateQueries({ queryKey: ["/api/partners"] });
      const operativeCount = createdCount - 1;
      toast({ 
        title: `${createdCount} ${createdCount === 1 ? 'partner creato' : 'partner creati'} con successo!`,
        description: operativeCount > 0 
          ? `1 sede legale + ${operativeCount} ${operativeCount === 1 ? 'sede operativa' : 'sedi operative'} collegate` 
          : undefined
      });
      onSuccess?.();
    }
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
      // Ignore validation errors silently
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
      // Ignore validation errors silently
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

  const savePartnerMutation = useMutation({
    mutationFn: async (data: FormData & { userId?: string }) => {
      const partnerData = {
        name: data.name,
        type: data.type,
        userId: data.userId || user!.id,
        email: data.email?.trim() || null,
        phone: data.phone?.trim() || null,
        company: data.company?.trim() || null,
        position: data.position?.trim() || null,
        address: data.address?.trim() || null,
        street: data.street?.trim() || null,
        streetNumber: data.streetNumber?.trim() || null,
        city: data.city?.trim() || null,
        province: data.province?.trim() || null,
        postalCode: data.postalCode?.trim() || null,
        country: data.country || "IT",
        latitude: data.latitude || null,
        longitude: data.longitude || null,
        isLegalAddress: data.isLegalAddress ?? true,
        parentPartnerId: data.parentPartnerId || null,
        fiscalCode: data.fiscalCode?.trim() || null,
        vatNumber: data.vatNumber?.trim() || null,
        logoUrl: data.logoUrl?.trim() || null,
        website: data.website?.trim() || null,
        notes: data.notes?.trim() || null,
      };
      
      if (existingPartner) {
        // Update existing partner
        const res = await apiRequest("PUT", `/api/partners/${existingPartner.id}`, partnerData);
        return res.json();
      } else {
        // Create new partner
        const res = await apiRequest("POST", "/api/partners", partnerData);
        return res.json();
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/partners"] });
      toast({ 
        title: existingPartner ? "Partner aggiornato con successo!" : "Partner creato con successo!" 
      });
      onSuccess?.();
    },
    onError: (error: Error) => {
      toast({
        title: existingPartner ? "Errore nell'aggiornamento del partner" : "Errore nella creazione del partner",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: FormData) => {
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
    savePartnerMutation.mutate(completeData);
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

              </div>

              {/* Logo field - prominently placed */}
              <div className="flex items-center gap-4 p-3 bg-muted/50 rounded-lg">
                {logoPreview ? (
                  <ImageContainer
                    src={logoPreview}
                    alt="Logo preview"
                    fallbackType="logo"
                    size="lg"
                    data-testid="img-logo-preview-inline"
                  />
                ) : (
                  <div className="w-12 h-12 rounded-lg bg-muted flex items-center justify-center">
                    <Camera className="h-6 w-6 text-muted-foreground" />
                  </div>
                )}
                <div className="flex-1">
                  <label className="text-sm font-medium mb-1 block">Logo Aziendale</label>
                  <ObjectUploader
                    maxNumberOfFiles={1}
                    maxFileSize={5242880}
                    onGetUploadParameters={handleGetLogoUploadParameters}
                    onComplete={handleLogoUploadComplete}
                    buttonClassName="w-full"
                  >
                    <Upload className="mr-2 h-4 w-4" />
                    {logoPreview ? 'Cambia Logo' : 'Carica Logo'}
                  </ObjectUploader>
                </div>
              </div>

              {/* Website and Domain fields */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="website"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Sito Web</FormLabel>
                      <FormControl>
                        <div className="flex gap-2">
                          <div className="relative flex-1">
                            <Globe className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                            <Input 
                              {...field}
                              value={field.value || ""}
                              placeholder="https://www.example.com"
                              className="pl-9"
                              data-testid="input-partner-website"
                            />
                          </div>
                          {field.value && (
                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              onClick={() => window.open(field.value!, '_blank')}
                              title="Apri sito web"
                            >
                              <Link className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Domain field - auto-calculated from website */}
                <FormItem>
                  <FormLabel>Dominio</FormLabel>
                  <FormControl>
                    <Input 
                      value={(() => {
                        const website = form.watch('website');
                        if (!website) return '';
                        try {
                          const url = new URL(website);
                          return url.hostname.replace('www.', '');
                        } catch {
                          return '';
                        }
                      })()}
                      placeholder="esempio.com"
                      readOnly
                      className="bg-muted"
                      data-testid="input-partner-domain"
                    />
                  </FormControl>
                  <p className="text-xs text-muted-foreground mt-1">Calcolato automaticamente dal sito web</p>
                </FormItem>
              </div>

              {/* Multiple emails section */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  <label className="text-sm font-medium">Email</label>
                  {partnerEmails.length > 0 && (
                    <Badge variant="secondary" className="text-xs">{partnerEmails.length}</Badge>
                  )}
                </div>
                
                {/* Existing emails list */}
                {partnerEmails.length > 0 && (
                  <div className="space-y-2">
                    {partnerEmails.map((email) => (
                      <div key={email.id} className="flex items-center gap-2 p-2 bg-muted/50 rounded-lg" data-testid={`email-item-${email.id}`}>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium truncate">{email.value}</span>
                            {email.isPrimary && (
                              <Badge variant="default" className="text-xs bg-yellow-500">Principale</Badge>
                            )}
                          </div>
                          {email.label && <span className="text-xs text-muted-foreground">{email.label}</span>}
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          {!email.isPrimary && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => setPrimaryEmail(email.id)}
                              title="Imposta come principale"
                              data-testid={`btn-primary-email-${email.id}`}
                            >
                              <Star className="h-4 w-4" />
                            </Button>
                          )}
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-destructive"
                            onClick={() => removeEmail(email.id)}
                            title="Rimuovi email"
                            data-testid={`btn-remove-email-${email.id}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                
                {/* Add new email */}
                <div className="flex items-center gap-2">
                  <Input
                    type="email"
                    value={newEmailValue}
                    onChange={(e) => setNewEmailValue(e.target.value)}
                    placeholder="Aggiungi email..."
                    className="flex-1"
                    data-testid="input-new-email"
                  />
                  <Input
                    value={newEmailLabel}
                    onChange={(e) => setNewEmailLabel(e.target.value)}
                    placeholder="Etichetta"
                    className="w-24"
                    data-testid="input-new-email-label"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={addEmail}
                    data-testid="btn-add-email"
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {/* Multiple phones section */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Phone className="h-4 w-4 text-muted-foreground" />
                  <label className="text-sm font-medium">Telefoni</label>
                  {partnerPhones.length > 0 && (
                    <Badge variant="secondary" className="text-xs">{partnerPhones.length}</Badge>
                  )}
                </div>
                
                {/* Existing phones list */}
                {partnerPhones.length > 0 && (
                  <div className="space-y-2">
                    {partnerPhones.map((phone) => (
                      <div key={phone.id} className="flex items-center gap-2 p-2 bg-muted/50 rounded-lg" data-testid={`phone-item-${phone.id}`}>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium truncate">{phone.value}</span>
                            {phone.isPrimary && (
                              <Badge variant="default" className="text-xs bg-yellow-500">Principale</Badge>
                            )}
                          </div>
                          {phone.label && <span className="text-xs text-muted-foreground">{phone.label}</span>}
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          {!phone.isPrimary && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => setPrimaryPhone(phone.id)}
                              title="Imposta come principale"
                              data-testid={`btn-primary-phone-${phone.id}`}
                            >
                              <Star className="h-4 w-4" />
                            </Button>
                          )}
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-destructive"
                            onClick={() => removePhone(phone.id)}
                            title="Rimuovi telefono"
                            data-testid={`btn-remove-phone-${phone.id}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                
                {/* Add new phone */}
                <div className="flex items-center gap-2">
                  <Input
                    value={newPhoneValue}
                    onChange={(e) => setNewPhoneValue(e.target.value)}
                    placeholder="Aggiungi telefono..."
                    className="flex-1"
                    data-testid="input-new-phone"
                  />
                  <Input
                    value={newPhoneLabel}
                    onChange={(e) => setNewPhoneLabel(e.target.value)}
                    placeholder="Etichetta"
                    className="w-24"
                    data-testid="input-new-phone-label"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={addPhone}
                    data-testid="btn-add-phone"
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {/* Legacy email/phone fields (hidden, for form compatibility) */}
              <div className="hidden">
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormControl>
                        <Input {...field} value={field.value || ""} />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="phone"
                  render={({ field }) => (
                    <FormItem>
                      <FormControl>
                        <Input {...field} value={field.value || ""} />
                      </FormControl>
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
              <div className="space-y-2">
                <label className="text-sm font-medium">Cerca Indirizzo</label>
                <p className="text-xs text-muted-foreground">
                  Seleziona uno o più indirizzi per creare le sedi. Usa i checkbox per selezione multipla.
                </p>
                <AddressSearch
                  onSelect={handleAddressSelect}
                  onMultiSelect={handleMultiAddressSelect}
                  placeholder="Cerca indirizzo (es. Via Roma 1, Milano)..."
                  showAddressTypeSelector={true}
                  defaultAddressType={form.watch('isLegalAddress') ? "legal" : "operational"}
                  enableMultiSelect={true}
                />
              </div>

              <Separator />

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="street"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Via/Piazza</FormLabel>
                      <FormControl>
                        <Input 
                          {...field}
                          value={field.value || ""} 
                          placeholder="Via Roma"
                          data-testid="input-partner-street"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="streetNumber"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Numero Civico</FormLabel>
                      <FormControl>
                        <Input 
                          {...field}
                          value={field.value || ""} 
                          placeholder="123"
                          data-testid="input-partner-street-number"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
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
                  name="province"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Provincia</FormLabel>
                      <FormControl>
                        <Input 
                          {...field}
                          value={field.value || ""} 
                          placeholder="MI"
                          data-testid="input-partner-province"
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

              <FormField
                control={form.control}
                name="isLegalAddress"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
                    <FormControl>
                      <Checkbox
                        checked={field.value ?? true}
                        onCheckedChange={field.onChange}
                        data-testid="checkbox-is-legal-address"
                      />
                    </FormControl>
                    <div className="space-y-1 leading-none">
                      <FormLabel className="flex items-center gap-2">
                        <Building2 className="h-4 w-4" />
                        Sede Legale
                      </FormLabel>
                      <p className="text-sm text-muted-foreground">
                        Spunta se questo è l'indirizzo della sede legale del partner
                      </p>
                    </div>
                  </FormItem>
                )}
              />

              {!form.watch('isLegalAddress') && (
                <FormField
                  control={form.control}
                  name="parentPartnerId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="flex items-center gap-2">
                        <Link className="h-4 w-4" />
                        Collega a Partner (Sede Legale)
                      </FormLabel>
                      <Select
                        value={field.value || ""}
                        onValueChange={field.onChange}
                      >
                        <FormControl>
                          <SelectTrigger data-testid="select-parent-partner">
                            <SelectValue placeholder="Seleziona la sede legale di riferimento..." />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {allPartners
                            ?.filter(p => (p.isLegalAddress === true || p.isLegalAddress === null || p.isLegalAddress === undefined) && p.id !== existingPartner?.id)
                            .map(partner => (
                              <SelectItem key={partner.id} value={partner.id}>
                                <div className="flex items-center gap-2">
                                  {partner.logoUrl ? (
                                    <img src={partner.logoUrl} alt="" className="w-4 h-4 rounded" />
                                  ) : (
                                    <Building2 className="w-4 h-4 text-muted-foreground" />
                                  )}
                                  <span>{partner.name}</span>
                                  {partner.city && <span className="text-muted-foreground text-xs">({partner.city})</span>}
                                </div>
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                      <p className="text-sm text-muted-foreground">
                        Questa sede operativa sarà collegata alla sede legale selezionata
                      </p>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              <div className="space-y-2">
                <label className="text-sm font-medium flex items-center gap-2">
                  <Map className="h-4 w-4" />
                  Posizione sulla Mappa
                </label>
                <Suspense fallback={<div className="h-64 bg-muted rounded-lg flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div>}>
                  <MapPicker
                    latitude={form.watch('latitude') ? parseFloat(form.watch('latitude') as string) : undefined}
                    longitude={form.watch('longitude') ? parseFloat(form.watch('longitude') as string) : undefined}
                    onLocationChange={handleMapLocationChange}
                    className="h-64"
                  />
                </Suspense>
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

          {/* Operative Locations Card - only visible when editing a legal headquarters */}
          {existingPartner?.id && existingPartner?.isLegalAddress && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MapPin className="h-5 w-5" />
                  Sedi Operative Collegate
                  {operativeLocations && operativeLocations.length > 0 && (
                    <Badge className="ml-2 bg-blue-100 text-blue-800">
                      {operativeLocations.length}
                    </Badge>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {!operativeLocations || operativeLocations.length === 0 ? (
                  <div className="text-center py-4 text-muted-foreground">
                    <MapPin className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">Nessuna sede operativa collegata</p>
                    <p className="text-xs mt-1">Le sedi operative vengono create dalla ricerca aziende multi-selezione</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {operativeLocations.map((location) => (
                      <div 
                        key={location.id}
                        className={cn(
                          "flex items-start gap-3 p-3 bg-blue-50 rounded-lg border border-blue-200 transition-all",
                          onEditLocation && "cursor-pointer hover:bg-blue-100 hover:border-blue-400 hover:shadow-sm"
                        )}
                        onClick={() => onEditLocation?.(location)}
                        data-testid={`location-${location.id}`}
                      >
                        <div className="w-3 h-3 rounded-full bg-blue-500 mt-1.5 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium truncate">{location.name}</span>
                            <Badge className="bg-blue-100 text-blue-800 text-xs shrink-0">
                              Sede Operativa
                            </Badge>
                            {onEditLocation && (
                              <Badge variant="outline" className="text-xs shrink-0 ml-auto">
                                Clicca per modificare
                              </Badge>
                            )}
                          </div>
                          {location.address && (
                            <p className="text-sm text-muted-foreground mt-1">
                              📍 {location.address}
                            </p>
                          )}
                          {(location.city || location.province) && (
                            <p className="text-xs text-muted-foreground">
                              {[location.city, location.province].filter(Boolean).join(', ')}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Submit Button */}
          <div className="flex justify-end">
            <Button
              type="submit"
              disabled={savePartnerMutation.isPending}
              className="w-full md:w-auto"
              data-testid="button-submit-partner"
            >
              {savePartnerMutation.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              {existingPartner ? "Aggiorna Partner" : "Crea Partner"}
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
              <div className="space-y-3">
                {/* Header con selezione multipla */}
                <div className="flex items-center justify-between px-2">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      checked={selectedCompanyIndices.size === companySuggestions.length && companySuggestions.length > 0}
                      onCheckedChange={selectAllCompanies}
                      data-testid="checkbox-select-all-companies"
                    />
                    <span className="text-sm font-medium">
                      Seleziona tutto ({selectedCompanyIndices.size}/{companySuggestions.length})
                    </span>
                  </div>
                  {selectedCompanyIndices.size > 0 && (
                    <Button
                      type="button"
                      onClick={createMultiplePartners}
                      disabled={isCreatingMultiple || legalHeadquartersIndex === null}
                      className="bg-green-600 hover:bg-green-700"
                      data-testid="button-create-multiple-partners"
                    >
                      {isCreatingMultiple ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <CheckSquare className="mr-2 h-4 w-4" />
                      )}
                      {legalHeadquartersIndex !== null ? (
                        selectedCompanyIndices.size === 1 
                          ? "Crea 1 sede legale" 
                          : `Crea 1 sede legale + ${selectedCompanyIndices.size - 1} ${selectedCompanyIndices.size - 1 === 1 ? 'operativa' : 'operative'}`
                      ) : (
                        "Seleziona sede legale"
                      )}
                    </Button>
                  )}
                </div>

                {/* Legenda selezione */}
                {selectedCompanyIndices.size > 0 && (
                  <div className="flex items-center gap-4 px-2 text-xs text-gray-500">
                    <span className="flex items-center gap-1">
                      <span className="w-3 h-3 rounded-full bg-green-500"></span>
                      Sede Legale (clicca radio per impostare)
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="w-3 h-3 rounded-full bg-blue-500"></span>
                      Sede Operativa
                    </span>
                  </div>
                )}

                {/* Lista risultati */}
                <div className="border border-gray-200 rounded-lg max-h-80 overflow-y-auto">
                  {companySuggestions.map((company, index) => {
                    const isSelected = selectedCompanyIndices.has(index);
                    const isLegalHQ = legalHeadquartersIndex === index;
                    
                    return (
                      <div
                        key={index}
                        className={cn(
                          "w-full px-4 py-4 text-left border-b border-gray-100 last:border-b-0 transition-colors",
                          isLegalHQ ? "bg-green-50 border-l-4 border-l-green-500" : 
                          isSelected ? "bg-blue-50 border-l-4 border-l-blue-500" : "hover:bg-gray-50"
                        )}
                      >
                        <div className="flex items-start gap-3">
                          {/* Controlli selezione */}
                          <div className="flex flex-col items-center gap-1 pt-1">
                            {/* Checkbox per selezione */}
                            <Checkbox
                              checked={isSelected}
                              onCheckedChange={() => toggleCompanySelection(index)}
                              data-testid={`checkbox-company-${index}`}
                            />
                            {/* Radio per sede legale (solo se selezionato) */}
                            {isSelected && (
                              <button
                                type="button"
                                onClick={() => setAsLegalHeadquarters(index)}
                                className={cn(
                                  "w-4 h-4 rounded-full border-2 flex items-center justify-center transition-colors",
                                  isLegalHQ 
                                    ? "border-green-600 bg-green-600" 
                                    : "border-gray-300 hover:border-green-400"
                                )}
                                title={isLegalHQ ? "Sede legale" : "Imposta come sede legale"}
                                data-testid={`radio-legal-${index}`}
                              >
                                {isLegalHQ && (
                                  <span className="w-2 h-2 rounded-full bg-white"></span>
                                )}
                              </button>
                            )}
                          </div>
                          
                          {/* Info azienda - cliccabile per selezione singola */}
                          <button
                            type="button"
                            className="flex-1 text-left"
                            onClick={() => selectCompanySuggestion(company)}
                            data-testid={`dialog-suggestion-${index}`}
                          >
                            <div className="flex justify-between items-start">
                              <div className="flex-1">
                                <div className="flex items-center gap-2 mb-1">
                                  <span className="font-medium text-base">{company.name}</span>
                                  {isLegalHQ && (
                                    <Badge className="bg-green-100 text-green-800 text-xs">
                                      Sede Legale
                                    </Badge>
                                  )}
                                  {isSelected && !isLegalHQ && (
                                    <Badge className="bg-blue-100 text-blue-800 text-xs">
                                      Sede Operativa
                                    </Badge>
                                  )}
                                </div>
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
                        </div>
                      </div>
                    );
                  })}
                </div>
                
                {/* Info selezione */}
                <p className="text-xs text-gray-500 text-center">
                  Seleziona le sedi con il checkbox, poi clicca il radio per indicare la sede legale principale. Clicca sul nome per popolare direttamente il form.
                </p>
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