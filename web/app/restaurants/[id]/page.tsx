"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { apiRequest, DEMO_LOCATION, getSession, rupees, type Bill, type Coupon, type Menu, type Placed } from "../../../lib/api";
import { BillTable } from "../../BillTable";

/** Menu + cart. The bill always comes from the server, never from the browser's own maths. */
export default function RestaurantPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [menu, setMenu] = useState<Menu | null>(null);
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [cart, setCart] = useState<Record<string, number>>({}); // menu item id → quantity
  const [coupon, setCoupon] = useState("");
  const [bill, setBill] = useState<Bill | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [placing, setPlacing] = useState(false);
  const idempotencyKey = useRef<string | null>(null); // the same key for retries of the same tap

  useEffect(() => {
    apiRequest<Menu>(`/restaurants/${id}/menu`).then(setMenu).catch((e: Error) => setMessage(e.message));
    apiRequest<Coupon[]>("/coupons").then(setCoupons).catch(() => setCoupons([]));
  }, [id]);

  const lines = Object.entries(cart).filter(([, q]) => q > 0).map(([menu_item_id, quantity]) => ({ menu_item_id, quantity }));
  const cartKey = JSON.stringify({ restaurant_id: id, items: lines, ...DEMO_LOCATION, ...(coupon ? { coupon_code: coupon } : {}) });

  // Every time the cart or coupon changes, ask the server for the real bill (after the user stops tapping)
  useEffect(() => {
    if (lines.length === 0 || !getSession()) { setBill(null); return; }
    const timer = setTimeout(() => {
      apiRequest<{ bill: Bill }>("/orders/quote", { method: "POST", body: cartKey })
        .then((q) => { setBill(q.bill); setMessage(null); })
        .catch((e: Error) => { setBill(null); setMessage(e.message); });
    }, 300);
    return () => clearTimeout(timer);
  }, [cartKey]); // eslint-disable-line react-hooks/exhaustive-deps

  function change(itemId: string, delta: number) {
    setCart((old) => ({ ...old, [itemId]: Math.max(0, Math.min(20, (old[itemId] ?? 0) + delta)) }));
    idempotencyKey.current = null; // a changed cart is a new order
  }

  async function placeOrder() {
    if (!getSession()) { router.push(`/login?next=/restaurants/${id}`); return; }
    setPlacing(true);
    idempotencyKey.current ??= crypto.randomUUID();
    try {
      const placed = await apiRequest<Placed>("/orders", { method: "POST", body: cartKey, headers: { "Idempotency-Key": idempotencyKey.current } });
      const back = `${window.location.origin}/orders/${placed.order_id}`;
      window.location.href = `${placed.payment.checkout_url}?callback_url=${encodeURIComponent(back)}`; // off to the gateway
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Could not place the order");
      setPlacing(false);
    }
  }

  if (!menu) return <main>{message ? <p className="error">{message}</p> : <p className="muted">Loading…</p>}</main>;

  return (
    <main>
      <h1>{menu.restaurant.name}</h1>
      <p className="muted">{menu.restaurant.cuisine}{menu.restaurant.is_open ? "" : " · closed right now"}</p>

      {menu.items.map((item) => (
        <div key={item.id} className="card row">
          <span>{item.is_veg ? "🟢" : "🔴"} <strong>{item.name}</strong><br /><span className="muted">{rupees(item.price)}</span></span>
          <span className="qty">
            <button type="button" className="ghost" onClick={() => change(item.id, -1)} disabled={!cart[item.id]}>−</button>
            {cart[item.id] ?? 0}
            <button type="button" onClick={() => change(item.id, 1)}>+</button>
          </span>
        </div>
      ))}

      {lines.length > 0 && (
        <>
          <h2>Your bill</h2>
          <div className="card">
            <select value={coupon} onChange={(e) => { setCoupon(e.target.value); idempotencyKey.current = null; }}>
              <option value="">No coupon</option>
              {coupons.map((c) => <option key={c.code} value={c.code}>{c.code}: {c.description}</option>)}
            </select>
            {!getSession() && <p className="muted">Sign in to see your bill.</p>}
            {bill && <BillTable bill={bill} />}
            {message && <p className="error">{message}</p>}
            <button type="button" onClick={placeOrder} disabled={placing || (!!getSession() && !bill)} style={{ width: "100%", marginTop: 12 }}>
              {placing ? "Placing…" : bill ? `Place order · ${rupees(bill.grand_total)}` : "Place order"}
            </button>
          </div>
        </>
      )}
    </main>
  );
}
