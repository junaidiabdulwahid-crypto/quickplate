import { Injectable, Logger } from '@nestjs/common';

export const GATEWAY = {
  url: process.env.GATEWAY_URL ?? 'http://localhost:4000',
  keyId: process.env.GATEWAY_KEY_ID ?? 'key_test_quickplate',
  keySecret: process.env.GATEWAY_KEY_SECRET ?? 'test_key_secret_change_me', // the secret lives only in env
  webhookSecret: process.env.GATEWAY_WEBHOOK_SECRET ?? 'test_webhook_secret_change_me',
  timeoutMs: 5000,
};

/** unavailable = down, slow or 5xx (try later); rejected = the gateway said no (4xx). */
export class GatewayError extends Error {
  constructor(
    readonly kind: 'unavailable' | 'rejected',
    message: string,
  ) {
    super(message);
  }
}

export interface GatewayOrder {
  id: string;
  amount: number;
  currency: 'INR';
  receipt: string;
  status: string;
}
export interface GatewayRefund {
  id: string;
  payment_id: string;
  amount: number;
  status: string;
}

/** Talks to a Razorpay-style gateway: Basic auth, a 5 s timeout, one retry on network/5xx errors. */
@Injectable()
export class PaymentGateway {
  private readonly logger = new Logger(PaymentGateway.name);

  /** receipt = our order id, so asking twice for the same order gives the same gateway order. */
  createOrder(amountPaise: number, receipt: string): Promise<GatewayOrder> {
    return this.call<GatewayOrder>('/v1/orders', { amount: amountPaise, currency: 'INR', receipt });
  }

  refund(paymentId: string, amountPaise: number): Promise<GatewayRefund> {
    return this.call<GatewayRefund>(`/v1/payments/${encodeURIComponent(paymentId)}/refund`, { amount: amountPaise });
  }

  private async call<T>(path: string, body: object, attempt = 1): Promise<T> {
    const auth = Buffer.from(`${GATEWAY.keyId}:${GATEWAY.keySecret}`).toString('base64');
    let res: Response;
    try {
      res = await fetch(`${GATEWAY.url}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Basic ${auth}` },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(GATEWAY.timeoutMs), // never wait forever
      });
    } catch (err) {
      return this.retryOrFail(path, body, attempt, `network: ${(err as Error).name}`);
    }
    if (res.status >= 500) return this.retryOrFail(path, body, attempt, `gateway ${res.status}`); // a hiccup → retry
    const data = (await res.json().catch(() => ({}))) as { error?: { description?: string } };
    if (!res.ok) throw new GatewayError('rejected', data.error?.description ?? `gateway ${res.status}`); // 4xx: no point retrying
    return data as T;
  }

  private async retryOrFail<T>(path: string, body: object, attempt: number, reason: string): Promise<T> {
    this.logger.warn(`Gateway call ${path} failed (${reason}), attempt ${attempt}`);
    if (attempt >= 2) throw new GatewayError('unavailable', reason);
    await new Promise((resolve) => setTimeout(resolve, 300));
    return this.call<T>(path, body, attempt + 1);
  }
}
