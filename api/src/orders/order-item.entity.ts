import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

/** A copy of one cart line at order time: later menu changes never rewrite this bill. */
@Entity('order_items')
export class OrderItem {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column('uuid', { name: 'order_id' })
  orderId!: string;

  @Column('uuid', { name: 'menu_item_id' })
  menuItemId!: string;

  @Column('text')
  name!: string;

  @Column('numeric', { name: 'unit_price', precision: 10, scale: 2 })
  unitPrice!: string;

  @Column('int')
  quantity!: number;

  @Column('numeric', { name: 'line_total', precision: 12, scale: 2 })
  lineTotal!: string;
}
