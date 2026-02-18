export type Page = 'home' | 'services' | 'booking' | 'contact' | 'back-office' | 'driver-portal' | 'track-order' | 'customer-portal' | 'saas-landing' | 'master-admin' | 'how-it-works';

export interface ServiceItem {
  title: string;
  price: string;
  description: string;
}

export interface Testimonial {
  name: string;
  text: string;
  rating: number;
}

export interface TimeSlot {
  id: string;
  day: string;
  label: string;
  active: boolean;
}

export interface CartItem {
  name: string;
  price: string;
  quantity: number;
  note?: string; // Added note field
}

export interface DeliveryOption {
  id: string;
  label: string;
  price: number;
  active: boolean;
}

export interface Invoice {
  id: string;
  customer_id: string;
  order_id: string;
  invoice_number: string;
  amount: number;
  items: any[];
  created_at: string;
}

export interface DiscountCode {
  id: string;
  code: string;
  discount_type: 'percentage' | 'fixed';
  discount_value: number;
  one_time_use: boolean;
  expiry_date: string | null;
  active: boolean;
  created_at: string;
}

export interface Tenant {
  id: string;
  name: string;
  subdomain: string;
  subscription_status: string;
  trial_ends_at: string;
  created_at: string;
  address?: string;
  town_city?: string;
  postcode?: string;
  seo_title?: string;
  seo_description?: string;
  seo_keywords?: string;
  social_facebook?: string;
  social_instagram?: string;
}