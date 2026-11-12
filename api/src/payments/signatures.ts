import { createHmac, timingSafeEqual } from 'node:crypto';

/** HMAC-SHA256 as lowercase hex: the seal both sides can make with the shared secret. */
export function hmacHex(message: string | Buffer, secret: string): string {
  return createHmac('sha256', secret).update(message).digest('hex');
}

/** Compare in constant time, so an attacker cannot guess a signature one character at a time. */
function sameHex(expected: string, received: string): boolean {
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(received, 'utf8');
  return a.length === b.length && timingSafeEqual(a, b);
}

/** What the checkout page hands back: sign(order_id + "|" + payment_id) with the key secret. */
export function isValidCheckoutSignature(orderId: string, paymentId: string, signature: string, keySecret: string): boolean {
  return sameHex(hmacHex(`${orderId}|${paymentId}`, keySecret), signature);
}

/** A webhook: sign(the exact raw body bytes) with the webhook secret. */
export function isValidWebhookSignature(rawBody: Buffer, signature: string, webhookSecret: string): boolean {
  return sameHex(hmacHex(rawBody, webhookSecret), signature);
}
