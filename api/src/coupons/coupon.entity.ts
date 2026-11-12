import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity('coupons')
export class Coupon {
  @PrimaryColumn('text')
  code!: string; // the code itself is the ID: "WELCOME50"

  @Column('text')
  description!: string;

  @Column('text', { name: 'discount_type' })
  discountType!: 'percent' | 'flat';

  @Column('numeric', { name: 'discount_value', precision: 10, scale: 2 })
  discountValue!: string;

  @Column('numeric', { name: 'max_discount', precision: 10, scale: 2, nullable: true })
  maxDiscount!: string | null;

  @Column('numeric', { name: 'min_order', precision: 10, scale: 2 })
  minOrder!: string;

  @Column('int', { name: 'per_user_limit' })
  perUserLimit!: number;

  @Column('timestamptz', { name: 'valid_until' })
  validUntil!: Date;

  @Column('boolean', { name: 'is_active' })
  isActive!: boolean;
}
