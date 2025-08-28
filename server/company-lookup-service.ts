// Company lookup service for Italian businesses
// This service can be extended with real APIs like InfoCamere, Agenzia delle Entrate, etc.

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
  }
];

export class CompanyLookupService {
  
  /**
   * Search for companies by name using OpenCorporates API + mock fallback
   */
  static async searchCompanies(query: string): Promise<CompanyInfo[]> {
    console.log(`[COMPANY-SEARCH] Searching for: "${query}"`);
    
    if (!query || query.length < 2) {
      console.log('[COMPANY-SEARCH] Query too short, returning empty array');
      return [];
    }

    const normalizedQuery = query.toLowerCase().trim();
    console.log(`[COMPANY-SEARCH] Normalized query: "${normalizedQuery}"`);
    
    try {
      // First try OpenCorporates API for real data
      const openCorpResults = await this.searchOpenCorporates(normalizedQuery);
      if (openCorpResults.length > 0) {
        console.log(`[COMPANY-SEARCH] OpenCorporates found ${openCorpResults.length} results`);
        return openCorpResults;
      }
    } catch (error) {
      console.error('[COMPANY-SEARCH] OpenCorporates API error:', error);
    }
    
    // Fallback to mock database for well-known companies
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
   * Search companies using OpenCorporates API
   */
  private static async searchOpenCorporates(query: string): Promise<CompanyInfo[]> {
    // OpenCorporates API - Free tier: 500 requests/month
    const apiUrl = `https://api.opencorporates.com/v0.4/companies/search`;
    const params = new URLSearchParams({
      q: query,
      jurisdiction_code: 'it', // Focus on Italian companies
      format: 'json',
      per_page: '10'
    });

    console.log(`[OPENCORPORATES] Searching: ${apiUrl}?${params}`);
    
    const response = await fetch(`${apiUrl}?${params}`, {
      headers: {
        'User-Agent': 'ReplicCRM/1.0 (Business CRM Application)',
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`OpenCorporates API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    console.log(`[OPENCORPORATES] Response:`, data);
    
    if (!data.results || !data.results.companies) {
      return [];
    }

    // Transform OpenCorporates data to our format
    return data.results.companies.map((item: any) => {
      const company = item.company;
      return {
        name: company.name,
        legalName: company.name,
        address: this.formatAddress(company),
        city: company.registered_address?.locality,
        postalCode: company.registered_address?.postal_code,
        country: 'IT',
        fiscalCode: company.company_number, // In Italy, this might be the fiscal code
        vatNumber: company.company_number ? `IT${company.company_number}` : undefined,
        website: company.home_page_url,
        description: `${company.company_type || 'Azienda'} registrata in ${company.jurisdiction_code?.toUpperCase()}`,
        sector: company.company_type,
        // Note: OpenCorporates doesn't provide logos, would need another service for that
      } as CompanyInfo;
    }).slice(0, 10);
  }

  /**
   * Format address from OpenCorporates data
   */
  private static formatAddress(company: any): string | undefined {
    const addr = company.registered_address;
    if (!addr) return undefined;
    
    const parts = [
      addr.street_address,
      addr.locality,
      addr.region,
      addr.postal_code
    ].filter(Boolean);
    
    return parts.length > 0 ? parts.join(', ') : undefined;
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
              address: this.formatAddress(company),
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
    
    // If direct lookup fails, try search
    const searchResults = await this.searchOpenCorporates(identifier);
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
   * Get company logo URL (in production would fetch from various logo APIs)
   */
  static async getCompanyLogo(companyName: string): Promise<string | null> {
    const company = await this.getCompanyDetails(companyName);
    return company?.logoUrl || null;
  }
}