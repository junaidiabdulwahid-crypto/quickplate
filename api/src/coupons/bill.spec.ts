import { calculateBill, couponDiscountPaise, deliveryFeePaise } from './bill';

describe('bill', () => {
  it('adds lines, GST on food, delivery and packaging', () => {
    // 2 x ₹180 paneer + 3 x ₹40 roti = ₹480; 3.2 km away; ₹15 packaging; no coupon
    const bill = calculateBill({
      lines: [{ unitPricePaise: 18000, quantity: 2 }, { unitPricePaise: 4000, quantity: 3 }],
      coupon: null,
      distanceM: 3200,
      packagingFeePaise: 1500,
    });
    expect(bill).toEqual({ itemsTotal: 48000, discount: 0, deliveryFee: 3500, packagingFee: 1500, gst: 2400, grandTotal: 55400 });
  });

  it('caps a percent coupon and never makes food negative', () => {
    const welcome50 = { discountType: 'percent' as const, discountValue: 50, maxDiscountPaise: 10000 };
    expect(couponDiscountPaise(welcome50, 48000)).toBe(10000); // 50% of ₹480 = ₹240, capped at ₹100
    expect(couponDiscountPaise({ discountType: 'flat', discountValue: 75, maxDiscountPaise: null }, 5000)).toBe(5000);
  });

  it('charges delivery by distance, free above ₹499 of food', () => {
    expect(deliveryFeePaise(1500, 20000)).toBe(2000);
    expect(deliveryFeePaise(6200, 20000)).toBe(3500 + 2 * 800); // 1.2 extra km = 2 started km
    expect(deliveryFeePaise(9000, 49900)).toBe(0);
  });
});
