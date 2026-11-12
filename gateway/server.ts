/**
 * PaySim: a pretend Razorpay-style payment gateway for local development. No real money moves.
 * Plain Node.js (http + crypto), no framework. Run: node --experimental-strip-types gateway/server.ts
 *
 *   POST /v1/orders                      create a payment order (Basic auth)
 *   GET  /checkout/:orderId              the hosted checkout page (Pay / Fail buttons)
 *   POST /checkout/:orderId/pay          pay; redirects to callback_url with a signature (JSON with ?format=json)
 *   POST /checkout/:orderId/fail         a failed payment
 *   POST /v1/payments/:paymentId/refund  refund a captured payment (Basic auth)
 *   POST /__mode                         chaos switch: normal | down | slow | duplicate_webhooks
 */
import { createHmac, randomBytes } from 'node:crypto';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';

const PORT = Number(process.env.GATEWAY_PORT ?? 4000);
const KEY_ID = process.env.GATEWAY_KEY_ID ?? 'key_test_quickplate';
const KEY_SECRET = process.env.GATEWAY_KEY_SECRET ?? 'test_key_secret_change_me';
const WEBHOOK_SECRET = process.env.GATEWAY_WEBHOOK_SECRET ?? 'test_webhook_secret_change_me';
const WEBHOOK_URL = process.env.WEBHOOK_URL ?? 'http://localhost:3200/api/v1/webhooks/payments';

type Mode = 'normal' | 'down' | 'slow' | 'duplicate_webhooks';
let mode: Mode = 'normal';

interface GOrder { id: string; entity: 'order'; amount: number; currency: 'INR'; receipt: string; status: 'created' | 'paid' | 'attempted' }
interface GPayment { id: string; entity: 'payment'; order_id: string; amount: number; status: 'captured' | 'failed' | 'refunded' }

const orders = new Map<string, GOrder>();
const orderByReceipt = new Map<string, string>();
const payments = new Map<string, GPayment>();

function newId(prefix: string): string {
  return `${prefix}_${randomBytes(7).toString('base64url')}`;
}
function sign(message: string, secret: string): string {
  return createHmac('sha256', secret).update(message).digest('hex');
}
function send(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}
function fail(res: ServerResponse, status: number, description: string): void {
  send(res, status, { error: { code: status === 401 ? 'UNAUTHORIZED' : 'BAD_REQUEST_ERROR', description } });
}
function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk: Buffer) => {
      raw += chunk.toString('utf8');
      if (raw.length > 100_000) req.destroy(new Error('body too large'));
    });
    req.on('end', () => resolve(raw));
    req.on('error', reject);
  });
}
function authorised(req: IncomingMessage): boolean {
  const expected = `Basic ${Buffer.from(`${KEY_ID}:${KEY_SECRET}`).toString('base64')}`;
  return req.headers.authorization === expected;
}
function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c);
}

async function sendWebhook(event: 'payment.captured' | 'payment.failed', p: GPayment): Promise<void> {
  const body = JSON.stringify({ event, payload: { payment: { entity: { id: p.id, order_id: p.order_id, amount: p.amount, status: p.status } } } });
  const eventId = newId('evt');
  const copies = mode === 'duplicate_webhooks' ? 2 : 1; // the chaos switch: the same event twice on purpose
  for (let copy = 1; copy <= copies; copy++) {
    for (let attempt = 1; attempt <= 3; attempt++) { // retries, like real gateways
      try {
        const r = await fetch(WEBHOOK_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Razorpay-Signature': sign(body, WEBHOOK_SECRET), 'X-Razorpay-Event-Id': eventId },
          body,
        });
        console.log(`webhook ${event} ${eventId} copy ${copy} → ${r.status} ${await r.text()}`);
        if (r.ok) break;
      } catch (err) {
        console.log(`webhook ${event} ${eventId} attempt ${attempt} failed: ${(err as Error).message}`);
      }
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }
}

