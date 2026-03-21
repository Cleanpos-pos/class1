const BASE_URL = 'https://api.shipday.com';

export interface ShipdayCarrier {
  id: number;
  name: string;
  phoneNumber: string;
  isOnShift: boolean;
  isActive: boolean;
  email?: string;
  carrierPhoto?: string;
}

export interface ShipdayOrderPayload {
  orderNumber: string;
  customerName: string;
  customerAddress: string;
  customerPhoneNumber: string;
  restaurantName: string;
  restaurantAddress: string;
  orderItem?: { name: string; unitPrice: number; quantity: number; detail?: string }[];
  totalOrderCost?: number;
  tax?: number;
  deliveryFee?: number;
  deliveryInstruction?: string;
  paymentMethod?: string;
}

export interface ShipdayActiveOrder {
  orderId: number;
  orderNumber: string;
  orderStatus?: { orderState: string };
  assignedCarrier?: { id: number; name: string; phone: string };
  trackingLink?: string;
}

export class ShipdayService {
  private static headers(apiKey: string) {
    return {
      'Authorization': `Basic ${apiKey}`,
      'Content-Type': 'application/json',
    };
  }

  /**
   * POST /orders — Create a delivery order in Shipday
   */
  static async createOrder(apiKey: string, payload: ShipdayOrderPayload): Promise<{ orderId: number } | null> {
    if (!apiKey) return null;
    try {
      const res = await fetch(`${BASE_URL}/orders`, {
        method: 'POST',
        headers: this.headers(apiKey),
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        console.error('[Shipday] createOrder failed:', res.status, await res.text());
        return null;
      }
      const data = await res.json();
      return data?.orderId ? { orderId: data.orderId } : null;
    } catch (err) {
      console.error('[Shipday] createOrder error:', err);
      return null;
    }
  }

  /**
   * GET /orders — List active orders from Shipday
   */
  static async getActiveOrders(apiKey: string): Promise<ShipdayActiveOrder[]> {
    if (!apiKey) return [];
    try {
      const res = await fetch(`${BASE_URL}/orders`, {
        method: 'GET',
        headers: this.headers(apiKey),
      });
      if (!res.ok) {
        console.error('[Shipday] getActiveOrders failed:', res.status);
        return [];
      }
      return await res.json();
    } catch (err) {
      console.error('[Shipday] getActiveOrders error:', err);
      return [];
    }
  }

  /**
   * GET /carriers — List all drivers/carriers
   */
  static async getCarriers(apiKey: string): Promise<ShipdayCarrier[]> {
    if (!apiKey) return [];
    try {
      const res = await fetch(`${BASE_URL}/carriers`, {
        method: 'GET',
        headers: this.headers(apiKey),
      });
      if (!res.ok) {
        console.error('[Shipday] getCarriers failed:', res.status);
        return [];
      }
      return await res.json();
    } catch (err) {
      console.error('[Shipday] getCarriers error:', err);
      return [];
    }
  }

  /**
   * PUT /orders/assign/{orderId}/{carrierId} — Assign a driver to an order
   */
  static async assignDriver(apiKey: string, orderId: number, carrierId: number): Promise<boolean> {
    if (!apiKey || !orderId || !carrierId) return false;
    try {
      const res = await fetch(`${BASE_URL}/orders/assign/${orderId}/${carrierId}`, {
        method: 'PUT',
        headers: this.headers(apiKey),
      });
      if (!res.ok) {
        console.error('[Shipday] assignDriver failed:', res.status);
        return false;
      }
      return true;
    } catch (err) {
      console.error('[Shipday] assignDriver error:', err);
      return false;
    }
  }

  /**
   * Test the API connection by fetching carriers
   */
  static async testConnection(apiKey: string): Promise<boolean> {
    if (!apiKey) return false;
    try {
      const res = await fetch(`${BASE_URL}/carriers`, {
        method: 'GET',
        headers: this.headers(apiKey),
      });
      return res.ok;
    } catch {
      return false;
    }
  }
}
