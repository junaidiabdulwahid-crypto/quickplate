import { ConflictException } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import type { Role } from '../auth/user.entity';
import { OrderEvent } from './order-event.entity';
import type { Order } from './order.entity';

export const ORDER_STATUSES = [
  'pending_payment', 'payment_failed', 'paid', 'accepted', 'preparing', 'ready', 'picked_up', 'delivered', 'cancelled',
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

/** The only moves an order can make. Anything else is a bug or a trick. */
export const NEXT_STATUSES: Record<OrderStatus, readonly OrderStatus[]> = {
  pending_payment: ['paid', 'payment_failed', 'cancelled'],
  payment_failed: [],
  paid: ['accepted', 'cancelled'],
  accepted: ['preparing'],
  preparing: ['ready'],
  ready: ['picked_up'],
  picked_up: ['delivered'],
  delivered: [],
  cancelled: [],
};

/** Who moves an order forward by hand (payments and cancellations have their own routes). */
export const MOVED_BY: Partial<Record<OrderStatus, Role>> = {
  accepted: 'restaurant_owner',
  preparing: 'restaurant_owner',
  ready: 'restaurant_owner',
  picked_up: 'rider',
  delivered: 'rider',
};

export const FINAL_STATUSES: readonly OrderStatus[] = ['payment_failed', 'delivered', 'cancelled'];

export function canMove(from: OrderStatus, to: OrderStatus): boolean {
  return NEXT_STATUSES[from].includes(to);
}

/** Changes the status and writes the timeline row, inside the caller's transaction. */
export async function moveOrder(manager: EntityManager, order: Order, to: OrderStatus, actorUserId: string | null): Promise<Order> {
  const from = order.status;
  if (!canMove(from, to)) throw new ConflictException(`Cannot move an order from ${from} to ${to}`);
  order.status = to;
  order.updatedAt = new Date();
  await manager.save(order);
  await manager.insert(OrderEvent, { orderId: order.id, fromStatus: from, toStatus: to, actorUserId });
  return order;
}
