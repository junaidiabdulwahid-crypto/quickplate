import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('menu_items')
export class MenuItem {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column('uuid', { name: 'restaurant_id' })
  restaurantId!: string;

  @Column('text')
  name!: string;

  @Column('numeric', { precision: 10, scale: 2 })
  price!: string;

  @Column('boolean', { name: 'is_veg', default: true })
  isVeg!: boolean;

  @Column('boolean', { name: 'is_available', default: true })
  isAvailable!: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
