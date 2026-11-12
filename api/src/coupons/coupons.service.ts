import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager, MoreThan } from 'typeorm';
import { paiseToRupees, rupeesToPaise } from '../common/money';
import type { CouponRule } from './bill';
import { Coupon } from './coupon.entity';

export interface CouponView {
  code: string;
  description: string;
  min_order: number;
  valid_until: Date;
}

@Injectable()
export class CouponsService {
  constructor(@InjectDataSource() private readonly db: DataSource) {}

  /** Active coupons, for the cart page. */
  async listActive(): Promise<CouponView[]> {
    const coupons = await this.db.getRepository(Coupon).find({
      where: { isActive: true, validUntil: MoreThan(new Date()) },
      order: { code: 'ASC' },
    });
    return coupons.map((c) => ({ code: c.code, description: c.description, min_order: Number(c.minOrder), valid_until: c.validUntil }));
  }

  /** Checks every coupon rule and returns the rule the bill needs. Throws 400 with a clear reason. */
  async validate(rawCode: string, userId: string, itemsTotalPaise: number, manager: EntityManager): Promise<CouponRule & { code: string }> {
    const code = rawCode.trim().toUpperCase(); // " welcome50 " → "WELCOME50"
    const coupon = await manager.findOneBy(Coupon, { code });
    if (!coupon || !coupon.isActive) throw new BadRequestException('Invalid coupon code'); // rule 1
    if (coupon.validUntil.getTime() <= Date.now()) throw new BadRequestException(`${code} has expired`); // rule 2

    const minOrderPaise = rupeesToPaise(coupon.minOrder);
    if (itemsTotalPaise < minOrderPaise) {
      const short = paiseToRupees(minOrderPaise - itemsTotalPaise).toFixed(2);
      throw new BadRequestException(`Add ₹${short} more to use ${code}`); // rule 3: tell the user how much more
    }

    const [{ used }]: Array<{ used: number }> = await manager.query(
      `SELECT count(*)::int AS used FROM orders
        WHERE customer_id = $1 AND coupon_code = $2 AND status NOT IN ('payment_failed', 'cancelled')`,
      [userId, code],
    );
    if (used >= coupon.perUserLimit) throw new BadRequestException(`You have already used ${code}`); // rule 4

    return {
      code,
      discountType: coupon.discountType,
      discountValue: Number(coupon.discountValue),
      maxDiscountPaise: coupon.maxDiscount === null ? null : rupeesToPaise(coupon.maxDiscount), // rule 5 (the cap) is applied in bill.ts
    };
  }
}
