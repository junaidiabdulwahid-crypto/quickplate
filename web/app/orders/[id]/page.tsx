"use client";

import { useParams, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { apiRequest, type OrderStatus, type OrderView } from "../../../lib/api";
import { BillTable } from "../../BillTable";

const FINAL: OrderStatus[] = ["payment_failed", "delivered", "cancelled"];
const LABEL: Record<OrderStatus, string> = {
  pending_payment: "Waiting for payment",
  payment_failed: "Payment failed",
  paid: "Paid, waiting for the restaurant",
  accepted: "Accepted",
  preparing: "Being prepared",
  ready: "Ready for pickup",
  picked_up: "On the way",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

function OrderTracker() {
  const { id } = useParams<{ id: string }>();
  const params = useSearchParams();
  const [order, setOrder] = useState<OrderView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const verified = useRef(false); // verify once, even if React runs the effect twice

  // 1. Back from the gateway: send the three values to our server to check the signature
  useEffect(() => {
    const paymentId = params.get("razorpay_payment_id");
    if (verified.current || !paymentId) return;
    verified.current = true;
    apiRequest("/payments/verify", {
      method: "POST",
      body: JSON.stringify({
        razorpay_order_id: params.get("razorpay_order_id"),
        razorpay_payment_id: paymentId,
        razorpay_signature: params.get("razorpay_signature"),
      }),
    })
      .then(() => window.history.replaceState(null, "", `/orders/${id}`)) // clean the URL
      .catch((e: Error) => setError(e.message));
  }, [id, params]);

  // 2. Poll every 3 seconds until the order reaches a final status
  useEffect(() => {
    let stop = false;
    async function tick() {
      try {
        const o = await apiRequest<OrderView>(`/orders/${id}`);
        if (stop) return;
        setOrder(o);
        if (!FINAL.includes(o.status)) setTimeout(tick, 3000);
      } catch (e) {
        if (!stop) setError(e instanceof Error ? e.message : "Could not load the order");
      }
    }
    tick();
    return () => { stop = true; };
  }, [id]);

  async function cancel() {
    try {
      await apiRequest(`/orders/${id}/cancel`, { method: "POST" });
      setOrder(await apiRequest<OrderView>(`/orders/${id}`));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not cancel");
    }
  }

  if (params.get("error") === "payment_failed") return <main><p className="error">Payment failed. No money was taken. Please try again.</p></main>;
  if (error) return <main><p className="error">{error}</p></main>;
  if (!order) return <main><p className="muted">Loading your order…</p></main>;

  return (
    <main>
      <h1>{LABEL[order.status]}</h1>
      <p className="muted">{order.restaurant.name}</p>

      {order.rider && order.status === "picked_up" && (
        <div className="card">🛵 <strong>{order.rider.name}</strong> is at {order.rider.latitude}, {order.rider.longitude}</div>
      )}

      <h2>Timeline</h2>
      <ol className="timeline">
        {order.timeline.map((e, i) => (
          <li key={i}>{LABEL[e.status]} <span className="muted">· {new Date(e.at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}</span></li>
        ))}
      </ol>

      <h2>Items</h2>
      <div className="card">
        {order.items.map((i) => <div key={i.name} className="row"><span>{i.quantity} × {i.name}</span><span>₹{i.line_total.toFixed(2)}</span></div>)}
        <hr style={{ border: 0, borderTop: "1px solid var(--line)" }} />
        <BillTable bill={order.bill} />
      </div>

      {(order.status === "pending_payment" || order.status === "paid") && (
        <button type="button" className="ghost" onClick={cancel}>Cancel order</button>
      )}
    </main>
  );
}

export default function OrderPage() {
  return <Suspense><OrderTracker /></Suspense>; // useSearchParams needs a Suspense boundary
}
