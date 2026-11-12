import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';
import type { OrderStatus } from './order-status';

@Entity('orders')
export class Order {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column('uuid', { name: 'customer_id' })
  customerId!: string;

  @Column('uuid', { name: 'restaurant_id' })
  restaurantId!: string;

  @Column('uuid', { name: 'rider_id', nullable: true })
  riderId!: string | null;

  @Column('text')
  status!: OrderStatus;

  @Column('geography', { name: 'delivery_location', spatialFeatureType: 'Point', srid: 4326 })
  deliveryLocation!: { type: 'Point'; coordinates: [number, number] };

  @Column('int', { name: 'delivery_distance_m' })
  deliveryDistanceM!: number;

  @Column('text', { name: 'coupon_code', nullable: true })
  couponCode!: string | null;

  @Column('numeric', { name: 'items_total', precision: 12, scale: 2 })
  itemsTotal!: string;

  @Column('numeric', { precision: 12, scale: 2, default: 0 })
  discount!: string;

  @Column('numeric', { name: 'delivery_fee', precision: 12, scale: 2 })
  deliveryFee!: string;

  @Column('numeric', { name: 'packaging_fee', precision: 12, scale: 2 })
  packagingFee!: string;

  @Column('numeric', { precision: 12, scale: 2 })
  gst!: string;

  @Column('numeric', { name: 'grand_total', precision: 12, scale: 2 })
  grandTotal!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @Column('timestamptz', { name: 'updated_at' })
  updatedAt!: Date;
}
