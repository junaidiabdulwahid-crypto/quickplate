import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('restaurants')
export class Restaurant {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column('uuid', { name: 'owner_id' })
  ownerId!: string;

  @Column('text')
  name!: string;

  @Column('text')
  cuisine!: string;

  @Column('geography', { spatialFeatureType: 'Point', srid: 4326 })
  location!: { type: 'Point'; coordinates: [number, number] }; // [lng, lat]

  @Column('numeric', { name: 'packaging_fee', precision: 10, scale: 2, default: 15 })
  packagingFee!: string;

  @Column('boolean', { name: 'is_open', default: true })
  isOpen!: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
