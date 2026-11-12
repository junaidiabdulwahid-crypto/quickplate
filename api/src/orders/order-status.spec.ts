import { canMove, FINAL_STATUSES, NEXT_STATUSES } from './order-status';

describe('order status machine', () => {
  it('allows the happy path', () => {
    const path = ['pending_payment', 'paid', 'accepted', 'preparing', 'ready', 'picked_up', 'delivered'] as const;
    for (let i = 0; i < path.length - 1; i++) expect(canMove(path[i], path[i + 1])).toBe(true);
  });

  it('refuses skipping steps and going backwards', () => {
    expect(canMove('paid', 'delivered')).toBe(false);
    expect(canMove('delivered', 'cancelled')).toBe(false);
    expect(canMove('accepted', 'cancelled')).toBe(false); // the kitchen has started cooking
    expect(canMove('payment_failed', 'paid')).toBe(false);
  });

  it('final statuses lead nowhere', () => {
    for (const s of FINAL_STATUSES) expect(NEXT_STATUSES[s]).toHaveLength(0);
  });
});
