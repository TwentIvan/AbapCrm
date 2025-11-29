import { useState, useCallback, useRef, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Search, MapPin, Building2, Loader2, CheckSquare } from "lucide-react";
import { cn } from "@/lib/utils";

export interface AddressResult {
  displayName: string;
  street: string;
  streetNumber: string;
  city: string;
  province: string;
  postalCode: string;
  country: string;
  latitude: number;
  longitude: number;
}

export interface SelectedAddress extends AddressResult {
  placeId: number;
  isLegalAddress: boolean;
}

interface AddressSearchProps {
  onSelect: (address: AddressResult, isLegalAddress: boolean) => void;
  onMultiSelect?: (addresses: SelectedAddress[]) => void;
  placeholder?: string;
  className?: string;
  showAddressTypeSelector?: boolean;
  defaultAddressType?: "legal" | "operational";
  enableMultiSelect?: boolean;
}

interface NominatimResult {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
  address: {
    road?: string;
    house_number?: string;
    city?: string;
    town?: string;
    village?: string;
    municipality?: string;
    county?: string;
    state?: string;
    postcode?: string;
    country?: string;
    country_code?: string;
  };
}

// Fuzzy search utilities
const normalizeQuery = (query: string): string => {
  // Remove accents
  let normalized = query.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  
  // Common Italian address abbreviations
  const abbreviations: Record<string, string> = {
    "v.": "via",
    "v ": "via ",
    "p.zza": "piazza",
    "p.za": "piazza",
    "pza": "piazza",
    "c.so": "corso",
    "l.go": "largo",
    "vic.": "vicolo",
    "str.": "strada",
    "s.s.": "strada statale",
    "sp": "strada provinciale",
    "ss": "strada statale",
  };
  
  // Apply abbreviations (case insensitive)
  Object.entries(abbreviations).forEach(([abbr, full]) => {
    normalized = normalized.replace(new RegExp(`\\b${abbr}\\b`, "gi"), full);
  });
  
  return normalized.trim();
};

const generateFuzzyVariants = (query: string): string[] => {
  const normalized = normalizeQuery(query);
  const variants = [query]; // Original query first
  
  if (normalized !== query) {
    variants.push(normalized);
  }
  
  // Try different format: "street number, city" -> "city, street number"
  const commaMatch = normalized.match(/^([^,]+),\s*(.+)$/);
  if (commaMatch) {
    variants.push(`${commaMatch[2].trim()}, ${commaMatch[1].trim()}`);
    variants.push(commaMatch[2].trim()); // Just second part
    variants.push(commaMatch[1].trim()); // Just first part
  }
  
  // Try street + city format for Italian addresses
  const streetCityMatch = normalized.match(/^(via|viale|corso|piazza|largo|vicolo)\s+(.+?)\s+(\d+[a-z]?)\s*,?\s*(.+)?$/i);
  if (streetCityMatch) {
    const streetType = streetCityMatch[1];
    const streetName = streetCityMatch[2];
    const number = streetCityMatch[3];
    const city = streetCityMatch[4] || "";
    
    // Try: "street number, city"
    if (city) {
      variants.push(`${streetType} ${streetName} ${number}, ${city}`);
      variants.push(`${city}, ${streetType} ${streetName} ${number}`);
      variants.push(`${streetType} ${streetName}, ${city}`);
    }
    // Try without number
    variants.push(`${streetType} ${streetName}`);
  }
  
  // Try without numbers at the end (in case street number is wrong)
  const withoutNumbers = normalized.replace(/\s*\d+[a-z]?\s*$/i, "").trim();
  if (withoutNumbers && withoutNumbers !== normalized) {
    variants.push(withoutNumbers);
  }
  
  // Try splitting by comma and searching just the first part (street name)
  const parts = normalized.split(",");
  if (parts.length > 1 && parts[0].trim().length >= 3) {
    variants.push(parts[0].trim());
  }
  
  return Array.from(new Set(variants)).slice(0, 6); // Max 6 variants
};

