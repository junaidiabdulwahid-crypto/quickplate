/**
 * The bill, worked out in whole paise. Pure functions: no database, no clock,
 * so every rule can be tested with plain numbers.
 */
export const BILL_RULES = {
  gstPercentOnFood: 5, // GST on food after discount (simplified)
  baseDeliveryPaise: 2000, // ₹20 up to 2 km
  midDeliveryPaise: 3500, // ₹35 up to 5 km
  perExtraKmPaise: 800, // + ₹8 for every started km after 5 km
  freeDeliveryAbovePaise: 49900, // food (after discount) of ₹499 or more: free delivery
  maxDeliveryMetres: 10000, // no delivery beyond 10 km
} as const;

export interface CouponRule {
  discountType: 'percent' | 'flat';
  discountValue: number; // 50 (= 50%) or 75 (= ₹75)
  maxDiscountPaise: number | null; // cap for percent coupons
}

export interface BillInput {
  lines: Array<{ unitPricePaise: number; quantity: number }>;
  coupon: CouponRule | null;
  distanceM: number;
  packagingFeePaise: number;
}

export interface Bill {
  itemsTotal: number;
  discount: number;
  deliveryFee: number;
  packagingFee: number;
  gst: number;
  grandTotal: number;
}

/** The bill as the API sends it: rupees, snake_case. */
export interface BillView {
  items_total: number;
  discount: number;
  delivery_fee: number;
  packaging_fee: number;
  gst: number;
  grand_total: number;
}

function percentOf(paise: number, percent: number): number {
  return Math.round((paise * percent) / 100); // half-up
}

export function couponDiscountPaise(coupon: CouponRule, itemsTotalPaise: number): number {
  let discount =
    coupon.discountType === 'percent' ? percentOf(itemsTotalPaise, coupon.discountValue) : Math.round(coupon.discountValue * 100);
  if (coupon.maxDiscountPaise !== null) discount = Math.min(discount, coupon.maxDiscountPaise);
  return Math.min(discount, itemsTotalPaise); // a coupon never makes food negative
}

export function deliveryFeePaise(distanceM: number, foodAfterDiscountPaise: number): number {
  if (foodAfterDiscountPaise >= BILL_RULES.freeDeliveryAbovePaise) return 0;
  if (distanceM <= 2000) return BILL_RULES.baseDeliveryPaise;
  if (distanceM <= 5000) return BILL_RULES.midDeliveryPaise;
  const extraKm = Math.ceil((distanceM - 5000) / 1000); // 1.2 km = 2 started km
  return BILL_RULES.midDeliveryPaise + extraKm * BILL_RULES.perExtraKmPaise;
}

export function calculateBill(input: BillInput): Bill {
  const itemsTotal = input.lines.reduce((sum, line) => sum + line.unitPricePaise * line.quantity, 0);
  const discount = input.coupon ? couponDiscountPaise(input.coupon, itemsTotal) : 0;
  const food = itemsTotal - discount;
  const deliveryFee = deliveryFeePaise(input.distanceM, food);
  const packagingFee = input.packagingFeePaise;
  const gst = percentOf(food, BILL_RULES.gstPercentOnFood);
  return { itemsTotal, discount, deliveryFee, packagingFee, gst, grandTotal: food + deliveryFee + packagingFee + gst };
}

export function billView(b: Bill): BillView {
  const r = (p: number) => Math.round(p) / 100;
  return {
    items_total: r(b.itemsTotal),
    discount: r(b.discount),
    delivery_fee: r(b.deliveryFee),
    packaging_fee: r(b.packagingFee),
    gst: r(b.gst),
    grand_total: r(b.grandTotal),
  };
}
