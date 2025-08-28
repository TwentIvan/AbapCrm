// Servizio per suggerimenti indirizzi italiani usando Geoapify API gratuita
interface AddressSuggestion {
  formatted: string;
  street?: string;
  city?: string;
  postcode?: string;
  country?: string;
}

interface GeoapifyResponse {
  features: Array<{
    properties: {
      formatted: string;
      street?: string;
      city?: string;
      postcode?: string;
      country?: string;
      country_code?: string;
    };
  }>;
}

export class AddressService {
  private static readonly GEOAPIFY_API_KEY = process.env.GEOAPIFY_API_KEY;
  private static readonly BASE_URL = 'https://api.geoapify.com/v1/geocode/autocomplete';

  static async getAddressSuggestions(query: string): Promise<AddressSuggestion[]> {
    if (!query || query.length < 3) return [];
    
    // Se non c'è API key, restituisce array vuoto (funziona lo stesso ma senza suggerimenti)
    if (!this.GEOAPIFY_API_KEY) {
      console.warn('GEOAPIFY_API_KEY not set - address suggestions disabled');
      return [];
    }

    try {
      const url = new URL(this.BASE_URL);
      url.searchParams.set('text', query);
      url.searchParams.set('filter', 'countrycode:it');
      url.searchParams.set('limit', '8');
      url.searchParams.set('format', 'geojson');
      url.searchParams.set('apiKey', this.GEOAPIFY_API_KEY);

      const response = await fetch(url.toString());
      if (!response.ok) {
        console.error('Geoapify API error:', response.status);
        return [];
      }

      const data: GeoapifyResponse = await response.json();
      
      return data.features.map(feature => ({
        formatted: feature.properties.formatted,
        street: feature.properties.street,
        city: feature.properties.city,
        postcode: feature.properties.postcode,
        country: feature.properties.country || 'Italy'
      }));
    } catch (error) {
      console.error('Error fetching address suggestions:', error);
      return [];
    }
  }

  static async getCitySuggestions(query: string): Promise<AddressSuggestion[]> {
    if (!query || query.length < 2) return [];
    
    if (!this.GEOAPIFY_API_KEY) {
      return [];
    }

    try {
      const url = new URL(this.BASE_URL);
      url.searchParams.set('text', query);
      url.searchParams.set('type', 'city');
      url.searchParams.set('filter', 'countrycode:it');
      url.searchParams.set('limit', '8');
      url.searchParams.set('format', 'geojson');
      url.searchParams.set('apiKey', this.GEOAPIFY_API_KEY);

      const response = await fetch(url.toString());
      if (!response.ok) {
        return [];
      }

      const data: GeoapifyResponse = await response.json();
      
      return data.features.map(feature => ({
        formatted: feature.properties.formatted,
        city: feature.properties.city,
        postcode: feature.properties.postcode,
        country: feature.properties.country || 'Italy'
      }));
    } catch (error) {
      console.error('Error fetching city suggestions:', error);
      return [];
    }
  }
}