export function AddressSearch({
  onSelect,
  onMultiSelect,
  placeholder = "Cerca indirizzo...",
  className,
  showAddressTypeSelector = true,
  defaultAddressType = "legal",
  enableMultiSelect = false,
}: AddressSearchProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<NominatimResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [selectedAddressTypes, setSelectedAddressTypes] = useState<Record<number, "legal" | "operational">>({});
  const [selectedPlaceIds, setSelectedPlaceIds] = useState<Set<number>>(new Set());
  const [searchAttempts, setSearchAttempts] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<NodeJS.Timeout>();

  console.log("[AddressSearch] Mounted with props:", { enableMultiSelect, showAddressTypeSelector, defaultAddressType });
  console.log("[AddressSearch] State:", { query, resultsCount: results.length, isLoading, isOpen, selectedPlaceIds: Array.from(selectedPlaceIds) });

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const searchAddress = useCallback(async (searchQuery: string) => {
    console.log("[AddressSearch] searchAddress called with:", searchQuery);
    if (searchQuery.length < 3) {
      console.log("[AddressSearch] Query too short, clearing results");
      setResults([]);
      setSearchAttempts(0);
      return;
    }

    setIsLoading(true);
    console.log("[AddressSearch] Starting fuzzy search...");
    
    // Generate fuzzy variants of the query
    const variants = generateFuzzyVariants(searchQuery);
    console.log("[AddressSearch] Search variants:", variants);
    
    let allResults: NominatimResult[] = [];
    const seenPlaceIds = new Set<number>();
    
    try {
      // Try each variant until we get results or exhaust all options
      for (const variant of variants) {
        if (allResults.length >= 5) break; // Stop if we have enough results
        
        console.log("[AddressSearch] Trying variant:", variant);
        
        // First try with Italy country code
        const response = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&limit=5&q=${encodeURIComponent(variant)}&countrycodes=it`,
          {
            headers: {
              "Accept-Language": "it",
            },
          }
        );
        const data: NominatimResult[] = await response.json();
        console.log("[AddressSearch] Variant results:", data.length);
        
        // Add unique results
        for (const result of data) {
          if (!seenPlaceIds.has(result.place_id)) {
            seenPlaceIds.add(result.place_id);
            allResults.push(result);
          }
        }
        
        // If no results with Italy, try without country restriction
        if (data.length === 0 && variant === variants[0]) {
          console.log("[AddressSearch] No Italian results, trying without country restriction...");
          const fallbackResponse = await fetch(
            `https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&limit=5&q=${encodeURIComponent(variant)}`,
            {
              headers: {
                "Accept-Language": "it",
              },
            }
          );
          const fallbackData: NominatimResult[] = await fallbackResponse.json();
          for (const result of fallbackData) {
            if (!seenPlaceIds.has(result.place_id)) {
              seenPlaceIds.add(result.place_id);
              allResults.push(result);
            }
          }
        }
      }
      
      // Limit to 10 results max
      allResults = allResults.slice(0, 10);
      setSearchAttempts(variants.length);
      
      console.log("[AddressSearch] Final results:", allResults.length);
      setResults(allResults);
      setIsOpen(true);
      
      const initialTypes: Record<number, "legal" | "operational"> = {};
      allResults.forEach((result) => {
        initialTypes[result.place_id] = defaultAddressType;
      });
      setSelectedAddressTypes(initialTypes);
    } catch (error) {
      console.error("Error searching address:", error);
      setResults([]);
    } finally {
      setIsLoading(false);
    }
  }, [defaultAddressType]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setQuery(value);

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(() => {
      searchAddress(value);
    }, 300);
  };

  const parseResult = (result: NominatimResult): AddressResult => {
    const addr = result.address;
    const city = addr.city || addr.town || addr.village || addr.municipality || "";
    const province = addr.county || addr.state || "";
    
    let provinceCode = province;
    if (province.length > 2) {
      const italianProvinces: Record<string, string> = {
        "milano": "MI", "roma": "RM", "napoli": "NA", "torino": "TO",
        "palermo": "PA", "genova": "GE", "bologna": "BO", "firenze": "FI",
        "bari": "BA", "catania": "CT", "venezia": "VE", "verona": "VR",
        "messina": "ME", "padova": "PD", "trieste": "TS", "taranto": "TA",
        "brescia": "BS", "parma": "PR", "modena": "MO", "reggio calabria": "RC",
        "reggio emilia": "RE", "perugia": "PG", "livorno": "LI", "ravenna": "RA",
        "cagliari": "CA", "foggia": "FG", "rimini": "RN", "salerno": "SA",
        "ferrara": "FE", "sassari": "SS", "latina": "LT", "giugliano in campania": "NA",
        "monza": "MB", "siracusa": "SR", "pescara": "PE", "bergamo": "BG",
        "forlì": "FC", "trento": "TN", "vicenza": "VI", "terni": "TR",
        "bolzano": "BZ", "novara": "NO", "piacenza": "PC", "ancona": "AN",
        "andria": "BT", "arezzo": "AR", "udine": "UD", "cesena": "FC",
        "lecce": "LE", "pesaro": "PU", "barletta": "BT", "alessandria": "AL",
        "la spezia": "SP", "pisa": "PI", "catanzaro": "CZ", "brindisi": "BR",
        "lucca": "LU", "como": "CO", "treviso": "TV", "varese": "VA",
        "grosseto": "GR", "caserta": "CE", "asti": "AT", "ragusa": "RG",
        "pavia": "PV", "cremona": "CR", "trapani": "TP", "cosenza": "CS",
        "potenza": "PZ", "viterbo": "VT", "caltanissetta": "CL", "benevento": "BN",
        "avellino": "AV", "agrigento": "AG", "cuneo": "CN", "teramo": "TE",
        "olbia": "SS", "massa": "MS", "chieti": "CH", "mantova": "MN",
        "matera": "MT", "crotone": "KR", "enna": "EN", "vibo valentia": "VV",
        "lecco": "LC", "lodi": "LO", "sondrio": "SO", "pordenone": "PN",
        "gorizia": "GO", "nuoro": "NU", "oristano": "OR", "carbonia": "SU",
        "verbania": "VB", "biella": "BI", "vercelli": "VC", "isernia": "IS",
        "campobasso": "CB", "l'aquila": "AQ", "rieti": "RI", "frosinone": "FR",
        "siena": "SI", "pistoia": "PT", "prato": "PO", "rovigo": "RO",
        "belluno": "BL", "fermo": "FM", "ascoli piceno": "AP", "macerata": "MC",
        "south sardinia": "SU"
      };
      provinceCode = italianProvinces[province.toLowerCase()] || province.substring(0, 2).toUpperCase();
    }

    return {
      displayName: result.display_name,
      street: addr.road || "",
      streetNumber: addr.house_number || "",
      city,
      province: provinceCode,
      postalCode: addr.postcode || "",
      country: addr.country_code?.toUpperCase() || "IT",
      latitude: parseFloat(result.lat),
      longitude: parseFloat(result.lon),
    };
  };

  const handleSelect = (result: NominatimResult) => {
    console.log("[AddressSearch] handleSelect called for:", result.display_name);
    const addressType = selectedAddressTypes[result.place_id] || defaultAddressType;
    const parsed = parseResult(result);
    console.log("[AddressSearch] Parsed address:", parsed);
    console.log("[AddressSearch] Address type:", addressType);
    onSelect(parsed, addressType === "legal");
    setQuery(parsed.displayName);
    setIsOpen(false);
  };

  const handleAddressTypeChange = (placeId: number, value: "legal" | "operational") => {
    setSelectedAddressTypes((prev) => ({
      ...prev,
      [placeId]: value,
    }));
  };

  const handleCheckboxChange = (placeId: number, checked: boolean) => {
    setSelectedPlaceIds((prev) => {
      const newSet = new Set(prev);
      if (checked) {
        newSet.add(placeId);
      } else {
        newSet.delete(placeId);
      }
      return newSet;
    });
  };

  const handleMultiSelectConfirm = () => {
    if (!onMultiSelect || selectedPlaceIds.size === 0) return;
    
    const selectedAddresses: SelectedAddress[] = [];
    results.forEach((result) => {
      if (selectedPlaceIds.has(result.place_id)) {
        const parsed = parseResult(result);
        selectedAddresses.push({
          ...parsed,
          placeId: result.place_id,
          isLegalAddress: selectedAddressTypes[result.place_id] === "legal",
        });
      }
    });
    
    onMultiSelect(selectedAddresses);
    setSelectedPlaceIds(new Set());
    setIsOpen(false);
    setQuery("");
  };

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={query}
          onChange={handleInputChange}
          placeholder={placeholder}
          className="pl-10 pr-10"
          data-testid="input-address-search"
        />
        {isLoading && (
          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
        )}
      </div>

      {isOpen && results.length > 0 && (
        <div className="absolute z-50 mt-1 w-full bg-background border rounded-md shadow-lg max-h-[500px] overflow-auto">
          {enableMultiSelect && selectedPlaceIds.size > 0 && (
            <div className="sticky top-0 z-10 p-3 bg-primary/10 border-b flex items-center justify-between">
              <span className="text-sm font-medium">
                {selectedPlaceIds.size} {selectedPlaceIds.size === 1 ? 'indirizzo selezionato' : 'indirizzi selezionati'}
              </span>
              <Button
                size="sm"
                variant="default"
                onClick={handleMultiSelectConfirm}
                data-testid="button-create-selected-locations"
              >
                <CheckSquare className="h-4 w-4 mr-2" />
                Crea sedi selezionate
              </Button>
            </div>
          )}
          {results.map((result) => (
            <div
              key={result.place_id}
              className={cn(
                "border-b last:border-b-0",
                enableMultiSelect && selectedPlaceIds.has(result.place_id) && "bg-primary/5"
              )}
            >
              <div className="p-3 hover:bg-muted/50">
                <div className="flex items-start gap-2">
                  {enableMultiSelect && (
                    <div className="flex items-center pt-1" onClick={(e) => e.stopPropagation()}>
                      <Checkbox
                        id={`checkbox-${result.place_id}`}
                        checked={selectedPlaceIds.has(result.place_id)}
                        onCheckedChange={(checked) => handleCheckboxChange(result.place_id, checked === true)}
                        data-testid={`checkbox-address-${result.place_id}`}
                      />
                    </div>
                  )}
                  <MapPin className="h-4 w-4 mt-1 text-muted-foreground flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{result.display_name}</p>
                    <div className="flex flex-wrap gap-2 mt-1 text-xs text-muted-foreground">
                      {result.address.road && (
                        <span>{result.address.road} {result.address.house_number || ""}</span>
                      )}
                      {result.address.postcode && <span>• {result.address.postcode}</span>}
                      {(result.address.city || result.address.town || result.address.village) && (
                        <span>• {result.address.city || result.address.town || result.address.village}</span>
                      )}
                    </div>

                    {showAddressTypeSelector && (
                      <div className="mt-3 p-2 bg-muted/30 rounded">
                        <RadioGroup
                          value={selectedAddressTypes[result.place_id] || defaultAddressType}
                          onValueChange={(value) => handleAddressTypeChange(result.place_id, value as "legal" | "operational")}
                          className="flex gap-4"
                        >
                          <div className="flex items-center space-x-2">
                            <RadioGroupItem 
                              value="legal" 
                              id={`legal-${result.place_id}`}
                              data-testid={`radio-legal-${result.place_id}`}
                            />
                            <Label 
                              htmlFor={`legal-${result.place_id}`}
                              className="text-xs font-normal cursor-pointer flex items-center gap-1"
                            >
                              <Building2 className="h-3 w-3" />
                              Sede Legale
                            </Label>
                          </div>
                          <div className="flex items-center space-x-2">
                            <RadioGroupItem 
                              value="operational" 
                              id={`operational-${result.place_id}`}
                              data-testid={`radio-operational-${result.place_id}`}
                            />
                            <Label 
                              htmlFor={`operational-${result.place_id}`}
                              className="text-xs font-normal cursor-pointer flex items-center gap-1"
                            >
                              <MapPin className="h-3 w-3" />
                              Sede Operativa
                            </Label>
                          </div>
                        </RadioGroup>
                      </div>
                    )}

                    <Button
                      size="sm"
                      variant="default"
                      className="mt-2 w-full"
                      onClick={() => handleSelect(result)}
                      data-testid={`button-select-address-${result.place_id}`}
                    >
                      Seleziona questo indirizzo
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
