// Company lookup service for businesses
// Supports multiple sources: Google Places API, Mock Database, Manual entry

export interface CompanyInfo {
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
  employees?: string;
  revenue?: string;
  founded?: number;
}

// Mock database of Italian companies - in production this would be replaced with real APIs
const MOCK_COMPANIES: CompanyInfo[] = [
  {
    name: "Hera S.p.A.",
    legalName: "Hera Società per Azioni", 
    address: "Viale Carlo Berti Pichat 2/4",
    city: "Bologna",
    postalCode: "40127",
    country: "IT",
    fiscalCode: "04245520376",
    vatNumber: "IT04245520376",
    website: "https://www.gruppohera.it",
    logoUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/8/8f/Hera_logo.svg/1200px-Hera_logo.svg.png",
    description: "Utility multiservizi nei settori ambiente, energia e idrico",
    sector: "Servizi pubblici",
    employees: "9,000+",
    founded: 2002
  },
  {
    name: "A2A S.p.A.",
    legalName: "A2A Società per Azioni",
    address: "Corso di Porta Vittoria 4", 
    city: "Milano",
    postalCode: "20122",
    country: "IT",
    fiscalCode: "11957540153",
    vatNumber: "IT11957540153",
    website: "https://www.a2a.eu",
    logoUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/b/bd/A2A_logo.svg/1200px-A2A_logo.svg.png",
    description: "Life Company leader nei servizi ambientali ed energetici",
    sector: "Servizi pubblici",
    employees: "13,000+",
    founded: 2008
  },
  {
    name: "IREN S.p.A.",
    legalName: "IREN Società per Azioni",
    address: "Via Nubi di Magellano 30",
    city: "Reggio Emilia", 
    postalCode: "42123",
    country: "IT",
    fiscalCode: "01916920365",
    vatNumber: "IT01916920365",
    website: "https://www.gruppoiren.it",
    logoUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/1/1a/IREN_logo.svg/1200px-IREN_logo.svg.png",
    description: "Multiutility leader nei settori energia, ambiente e reti",
    sector: "Servizi pubblici",
    employees: "8,500+",
    founded: 2010
  },
  {
    name: "Eni S.p.A.",
    legalName: "Eni Società per Azioni",
    address: "Piazzale Enrico Mattei 1",
    city: "San Donato Milanese",
    postalCode: "20097",
    country: "IT",
    fiscalCode: "00484960588",
    vatNumber: "IT00484960588",
    website: "https://www.eni.com",
    logoUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/0/06/Eni_logo.svg/2560px-Eni_logo.svg.png",
    description: "Società energetica multinazionale italiana",
    sector: "Energia e Petrolio",
    employees: "30,000+",
    founded: 1953
  },
  {
    name: "Enel S.p.A.",
    legalName: "Enel Società per Azioni",
    address: "Viale Regina Margherita 137",
    city: "Roma",
    postalCode: "00198",
    country: "IT",
    fiscalCode: "00811720580",
    vatNumber: "IT00811720580",
    website: "https://www.enel.com",
    logoUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/1/13/Enel_logo.svg/2560px-Enel_logo.svg.png",
    description: "Multinazionale dell'energia elettrica e del gas",
    sector: "Energia elettrica",
    employees: "66,000+",
    founded: 1962
  },
  {
    name: "Unicredit S.p.A.",
    legalName: "UniCredit Società per Azioni",
    address: "Piazza Gae Aulenti 3, Torre A",
    city: "Milano",
    postalCode: "20154",
    country: "IT",
    fiscalCode: "00348170101",
    vatNumber: "IT00348170101",
    website: "https://www.unicredit.it",
    logoUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/8/83/UniCredit_logo_%282016%29.svg/2560px-UniCredit_logo_%282016%29.svg.png",
    description: "Gruppo bancario europeo",
    sector: "Servizi finanziari",
    employees: "82,000+",
    founded: 1998
  },
  {
    name: "Intesa Sanpaolo",
    legalName: "Intesa Sanpaolo S.p.A.",
    address: "Piazza San Carlo 156",
    city: "Torino",
    postalCode: "10121",
    country: "IT",
    fiscalCode: "00799960158",
    vatNumber: "IT00799960158",
    website: "https://www.intesasanpaolo.com",
    logoUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/3/3b/Intesa_Sanpaolo_logo.svg/2560px-Intesa_Sanpaolo_logo.svg.png",
    description: "Gruppo bancario italiano",
    sector: "Servizi bancari",
    employees: "100,000+",
    founded: 2007
  },
  {
    name: "Poste Italiane",
    legalName: "Poste Italiane S.p.A.",
    address: "Viale Europa 190",
    city: "Roma",
    postalCode: "00144",
    country: "IT",
    fiscalCode: "97103880585",
    vatNumber: "IT01114601006",
    website: "https://www.posteitaliane.it",
    logoUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/b/b8/Poste_Italiane_logo.svg/2560px-Poste_Italiane_logo.svg.png",
    description: "Servizi postali e logistici",
    sector: "Servizi postali",
    employees: "120,000+",
    founded: 1862
  },
  {
    name: "Generali",
    legalName: "Assicurazioni Generali S.p.A.",
    address: "Piazza Duca degli Abruzzi 2",
    city: "Trieste",
    postalCode: "34132",
    country: "IT",
    fiscalCode: "00079760328",
    vatNumber: "IT00079760328",
    website: "https://www.generali.com",
    logoUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/6/69/Generali_logo.svg/2560px-Generali_logo.svg.png",
    description: "Compagnia di assicurazioni",
    sector: "Assicurazioni",
    employees: "72,000+",
    founded: 1831
  },
  {
    name: "Ferrari N.V.",
    legalName: "Ferrari N.V.",
    address: "Via Abetone Inferiore 4",
    city: "Maranello",
    postalCode: "41053",
    country: "IT",
    fiscalCode: "00446260364",
    vatNumber: "IT00446260364",
    website: "https://www.ferrari.com",
    logoUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/9/9c/Ferrari_logo.svg/2560px-Ferrari_logo.svg.png",
    description: "Costruttore di automobili di lusso",
    sector: "Automotive",
    employees: "5,000+",
    founded: 1947
  },
  {
    name: "Luxottica",
    legalName: "Luxottica Group S.p.A.",
    address: "Piazzale Luigi Cadorna 3",
    city: "Milano",
    postalCode: "20123",
    country: "IT",
    fiscalCode: "00891030272",
    vatNumber: "IT00891030272",
    website: "https://www.luxottica.com",
    logoUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/c/c2/Luxottica_logo.svg/2560px-Luxottica_logo.svg.png",
    description: "Azienda di occhiali e ottica",
    sector: "Ottica e Eyewear",
    employees: "80,000+",
    founded: 1961
  },
  {
    name: "Stellantis N.V.",
    legalName: "Stellantis N.V.",
    address: "Via Nizza 250",
    city: "Torino",
    postalCode: "10126",
    country: "IT",
    fiscalCode: "07973780013",
    vatNumber: "IT07973780013",
    website: "https://www.stellantis.com",
    logoUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/7/7e/Stellantis_Logo.svg/2560px-Stellantis_Logo.svg.png",
    description: "Multinazionale automobilistica (ex FCA)",
    sector: "Automotive",
    employees: "300,000+",
    founded: 2021
  },
  {
    name: "TIM S.p.A.",
    legalName: "Telecom Italia S.p.A.",
    address: "Via Gaetano Negri 1",
    city: "Milano",
    postalCode: "20123",
    country: "IT",
    fiscalCode: "00488410010",
    vatNumber: "IT00488410010",
    website: "https://www.tim.it",
    logoUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/3/37/TIM_logo_2016.svg/2560px-TIM_logo_2016.svg.png",
    description: "Principale operatore di telecomunicazioni in Italia",
    sector: "Telecomunicazioni",
    employees: "42,000+",
    founded: 1925
  },
  {
    name: "Pirelli & C. S.p.A.",
    legalName: "Pirelli & C. Società per Azioni",
    address: "Viale Piero e Alberto Pirelli 25",
    city: "Milano",
    postalCode: "20126",
    country: "IT",
    fiscalCode: "00860340157",
    vatNumber: "IT00860340157",
    website: "https://www.pirelli.com",
    logoUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/3/3c/Pirelli_logo.svg/2560px-Pirelli_logo.svg.png",
    description: "Produttore di pneumatici premium",
    sector: "Automotive Components",
    employees: "31,000+",
    founded: 1872
  },
  {
    name: "Leonardo S.p.A.",
    legalName: "Leonardo Società per Azioni",
    address: "Piazza Monte Grappa 4",
    city: "Roma",
    postalCode: "00195",
    country: "IT",
    fiscalCode: "80054410629",
    vatNumber: "IT80054410629",
    website: "https://www.leonardo.com",
    logoUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/3/39/Leonardo_S.p.A._logo.svg/2560px-Leonardo_S.p.A._logo.svg.png",
    description: "Gruppo industriale nei settori Difesa, Aerospazio e Sicurezza",
    sector: "Aerospace & Defence",
    employees: "51,000+",
    founded: 2016
  },
  {
    name: "Prysmian Group",
    legalName: "Prysmian S.p.A.",
    address: "Via Chiese 6",
    city: "Milano",
    postalCode: "20126",
    country: "IT",
    fiscalCode: "04866100963",
    vatNumber: "IT04866100963",
    website: "https://www.prysmiangroup.com",
    logoUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/e/ef/Prysmian_logo.svg/2560px-Prysmian_logo.svg.png",
    description: "Leader mondiale nei sistemi di cavi per energia e telecomunicazioni",
    sector: "Industrial Technology",
    employees: "29,000+",
    founded: 2005
  },
  {
    name: "Tenaris S.A.",
    legalName: "Tenaris Società per Azioni",
    address: "Via Giovanni Battista Pirelli 27",
    city: "Milano",
    postalCode: "20124",
    country: "IT",
    fiscalCode: "11905810968",
    vatNumber: "IT11905810968",
    website: "https://www.tenaris.com",
    logoUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/f/f8/Tenaris_logo.svg/2560px-Tenaris_logo.svg.png",
    description: "Produttore di tubi in acciaio per l'industria energetica",
    sector: "Energy Services",
    employees: "23,000+",
    founded: 2001
  },
  {
    name: "Mediaset S.p.A.",
    legalName: "Mediaset Società per Azioni",
    address: "Viale Europa 46",
    city: "Cologno Monzese",
    postalCode: "20093",
    country: "IT",
    fiscalCode: "01763650344",
    vatNumber: "IT01763650344",
    website: "https://www.mediaset.it",
    logoUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/1/19/Mediaset_logo.svg/2560px-Mediaset_logo.svg.png",
    description: "Gruppo televisivo e media italiano",
    sector: "Media & Entertainment",
    employees: "4,500+",
    founded: 1993
  },
  {
    name: "Atlantia S.p.A.",
    legalName: "Atlantia Società per Azioni",
    address: "Via Antonio Nibby 20",
    city: "Roma",
    postalCode: "00161",
    country: "IT",
    fiscalCode: "00892450153",
    vatNumber: "IT00892450153",
    website: "https://www.atlantia.com",
    logoUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/c/c9/Atlantia_logo.svg/2560px-Atlantia_logo.svg.png",
    description: "Società di gestione di infrastrutture autostradali e aeroportuali",
    sector: "Infrastructure",
    employees: "14,000+",
    founded: 1950
  },
  {
    name: "Campari Group",
    legalName: "Davide Campari-Milano N.V.",
    address: "Via Franco Sacchetti 20",
    city: "Sesto San Giovanni",
    postalCode: "20099",
    country: "IT",
    fiscalCode: "06672420158",
    vatNumber: "IT06672420158",
    website: "https://www.camparigroup.com",
    logoUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/8/8b/Campari_logo.svg/2560px-Campari_logo.svg.png",
    description: "Gruppo di bevande alcoliche premium",
    sector: "Food & Beverages",
    employees: "4,000+",
    founded: 1860
  },
  {
    name: "Derga Consulting Spa",
    legalName: "Derga Consulting Società per Azioni",
    address: "Via Gianni Brida 4",
    city: "Bolzano",
    postalCode: "39100",
    country: "IT",
    fiscalCode: "02345678901",
    vatNumber: "IT02345678901",
    website: "https://www.derga.it",
    logoUrl: "https://via.placeholder.com/200x100/2563eb/ffffff?text=DERGA",
    description: "Società di consulenza informatica e servizi digitali",
    sector: "IT Services",
    employees: "50-100",
    founded: 2010
  }
];

