import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

/** One row per status change: the tracking timeline. */
@Entity('order_events')
export class OrderEvent {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id!: string; // BIGSERIAL arrives as a string

  @Column('uuid', { name: 'order_id' })
  orderId!: string;

  @Column('text', { name: 'from_status', nullable: true })
  fromStatus!: string | null;

  @Column('text', { name: 'to_status' })
  toStatus!: string;

  @Column('uuid', { name: 'actor_user_id', nullable: true })
  actorUserId!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
