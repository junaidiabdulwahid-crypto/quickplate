import { hmacHex, isValidCheckoutSignature, isValidWebhookSignature } from './signatures';

describe('signatures', () => {
  const keySecret = 'test_key_secret';
  const webhookSecret = 'test_webhook_secret';

  it('accepts the right checkout seal and rejects a changed payment id', () => {
    const sig = hmacHex('order_A1|pay_B2', keySecret);
    expect(isValidCheckoutSignature('order_A1', 'pay_B2', sig, keySecret)).toBe(true);
    expect(isValidCheckoutSignature('order_A1', 'pay_XX', sig, keySecret)).toBe(false);
  });

  it('rejects a webhook body changed by one space', () => {
    const body = '{"event":"payment.captured"}';
    const sig = hmacHex(body, webhookSecret);
    expect(isValidWebhookSignature(Buffer.from(body), sig, webhookSecret)).toBe(true);
    expect(isValidWebhookSignature(Buffer.from(body + ' '), sig, webhookSecret)).toBe(false);
  });
});