export class CompanyLookupService {
  
  /**
   * Search for companies by name using multiple sources
   */
  static async searchCompanies(query: string): Promise<CompanyInfo[]> {
    console.log(`[COMPANY-SEARCH] Searching for: "${query}"`);
    
    if (!query || query.length < 2) {
      console.log('[COMPANY-SEARCH] Query too short, returning empty array');
      return [];
    }

    const normalizedQuery = query.toLowerCase().trim();
    console.log(`[COMPANY-SEARCH] Normalized query: "${normalizedQuery}"`);
    
    // Try Google Places API first for comprehensive results
    try {
      const placesResults = await this.searchGooglePlaces(query);
      if (placesResults.length > 0) {
        console.log(`[COMPANY-SEARCH] Google Places found ${placesResults.length} results`);
        return placesResults;
      }
    } catch (error) {
      console.error('[COMPANY-SEARCH] Google Places API error:', error);
    }
    
    // Fallback to mock database for well-known Italian companies
    console.log(`[COMPANY-SEARCH] Falling back to mock database`);
    console.log(`[COMPANY-SEARCH] Available mock companies: ${MOCK_COMPANIES.length}`);
    
    const results = MOCK_COMPANIES.filter(company => {
      const nameMatch = company.name.toLowerCase().includes(normalizedQuery);
      const legalNameMatch = company.legalName?.toLowerCase().includes(normalizedQuery);
      const match = nameMatch || legalNameMatch;
      
      if (match) {
        console.log(`[COMPANY-SEARCH] Mock match found: ${company.name}`);
      }
      
      return match;
    });

    console.log(`[COMPANY-SEARCH] Found ${results.length} mock results`);

    // Sort by relevance (exact matches first, then partial)
    const sortedResults = results.sort((a, b) => {
      const aExact = a.name.toLowerCase().startsWith(normalizedQuery) ? 1 : 0;
      const bExact = b.name.toLowerCase().startsWith(normalizedQuery) ? 1 : 0;
      return bExact - aExact;
    }).slice(0, 10); // Limit to 10 results
    
    console.log(`[COMPANY-SEARCH] Returning ${sortedResults.length} sorted results`);
    return sortedResults;
  }

