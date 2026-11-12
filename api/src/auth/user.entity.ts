import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

export const ROLES = ['customer', 'restaurant_owner', 'rider'] as const; // one list: the DTO's @IsIn and the type
export type Role = (typeof ROLES)[number];

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column('text', { unique: true })
  phone!: string;

  @Column('text', { default: '' })
  name!: string;

  @Column('text')
  role!: Role;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
