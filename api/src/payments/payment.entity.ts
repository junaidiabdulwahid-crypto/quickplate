import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

export type PaymentStatus = 'pending' | 'created' | 'captured' | 'failed' | 'refunded';

@Entity('payments')
export class Payment {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column('uuid', { name: 'order_id', unique: true })
  orderId!: string;

  @Column('text', { name: 'gateway_order_id', nullable: true })
  gatewayOrderId!: string | null;

  @Column('text', { name: 'gateway_payment_id', nullable: true })
  gatewayPaymentId!: string | null;

  @Column('text', { name: 'gateway_refund_id', nullable: true })
  gatewayRefundId!: string | null;

  @Column('numeric', { precision: 12, scale: 2 })
  amount!: string;

  @Column('text')
  status!: PaymentStatus;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @Column('timestamptz', { name: 'updated_at' })
  updatedAt!: Date;
}