  /**
   * Search companies using Google Places API
   */
  private static async searchGooglePlaces(query: string): Promise<CompanyInfo[]> {
    const apiKey = process.env.GOOGLE_PLACES_API_KEY;
    if (!apiKey) {
      console.log('[GOOGLE-PLACES] API key not configured');
      return [];
    }

    // New Places API (Text Search)
    const apiUrl = 'https://places.googleapis.com/v1/places:searchText';
    
    // Try multiple search variations for better results
    const searchQueries = [
      `${query} Italia`,
      `${query} Italy`, 
      query,
      `${query} azienda`,
      `${query} spa srl`
    ];

    console.log(`[GOOGLE-PLACES] Starting NEW API search for: ${query}`);
    console.log(`[GOOGLE-PLACES] API Key present: ${apiKey ? 'YES' : 'NO'}`);  
    
    // Try each search query until we find results
    for (let i = 0; i < searchQueries.length; i++) {
      const searchQuery = searchQueries[i];
      console.log(`[GOOGLE-PLACES] NEW API Attempt ${i + 1}/5: "${searchQuery}"`);
      
      const requestBody = {
        textQuery: searchQuery,
        languageCode: 'it',
        regionCode: 'IT',
        maxResultCount: 10,
        // Removed includedType - not supported in new API
        locationBias: {
          rectangle: {
            low: { latitude: 36.0, longitude: 6.0 },  // Sud Italia
            high: { latitude: 47.0, longitude: 19.0 } // Nord Italia
          }
        }
      };

      console.log(`[GOOGLE-PLACES] NEW API URL: ${apiUrl}`);
      console.log(`[GOOGLE-PLACES] Request body:`, JSON.stringify(requestBody, null, 2));
    
      try {
        const response = await fetch(apiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Goog-Api-Key': apiKey,
            'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.websiteUri,places.nationalPhoneNumber,places.types,places.businessStatus'
          },
          body: JSON.stringify(requestBody)
        });
        
        console.log(`[GOOGLE-PLACES] NEW API HTTP Status: ${response.status} ${response.statusText}`);
        
        if (!response.ok) {
          console.log(`[GOOGLE-PLACES] NEW API HTTP Error: ${response.status} ${response.statusText}`);
          const errorText = await response.text();
          console.log(`[GOOGLE-PLACES] Error response:`, errorText);
          if (i === searchQueries.length - 1) {
            throw new Error(`Google Places NEW API error: ${response.status} ${response.statusText}`);
          }
          continue; // Try next query
        }

        const data = await response.json();
        console.log(`[GOOGLE-PLACES] NEW API Response:`, JSON.stringify(data, null, 2));
        console.log(`[GOOGLE-PLACES] Results count: ${data.places?.length || 0}`);
        
        if (data.places && data.places.length > 0) {
          console.log(`[GOOGLE-PLACES] SUCCESS! Found ${data.places.length} results for "${searchQuery}"`);
          console.log(`[GOOGLE-PLACES] First result: ${data.places[0].displayName?.text}`);
          
          // Transform NEW API results to our format
          const results = data.places.slice(0, 10).map((place: any) => ({
            name: place.displayName?.text || 'Nome non disponibile',
            legalName: place.displayName?.text || 'Nome non disponibile',
            address: place.formattedAddress || '',
            city: this.extractCityFromAddress(place.formattedAddress || ''),
            postalCode: this.extractPostalCodeFromAddress(place.formattedAddress || ''),
            country: this.extractCountryFromAddress(place.formattedAddress || ''),
            website: place.websiteUri,
            description: this.generateBusinessDescription(place),
            sector: this.extractSectorFromTypes(place.types || []),
            // Note: Google Places doesn't provide fiscal codes or VAT numbers
          } as CompanyInfo));
          
          return results;
        } else {
          console.log(`[GOOGLE-PLACES] No results for "${searchQuery}"`);
        }
        
      } catch (error) {
        console.log(`[GOOGLE-PLACES] NEW API Fetch error for "${searchQuery}":`, error);
        if (i === searchQueries.length - 1) {
          throw error;
        }
      }
    }
    
    console.log(`[GOOGLE-PLACES] No results found for any search variation`);
    return [];

  }

  /**
   * Get detailed information for a Google Place
   */
  private static async getPlaceDetails(placeId: string, apiKey: string): Promise<any> {
    try {
      const detailsUrl = 'https://maps.googleapis.com/maps/api/place/details/json';
      const params = new URLSearchParams({
        place_id: placeId,
        key: apiKey,
        fields: 'website,international_phone_number,formatted_phone_number,business_status'
      });

      const response = await fetch(`${detailsUrl}?${params}`);
      if (response.ok) {
        const data = await response.json();
        return data.result;
      }
    } catch (error) {
      console.error('[GOOGLE-PLACES] Error getting place details:', error);
    }
    return null;
  }

  /**
   * Extract city from formatted address
   */
  private static extractCityFromAddress(address: string): string | undefined {
    if (!address) return undefined;
    // Look for Italian city patterns
    const match = address.match(/,\s*([^,]+),\s*\d{5}/);
    return match ? match[1].trim() : undefined;
  }

  /**
   * Extract postal code from formatted address
   */
  private static extractPostalCodeFromAddress(address: string): string | undefined {
    if (!address) return undefined;
    const match = address.match(/\b(\d{5})\b/);
    return match ? match[1] : undefined;
  }

  /**
   * Extract country from formatted address
   */
  private static extractCountryFromAddress(address: string): string {
    if (!address) return 'IT';
    if (address.includes('Italy') || address.includes('Italia')) return 'IT';
    // Default to Italy for now
    return 'IT';
  }

  /**
   * Generate business description from place types
   */
  private static generateBusinessDescription(place: any): string {
    const types = place.types || [];
    const businessTypes = types.filter((type: string) => 
      !['establishment', 'point_of_interest'].includes(type)
    );
    
    if (businessTypes.length > 0) {
      const mainType = businessTypes[0].replace(/_/g, ' ');
      return `${mainType.charAt(0).toUpperCase() + mainType.slice(1)} business`;
    }
    
    return 'Business establishment';
  }

  /**
   * Extract sector from Google Places types
   */
  private static extractSectorFromTypes(types: string[]): string | undefined {
    if (!types) return undefined;
    
    const sectorMap: { [key: string]: string } = {
      'restaurant': 'Food & Beverage',
      'store': 'Retail',
      'bank': 'Financial Services',
      'hospital': 'Healthcare',
      'school': 'Education',
      'lawyer': 'Legal Services',
      'accounting': 'Professional Services',
      'real_estate_agency': 'Real Estate',
      'car_dealer': 'Automotive',
      'gym': 'Fitness & Wellness',
      'beauty_salon': 'Beauty & Personal Care',
      'lodging': 'Hospitality',
      'gas_station': 'Energy & Fuel'
    };
    
    for (const type of types) {
      if (sectorMap[type]) {
        return sectorMap[type];
      }
    }
    
    return undefined;
  }

  /**
   * Get detailed company information by exact name or fiscal code
   */
  static async getCompanyDetails(identifier: string): Promise<CompanyInfo | null> {
    const normalizedId = identifier.toLowerCase().trim();
    
    try {
      // First try to get details from OpenCorporates
      const openCorpResult = await this.getOpenCorporatesDetails(identifier);
      if (openCorpResult) {
        return openCorpResult;
      }
    } catch (error) {
      console.error('[COMPANY-DETAILS] OpenCorporates API error:', error);
    }
    
    // Fallback to mock database
    return MOCK_COMPANIES.find(company => 
      company.name.toLowerCase() === normalizedId ||
      company.legalName?.toLowerCase() === normalizedId ||
      company.fiscalCode === identifier ||
      company.vatNumber === identifier
    ) || null;
  }

  /**
   * Get company details from OpenCorporates by company number or name
   */
  private static async getOpenCorporatesDetails(identifier: string): Promise<CompanyInfo | null> {
    // Try direct company lookup first (if identifier looks like a company number)
    if (/^[0-9]{11}$/.test(identifier)) {
      try {
        const apiUrl = `https://api.opencorporates.com/v0.4/companies/it/${identifier}`;
        const response = await fetch(apiUrl, {
          headers: {
            'User-Agent': 'ReplicCRM/1.0 (Business CRM Application)',
            'Accept': 'application/json'
          }
        });

        if (response.ok) {
          const data = await response.json();
          if (data.results && data.results.company) {
            const company = data.results.company;
            return {
              name: company.name,
              legalName: company.name,
              address: company.registered_address?.street_address,
              city: company.registered_address?.locality,
              postalCode: company.registered_address?.postal_code,
              country: 'IT',
              fiscalCode: company.company_number,
              vatNumber: `IT${company.company_number}`,
              website: company.home_page_url,
              description: `${company.company_type || 'Azienda'} registrata in ${company.jurisdiction_code?.toUpperCase()}`,
              sector: company.company_type,
            } as CompanyInfo;
          }
        }
      } catch (error) {
        console.error('[OPENCORPORATES-DETAILS] Direct lookup error:', error);
      }
    }
    
    // If direct lookup fails, try Google Places search
    const searchResults = await this.searchGooglePlaces(identifier);
    return searchResults.length > 0 ? searchResults[0] : null;
  }

  /**
   * Validate and enrich company data using multiple sources
   */
  static async validateAndEnrichCompany(partialData: Partial<CompanyInfo>): Promise<CompanyInfo | null> {
    // In production, this would:
    // 1. Validate fiscal code/VAT with official APIs
    // 2. Cross-reference with multiple databases
    // 3. Fetch latest logo from company website or logo APIs
    // 4. Verify address with postal services
    
    if (partialData.name) {
      const results = await this.searchCompanies(partialData.name);
      return results[0] || null;
    }
    
    if (partialData.fiscalCode || partialData.vatNumber) {
      const identifier = partialData.fiscalCode || partialData.vatNumber!;
      return await this.getCompanyDetails(identifier);
    }
    
    return null;
  }

  /**
   * Enrich Google Places result with Italian fiscal data from local database and web search
   */
  static async enrichWithItalianFiscalData(companyData: CompanyInfo): Promise<CompanyInfo> {
    console.log(`[ENRICH-FISCAL] Trying to enrich data for: ${companyData.name}`);
    
    if (!companyData.name) {
      return companyData;
    }

    const normalizedName = companyData.name.toLowerCase().trim();
    
    // First try to find matching company in our local database
    const fiscalMatch = MOCK_COMPANIES.find(company => {
      const companyName = company.name.toLowerCase();
      const companyLegalName = company.legalName?.toLowerCase() || '';
      
      // Try various matching strategies
      const exactMatch = companyName === normalizedName || companyLegalName === normalizedName;
      const partialMatch = companyName.includes(normalizedName) || normalizedName.includes(companyName);
      const wordMatch = this.containsSignificantWords(normalizedName, companyName);
      
      return exactMatch || partialMatch || wordMatch;
    });

    if (fiscalMatch) {
      console.log(`[ENRICH-FISCAL] Found local match: ${fiscalMatch.name}`);
      console.log(`[ENRICH-FISCAL] CF: ${fiscalMatch.fiscalCode}, P.IVA: ${fiscalMatch.vatNumber}`);
      
      // Merge the fiscal data and logo
      return {
        ...companyData,
        fiscalCode: fiscalMatch.fiscalCode,
        vatNumber: fiscalMatch.vatNumber,
        logoUrl: fiscalMatch.logoUrl,
        sector: fiscalMatch.sector || companyData.sector,
        description: fiscalMatch.description || companyData.description
      };
    }

    // If no local match found, try web search for fiscal data and logo
    console.log(`[ENRICH-FISCAL] No local match found, trying web search for: ${companyData.name}`);
    
    try {
      const webEnrichedData = await this.searchCompanyDataOnWeb(companyData);
      if (webEnrichedData.fiscalCode || webEnrichedData.vatNumber || webEnrichedData.logoUrl) {
        console.log(`[ENRICH-FISCAL] Web search successful for: ${companyData.name}`);
        return webEnrichedData;
      }
    } catch (error) {
      console.error(`[ENRICH-FISCAL] Web search failed for ${companyData.name}:`, error);
    }

    console.log(`[ENRICH-FISCAL] No enrichment found for: ${companyData.name}`);
    return companyData;
  }

  /**
   * Search the web for company fiscal data and logo
   */
  private static async searchCompanyDataOnWeb(companyData: CompanyInfo): Promise<CompanyInfo> {
    let enrichedData = { ...companyData };

    try {
      // First, try to extract data from the company's official website if we have it
      if (companyData.website) {
        console.log(`[WEB-SEARCH] Extracting data from official website: ${companyData.website}`);
        
        try {
          const websiteData = await this.extractDataFromWebsite(companyData.website);
          console.log(`[WEB-SEARCH] Website extraction result:`, websiteData);
          
          if (websiteData.fiscalCode) {
            enrichedData.fiscalCode = websiteData.fiscalCode;
            console.log(`[WEB-SEARCH] Found CF from website: ${websiteData.fiscalCode}`);
          }
          if (websiteData.vatNumber) {
            enrichedData.vatNumber = websiteData.vatNumber;
            console.log(`[WEB-SEARCH] Found P.IVA from website: ${websiteData.vatNumber}`);
          }
          if (websiteData.logoUrl) {
            enrichedData.logoUrl = websiteData.logoUrl;
            console.log(`[WEB-SEARCH] Found logo from website: ${websiteData.logoUrl}`);
          }
          
          // If we found all the data we need, return early
          if (enrichedData.fiscalCode && enrichedData.vatNumber && enrichedData.logoUrl) {
            console.log(`[WEB-SEARCH] Complete data found from website!`);
            return enrichedData;
          }
        } catch (error) {
          console.error(`[WEB-SEARCH] Error extracting from website ${companyData.website}:`, error);
        }
      } else {
        console.log(`[WEB-SEARCH] No website URL available for: ${companyData.name}`);
      }

      // If we still need fiscal data, search for it specifically
      if (!enrichedData.fiscalCode || !enrichedData.vatNumber) {
        console.log(`[WEB-SEARCH] Searching for fiscal data for: ${companyData.name}`);
        
        const fiscalData = await this.searchFiscalDataOnWeb(companyData.name);
        if (fiscalData.fiscalCode && !enrichedData.fiscalCode) {
          enrichedData.fiscalCode = fiscalData.fiscalCode;
        }
        if (fiscalData.vatNumber && !enrichedData.vatNumber) {
          enrichedData.vatNumber = fiscalData.vatNumber;
        }
      }

      // If we still need logo, search for it
      if (!enrichedData.logoUrl) {
        console.log(`[WEB-SEARCH] Searching for logo for: ${companyData.name}`);
        
        const logoUrl = await this.searchLogoOnWeb(companyData.name, companyData.website);
        if (logoUrl) {
          enrichedData.logoUrl = logoUrl;
        }
      }

    } catch (error) {
      console.error(`[WEB-SEARCH] Error during web search for ${companyData.name}:`, error);
    }

    return enrichedData;
  }

  /**
   * Search for fiscal data using web search
   */
  private static async searchFiscalDataOnWeb(companyName: string): Promise<{ fiscalCode?: string; vatNumber?: string }> {
    try {
      const queries = [
        `${companyName} codice fiscale partita iva`,
        `${companyName} CF P.IVA sito ufficiale`,
        `"${companyName}" registro imprese camera commercio`
      ];
      
      for (const query of queries) {
        console.log(`[FISCAL-SEARCH] Searching web for: ${query}`);
        
        try {
          // Use web search to find fiscal information
          const searchResults = await this.performWebSearch(query);
          if (searchResults.length > 0) {
            // Try to extract fiscal data from search results
            const fiscalData = await this.extractFiscalDataFromSearchResults(searchResults);
            if (fiscalData.fiscalCode || fiscalData.vatNumber) {
              console.log(`[FISCAL-SEARCH] Found fiscal data via web search`);
              return fiscalData;
            }
          }
        } catch (error) {
          console.log(`[FISCAL-SEARCH] Error with query "${query}":`, error);
          continue; // Try next query
        }
      }
      
      return {};
      
    } catch (error) {
      console.error(`[FISCAL-SEARCH] Error searching fiscal data:`, error);
      return {};
    }
  }

  /**
   * Perform web search (placeholder for actual web search implementation)
   */
  private static async performWebSearch(query: string): Promise<any[]> {
    // In a real implementation, this would use web_search tool
    // For now, return empty array
    console.log(`[WEB-SEARCH] Would search for: ${query}`);
    return [];
  }

  /**
   * Extract fiscal data from web search results
   */
  private static async extractFiscalDataFromSearchResults(results: any[]): Promise<{ fiscalCode?: string; vatNumber?: string }> {
    const fiscalData: { fiscalCode?: string; vatNumber?: string } = {};
    
    for (const result of results) {
      if (result.url) {
        try {
          // Extract data from each result URL
          const extractedData = await this.extractDataFromWebsite(result.url);
          if (extractedData.fiscalCode && !fiscalData.fiscalCode) {
            fiscalData.fiscalCode = extractedData.fiscalCode;
          }
          if (extractedData.vatNumber && !fiscalData.vatNumber) {
            fiscalData.vatNumber = extractedData.vatNumber;
          }
          
          // If we found both, return early
          if (fiscalData.fiscalCode && fiscalData.vatNumber) {
            break;
          }
        } catch (error) {
          console.error(`[FISCAL-EXTRACT] Error extracting from ${result.url}:`, error);
          continue;
        }
      }
    }
    
    return fiscalData;
  }

  /**
   * Search for company logo using web search
   */
  private static async searchLogoOnWeb(companyName: string, websiteUrl?: string): Promise<string | null> {
    try {
      if (websiteUrl) {
        // Try to extract logo from the company website
        return await this.extractLogoFromWebsite(websiteUrl);
      }
      
      // Search for logo using web search
      const query = `${companyName} logo ufficiale`;
      console.log(`[LOGO-SEARCH] Searching web for: ${query}`);
      
      // Note: In a real implementation, you would use web_search tool here
      // and then extract logo URLs from image search results
      
      return null;
      
    } catch (error) {
      console.error(`[LOGO-SEARCH] Error searching logo:`, error);
      return null;
    }
  }

  /**
   * Extract all data from a company website
   */
  private static async extractDataFromWebsite(websiteUrl: string): Promise<{ fiscalCode?: string; vatNumber?: string; logoUrl?: string }> {
    try {
      console.log(`[WEBSITE-EXTRACT] Extracting data from: ${websiteUrl}`);
      
      // Use native fetch to get HTML content
      const response = await fetch(websiteUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        },
        signal: AbortSignal.timeout(10000) // 10 second timeout
      });
      
      if (!response.ok) {
        console.log(`[WEBSITE-EXTRACT] HTTP ${response.status} for ${websiteUrl}`);
        return {};
      }
      
      const html = await response.text();
      console.log(`[WEBSITE-EXTRACT] Downloaded ${html.length} characters from ${websiteUrl}`);
      
      const result: { fiscalCode?: string; vatNumber?: string; logoUrl?: string } = {};
      
      // Extract fiscal code using regex patterns
      const fiscalCodePatterns = [
        // 16-character personal fiscal code: RSSMRA80A01H501Z
        /\b[A-Z]{6}\d{2}[A-Z]\d{2}[A-Z]\d{3}[A-Z]\b/g,
        // 11-digit company fiscal code
        /(?:codice\s+fiscale|c\.?\s*f\.?|cf)[\s\:]*(\d{11})\b/gi,
        /\bC\.F\.?\s*(\d{11})\b/gi,
        /\bCF\s*(\d{11})\b/gi
      ];
      
      for (const pattern of fiscalCodePatterns) {
        const matches = html.match(pattern);
        if (matches && matches.length > 0) {
          const fiscalCode = matches[0].replace(/[^\dA-Z]/gi, '');
          if (fiscalCode.length === 11 || fiscalCode.length === 16) {
            result.fiscalCode = fiscalCode;
            console.log(`[WEBSITE-EXTRACT] Found CF: ${fiscalCode}`);
            break;
          }
        }
      }
      
      // Extract VAT number using regex patterns
      const vatPatterns = [
        /(?:partita\s+iva|p\.?\s*iva|p\.?\s*i\.?|vat)[\s\:]*(?:IT)?(\d{11})\b/gi,
        /\bP\.IVA\s*(?:IT)?(\d{11})\b/gi,
        /\bP\.I\.\s*(?:IT)?(\d{11})\b/gi,
        /\bVAT\s*(?:IT)?(\d{11})\b/gi,
        /\bIT(\d{11})\b/gi
      ];
      
      for (const pattern of vatPatterns) {
        const match = pattern.exec(html);
        if (match && match[1]) {
          const vatNumber = match[1]; // Get the captured group
          if (vatNumber && vatNumber.length === 11) {
            result.vatNumber = vatNumber;
            console.log(`[WEBSITE-EXTRACT] Found P.IVA: ${vatNumber}`);
            break;
          }
        }
      }
      
      // Extract logo URL
      const logoUrl = this.extractLogoFromHTML(html, websiteUrl);
      if (logoUrl) {
        result.logoUrl = logoUrl;
        console.log(`[WEBSITE-EXTRACT] Found logo: ${logoUrl}`);
      }
      
      return result;
      
    } catch (error) {
      console.error(`[WEBSITE-EXTRACT] Error extracting from ${websiteUrl}:`, error);
      return {};
    }
  }

  /**
   * Extract logo URL from HTML content
   */
  private static extractLogoFromHTML(html: string, baseUrl: string): string | null {
    try {
      // Look for common logo patterns in HTML
      const logoPatterns = [
        // Meta tags
        /<meta[^>]+property=['"]og:image['"][^>]+content=['"]([^'"]+)/gi,
        /<meta[^>]+name=['"]twitter:image['"][^>]+content=['"]([^'"]+)/gi,
        /<link[^>]+rel=['"]icon['"][^>]+href=['"]([^'"]+)/gi,
        /<link[^>]+rel=['"]apple-touch-icon['"][^>]+href=['"]([^'"]+)/gi,
        // Common logo selectors
        /<img[^>]+(?:class|id)=['"][^'"]*logo[^'"]*['"][^>]+src=['"]([^'"]+)/gi,
        /<img[^>]+src=['"]([^'"]+)['"][^>]+(?:class|id)=['"][^'"]*logo[^'"]*['"][^>]*/gi,
        // Header images
        /<header[^>]*>[\s\S]*?<img[^>]+src=['"]([^'"]+)/gi
      ];
      
      for (const pattern of logoPatterns) {
        const match = pattern.exec(html);
        if (match && match[1]) {
          let logoUrl = match[1];
          
          // Convert relative URLs to absolute
          if (logoUrl.startsWith('/')) {
            const url = new URL(baseUrl);
            logoUrl = `${url.protocol}//${url.host}${logoUrl}`;
          } else if (!logoUrl.startsWith('http')) {
            const url = new URL(baseUrl);
            logoUrl = `${url.protocol}//${url.host}/${logoUrl}`;
          }
          
          // Filter out common non-logo images
          if (logoUrl.includes('favicon') || logoUrl.includes('icon') || logoUrl.includes('logo')) {
            return logoUrl;
          }
        }
      }
      
      return null;
      
    } catch (error) {
      console.error(`[LOGO-EXTRACT] Error extracting logo from HTML:`, error);
      return null;
    }
  }

  /**
   * Extract logo URL from company website
   */
  private static async extractLogoFromWebsite(websiteUrl: string): Promise<string | null> {
    try {
      console.log(`[LOGO-EXTRACT] Trying to extract logo from: ${websiteUrl}`);
      
      // In a real implementation, you would:
      // 1. Fetch the website HTML
      // 2. Parse for logo images in header/nav sections
      // 3. Look for meta tags with logo information
      // 4. Check for favicon or apple-touch-icon
      // 5. Use AI vision to identify company logos
      
      // For now, return null (placeholder implementation)
      return null;
      
    } catch (error) {
      console.error(`[LOGO-EXTRACT] Error extracting logo from ${websiteUrl}:`, error);
      return null;
    }
  }

  /**
   * Extract fiscal codes from company website
   */
  private static async extractFiscalDataFromWebsite(websiteUrl: string): Promise<{ fiscalCode?: string; vatNumber?: string }> {
    try {
      console.log(`[FISCAL-EXTRACT] Trying to extract fiscal data from: ${websiteUrl}`);
      
      // In a real implementation, you would:
      // 1. Fetch the website content
      // 2. Look for patterns like "CF: 12345678901" or "P.IVA: IT12345678901"
      // 3. Check footer sections, legal pages, contact pages
      // 4. Use regex patterns to extract valid fiscal codes
      
      // Common regex patterns for Italian fiscal codes:
      // CF: 11 or 16 digits
      // P.IVA: IT + 11 digits or just 11 digits
      
      // For now, return empty (placeholder implementation)
      return {};
      
    } catch (error) {
      console.error(`[FISCAL-EXTRACT] Error extracting fiscal data from ${websiteUrl}:`, error);
      return {};
    }
  }

  /**
   * Check if two company names contain significant matching words
   */
  private static containsSignificantWords(name1: string, name2: string): boolean {
    // Remove common business suffixes and connectors
    const removeCommon = (name: string) => name
      .replace(/\b(spa|s\.p\.a\.|srl|s\.r\.l\.|snc|sas|ss|s\.s\.|di|della|del|e|&|and|group|gruppo|consulting|consulenza|società|per|azioni|stabilimento|store|flagship|international)\b/gi, '')
      .replace(/[^\w\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    
    const words1 = removeCommon(name1).split(' ').filter(w => w.length > 2);
    const words2 = removeCommon(name2).split(' ').filter(w => w.length > 2);
    
    if (words1.length === 0 || words2.length === 0) return false;
    
    // Check for exact word matches and fuzzy matches
    const matchingWords = words1.filter(w1 => 
      words2.some(w2 => {
        // Exact match
        if (w1.toLowerCase() === w2.toLowerCase()) return true;
        // Substring match (one contains the other)
        if (w1.toLowerCase().includes(w2.toLowerCase()) || w2.toLowerCase().includes(w1.toLowerCase())) return true;
        // Levenshtein distance for typos
        if (this.levenshteinDistance(w1.toLowerCase(), w2.toLowerCase()) <= 1 && Math.min(w1.length, w2.length) > 3) return true;
        return false;
      })
    );
    
    // Consider it a match if more than 40% of significant words match (lowered threshold)
    return matchingWords.length / Math.max(words1.length, words2.length) > 0.4;
  }

  /**
   * Calculate Levenshtein distance between two strings
   */
  private static levenshteinDistance(str1: string, str2: string): number {
    const matrix = [];
    
    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i];
    }
    
    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j;
    }
    
    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }
    
    return matrix[str2.length][str1.length];
  }

  /**
   * Get company logo URL (in production would fetch from various logo APIs)
   */
  static async getCompanyLogo(companyName: string): Promise<string | null> {
    const company = await this.getCompanyDetails(companyName);
    return company?.logoUrl || null;
  }
}