function checkoutPage(o: GOrder, callbackUrl: string): string {
  const rupees = (o.amount / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 });
  const q = callbackUrl ? `?callback_url=${encodeURIComponent(callbackUrl)}` : '';
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>PaySim checkout</title>
<style>body{font-family:system-ui,sans-serif;background:#f1f5f9;display:grid;place-items:center;min-height:100vh;margin:0}
.box{background:#fff;padding:28px;border-radius:12px;box-shadow:0 4px 20px #0001;width:320px;text-align:center}
.amt{font-size:32px;font-weight:800;margin:8px 0 20px}button{width:100%;padding:12px;border:0;border-radius:8px;font-weight:700;margin-top:8px;cursor:pointer}
.pay{background:#2563eb;color:#fff}.no{background:#e2e8f0}small{color:#64748b}</style></head><body><div class="box">
<small>PaySim test mode · no real money</small><div class="amt">₹${rupees}</div><small>${escapeHtml(o.id)}</small>
<form method="post" action="/checkout/${encodeURIComponent(o.id)}/pay${q}"><button class="pay">Pay ₹${rupees}</button></form>
<form method="post" action="/checkout/${encodeURIComponent(o.id)}/fail${q}"><button class="no">Simulate a failed payment</button></form>
</div></body></html>`;
}

/** Only redirect back to http(s) URLs, never to javascript: and the like. */
function safeCallback(raw: string | null): string | null {
  if (!raw) return null;
  try {
    const u = new URL(raw);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.toString() : null;
  } catch {
    return null;
  }
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);
  try {
    const raw = await readBody(req);

    if (req.method === 'POST' && url.pathname === '/__mode') {
      const b = JSON.parse(raw || '{}') as { mode?: Mode };
      if (!b.mode || !['normal', 'down', 'slow', 'duplicate_webhooks'].includes(b.mode)) return fail(res, 400, 'mode must be normal, down, slow or duplicate_webhooks');
      mode = b.mode;
      console.log(`mode → ${mode}`);
      return send(res, 200, { mode });
    }

    // The server-to-server API: chaos modes apply here
    if (url.pathname.startsWith('/v1/')) {
      if (mode === 'down') return fail(res, 503, 'Gateway is down (PaySim chaos mode)');
      if (mode === 'slow') await new Promise((resolve) => setTimeout(resolve, 12_000));
      if (!authorised(req)) return fail(res, 401, 'The api key provided is invalid');
    }

    if (req.method === 'POST' && url.pathname === '/v1/orders') {
      const b = JSON.parse(raw || '{}') as { amount?: number; currency?: string; receipt?: string };
      if (!Number.isInteger(b.amount) || (b.amount ?? 0) < 100) return fail(res, 400, 'The amount must be at least INR 1.00 (100 paise)');
      if (b.currency !== 'INR') return fail(res, 400, 'Currency is not supported');
      const existing = b.receipt ? orderByReceipt.get(b.receipt) : undefined;
      if (existing) return send(res, 200, orders.get(existing)); // same receipt = same order (no double charge)
      const o: GOrder = { id: newId('order'), entity: 'order', amount: b.amount!, currency: 'INR', receipt: b.receipt ?? '', status: 'created' };
      orders.set(o.id, o);
      if (b.receipt) orderByReceipt.set(b.receipt, o.id);
      return send(res, 200, o);
    }

    const refundMatch = url.pathname.match(/^\/v1\/payments\/([\w-]+)\/refund$/);
    if (req.method === 'POST' && refundMatch) {
      const p = payments.get(refundMatch[1]);
      if (!p) return fail(res, 404, 'Payment not found');
      if (p.status === 'refunded') return fail(res, 400, 'The payment has been fully refunded already');
      if (p.status !== 'captured') return fail(res, 400, 'Only captured payments can be refunded');
      p.status = 'refunded';
      return send(res, 200, { id: newId('rfnd'), entity: 'refund', payment_id: p.id, amount: p.amount, status: 'processed' });
    }

    const checkout = url.pathname.match(/^\/checkout\/([\w-]+)(?:\/(pay|fail))?$/);
    if (checkout) {
      const o = orders.get(checkout[1]);
      if (!o) return fail(res, 404, 'Order not found');
      const action = checkout[2];
      const callback = safeCallback(url.searchParams.get('callback_url'));
      const wantsJson = url.searchParams.get('format') === 'json';

      if (req.method === 'GET' && !action) {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        return res.end(checkoutPage(o, callback ?? ''));
      }
      if (req.method === 'POST' && action === 'pay') {
        if (o.status === 'paid') return fail(res, 400, 'This order is already paid');
        const p: GPayment = { id: newId('pay'), entity: 'payment', order_id: o.id, amount: o.amount, status: 'captured' };
        payments.set(p.id, p);
        o.status = 'paid';
        void sendWebhook('payment.captured', p); // the server-to-server confirmation, in the background
        const result = { razorpay_order_id: o.id, razorpay_payment_id: p.id, razorpay_signature: sign(`${o.id}|${p.id}`, KEY_SECRET) };
        if (wantsJson || !callback) return send(res, 200, result);
        const back = new URL(callback);
        for (const [k, v] of Object.entries(result)) back.searchParams.set(k, v);
        res.writeHead(303, { Location: back.toString() });
        return res.end();
      }
      if (req.method === 'POST' && action === 'fail') {
        const p: GPayment = { id: newId('pay'), entity: 'payment', order_id: o.id, amount: o.amount, status: 'failed' };
        payments.set(p.id, p);
        o.status = 'attempted';
        void sendWebhook('payment.failed', p);
        if (wantsJson || !callback) return send(res, 200, { error: 'payment_failed', razorpay_order_id: o.id });
        const back = new URL(callback);
        back.searchParams.set('error', 'payment_failed');
        res.writeHead(303, { Location: back.toString() });
        return res.end();
      }
    }

    return fail(res, 404, `Cannot ${req.method} ${url.pathname}`);
  } catch (err) {
    console.error(err);
    return fail(res, 400, 'Malformed request');
  }
});

server.listen(PORT, () => console.log(`PaySim (pretend gateway) on http://localhost:${PORT} · webhooks → ${WEBHOOK_URL}`));
