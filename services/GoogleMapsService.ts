/**
 * Google Maps Service for CleanPos
 * Handles postcode autocomplete, geocoding, and distance calculation
 */

import logger from '../utils/logger';

// Types
export interface DeliveryData {
  postcode: string;
  distance_miles: number;
  distance_meters: number;
  mileage_text: string;
  lat: number;
  lng: number;
}

export interface AutocompletePrediction {
  description: string;
  place_id: string;
  structured_formatting: {
    main_text: string;
    secondary_text: string;
  };
}

// Generate a cryptographically secure UUID for session tokens
function generateSecureUUID(): string {
  // Use crypto.randomUUID if available (modern browsers)
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback to crypto.getRandomValues
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  // Set version (4) and variant (8, 9, A, or B) bits
  array[6] = (array[6] & 0x0f) | 0x40;
  array[8] = (array[8] & 0x3f) | 0x80;
  const hex = Array.from(array, b => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}

export class GoogleMapsService {
  private static sessionToken: string | null = null;

  /**
   * Get or create a session token for Autocomplete requests.
   * Google bills Autocomplete + Place Details as a single session if the token is passed to both.
   */
  static getSessionToken(): string {
    if (!this.sessionToken) {
      this.sessionToken = generateSecureUUID();
    }
    return this.sessionToken;
  }

  /**
   * Reset the session token, usually called after the user makes a selection
   */
  static clearSessionToken() {
    this.sessionToken = null;
  }

  /**
   * Fetches Autocomplete suggestions using a Session Token to save costs.
   * Restricted to UK postcodes/addresses.
   */
  static async getAutocompleteSuggestions(input: string, apiKey: string): Promise<AutocompletePrediction[]> {
    if (!input || !apiKey) return [];

    try {
      const token = this.getSessionToken();
      // Restrict to UK (gb) for postcode lookup
      const url = `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(input)}&components=country:gb&sessiontoken=${token}&key=${apiKey}`;

      // In browser, we need to use Electron IPC to avoid CORS
      if ((window as any).electronPrint?.calculateDistance) {
        // Use the Electron bridge for API calls
        const response = await fetch(url);
        const data = await response.json();

        if (data.status === 'OK') {
          return data.predictions as AutocompletePrediction[];
        } else if (data.status === 'ZERO_RESULTS') {
          return [];
        } else {
          logger.error('Google Maps Autocomplete Error:', data.status, data.error_message);
          return [];
        }
      }

      return [];
    } catch (error) {
      logger.error('Error fetching autocomplete suggestions:', error);
      return [];
    }
  }

  /**
   * Computes the delivery distance (mileage) between the store and the target postcode.
   * Uses Electron IPC handler to avoid CORS issues.
   */
  static async getMileage(
    targetPostcode: string,
    storePostcode: string,
    apiKey: string
  ): Promise<DeliveryData | null> {
    if (!targetPostcode || !storePostcode || !apiKey) {
      logger.error('GoogleMapsService: Missing required parameters for distance calculation');
      return null;
    }

    const normalizedTarget = targetPostcode.replace(/\s+/g, '').toUpperCase();
    const normalizedStore = storePostcode.replace(/\s+/g, '').toUpperCase();

    // Same postcode - 0 distance
    if (normalizedTarget === normalizedStore) {
      return {
        postcode: targetPostcode,
        lat: 0,
        lng: 0,
        distance_miles: 0,
        distance_meters: 0,
        mileage_text: '0 mi'
      };
    }

    try {
      // Use Electron IPC for Distance Matrix API (avoids CORS)
      if ((window as any).electronPrint?.calculateDistance) {
        const data = await (window as any).electronPrint.calculateDistance({
          origin: storePostcode,
          destination: targetPostcode,
          apiKey
        });

        if (data.error) {
          logger.error('Distance calculation error:', data.error);
          return null;
        }

        if (data.status === 'OK' && data.rows?.[0]?.elements?.[0]?.status === 'OK') {
          const element = data.rows[0].elements[0];
          const distanceMeters = element.distance.value;
          const mileageText = element.distance.text;
          const distanceMiles = parseFloat((distanceMeters * 0.000621371).toFixed(2));

          return {
            postcode: targetPostcode,
            lat: 0, // Coords not needed for basic distance
            lng: 0,
            distance_miles: distanceMiles,
            distance_meters: distanceMeters,
            mileage_text: mileageText
          };
        }
      }

      return null;
    } catch (error) {
      logger.error('GoogleMapsService: Fatal error computing delivery distance:', error);
      return null;
    }
  }

  /**
   * Validate a UK postcode format using regex
   */
  static validateUKPostcode(postcode: string): boolean {
    const UK_POSTCODE_REGEX = /^([A-Z]{1,2}\d{1,2}[A-Z]?)\s*(\d[A-Z]{2})$/i;
    return UK_POSTCODE_REGEX.test(postcode.trim());
  }

  /**
   * Extract the outward code (prefix) from a UK postcode
   * e.g., "SW1A 1AA" -> "SW1A"
   */
  static extractPostcodePrefix(postcode: string): string | null {
    const UK_POSTCODE_REGEX = /^([A-Z]{1,2}\d{1,2}[A-Z]?)\s*(\d[A-Z]{2})$/i;
    const match = postcode.trim().toUpperCase().match(UK_POSTCODE_REGEX);
    return match ? match[1] : null;
  }

  /**
   * Normalize a postcode to standard format "SW1A 1AA"
   */
  static normalizePostcode(postcode: string): string {
    const UK_POSTCODE_REGEX = /^([A-Z]{1,2}\d{1,2}[A-Z]?)\s*(\d[A-Z]{2})$/i;
    const match = postcode.trim().toUpperCase().match(UK_POSTCODE_REGEX);
    return match ? `${match[1]} ${match[2]}` : postcode.trim().toUpperCase();
  }
}
