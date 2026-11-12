export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3200/api/v1";
const SESSION_KEY = "quickplate_session";

/** Where orders are delivered in this demo: a fixed spot 3.2 km from the sample restaurant. */
export const DEMO_LOCATION = { latitude: 23.6981, longitude: 86.1511 } as const;

export interface SessionUser { id: string; name: string; role: "customer" | "restaurant_owner" | "rider" }

export function getSession(): { token: string; user: SessionUser } | null {
  if (typeof window === "undefined") return null; // no localStorage on the server
  const raw = window.localStorage.getItem(SESSION_KEY);
  return raw ? (JSON.parse(raw) as { token: string; user: SessionUser }) : null;
}
export function saveSession(token: string, user: SessionUser): void {
  window.localStorage.setItem(SESSION_KEY, JSON.stringify({ token, user }));
}
export function clearSession(): void {
  window.localStorage.removeItem(SESSION_KEY);
}

export async function apiRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const session = getSession();
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(session ? { Authorization: `Bearer ${session.token}` } : {}),
      ...options.headers,
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = Array.isArray(data.message) ? data.message.join(", ") : data.message;
    throw new Error(message || `Request failed (${res.status})`);
  }
  return data as T;
}

/** Indian commas: ₹1,23,456.00 */
export function rupees(amount: number): string {
  return `₹${amount.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export interface NearbyRestaurant { id: string; name: string; cuisine: string; distance_m: number }
export interface Menu {
  restaurant: { id: string; name: string; cuisine: string; is_open: boolean };
  items: Array<{ id: string; name: string; price: number; is_veg: boolean }>;
}
export interface Coupon { code: string; description: string; min_order: number }
export interface Bill { items_total: number; discount: number; delivery_fee: number; packaging_fee: number; gst: number; grand_total: number }
export interface Placed { order_id: string; bill: Bill; payment: { checkout_url: string } }
export type OrderStatus =
  | "pending_payment" | "payment_failed" | "paid" | "accepted" | "preparing" | "ready" | "picked_up" | "delivered" | "cancelled";
export interface OrderView {
  id: string;
  status: OrderStatus;
  restaurant: { id: string; name: string };
  items: Array<{ name: string; unit_price: number; quantity: number; line_total: number }>;
  coupon_code: string | null;
  bill: Bill;
  timeline: Array<{ status: OrderStatus; at: string }>;
  rider: { name: string; latitude: number; longitude: number } | null;
}
