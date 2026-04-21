/**
 * Postcode Service Area Types for CleanPos
 */

export interface PostcodeArea {
  id: string;
  tenant_id: string;
  area_name: string;
  postcode_prefixes: string[];
  is_active: boolean;
  surcharge_gbp: number;
  max_distance_miles?: number;
  created_at?: string;
  updated_at?: string;
}

export interface PostcodeServiceSlot {
  id: string;
  postcode_area_id: string;
  service_type: 'collection' | 'delivery';
  day_of_week: number; // 0=Sunday, 1=Monday...6=Saturday
  start_time: string;  // HH:MM format
  end_time: string;    // HH:MM format
  max_bookings: number;
  is_active: boolean;
}

export interface PostcodeSlotBooking {
  id: string;
  slot_id: string;
  booking_date: string; // YYYY-MM-DD
  current_bookings: number;
}

export interface AvailableSlot {
  date: Date;
  dateStr: string;      // YYYY-MM-DD
  day_name: string;     // e.g., "Monday"
  time_range: string;   // e.g., "09:00-12:00"
  slots_remaining: number;
  slot_id: string;
  service_type: 'collection' | 'delivery';
}

export interface DeliveryData {
  postcode: string;
  distance_miles: number;
  distance_meters: number;
  mileage_text: string;
  lat: number;
  lng: number;
}

export interface PostcodeCheckResult {
  valid: boolean;
  area: PostcodeArea | null;
  distance?: DeliveryData | null;
  collectionSlots: AvailableSlot[];
  deliverySlots: AvailableSlot[];
  surcharge: number;
  errorMessage?: string;
}
