import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import Redis from 'ioredis';
import { DataSource, EntityManager, In } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import type { AuthUser } from '../auth/current-user';
import { User } from '../auth/user.entity';
import { Bill, BILL_RULES, billView, calculateBill } from '../coupons/bill';
import { CouponsService } from '../coupons/coupons.service';
import { paiseToRupees, rupeesToPaise } from '../common/money';
import { Payment } from '../payments/payment.entity';
import { PaymentsService } from '../payments/payments.service';
import { REDIS } from '../redis/redis.module';
import { MenuItem } from '../restaurants/menu-item.entity';
import { Restaurant } from '../restaurants/restaurant.entity';
import { RidersService } from '../riders/riders.service';
import { OrderEvent } from './order-event.entity';
import { OrderItem } from './order-item.entity';
import { MOVED_BY, moveOrder } from './order-status';
import { Order } from './order.entity';
import { ChangeStatusDto, OrderSummary, OrderView, PlacedView, PlaceOrderDto, QuoteView } from './orders.dto';

const IDEMPOTENCY_TTL_SECONDS = 24 * 60 * 60;

interface Priced {
  restaurant: Restaurant;
  lines: Array<{ item: MenuItem; quantity: number }>;
  couponCode: string | null;
  distanceM: number;
  bill: Bill;
}

function storedBill(o: Order): Bill {
  return {
    itemsTotal: rupeesToPaise(o.itemsTotal),
    discount: rupeesToPaise(o.discount),
    deliveryFee: rupeesToPaise(o.deliveryFee),
    packagingFee: rupeesToPaise(o.packagingFee),
    gst: rupeesToPaise(o.gst),
    grandTotal: rupeesToPaise(o.grandTotal),
  };
}

@Injectable()
export class OrdersService {
  constructor(
    @InjectDataSource() private readonly db: DataSource,
    @Inject(REDIS) private readonly redis: Redis,
    private readonly coupons: CouponsService,
    private readonly payments: PaymentsService,
    private readonly riders: RidersService,
    private readonly audit: AuditService,
  ) {}

  /** Reads every price from the database and builds the bill. The phone never sends prices. */
  private async price(dto: PlaceOrderDto, userId: string, manager: EntityManager): Promise<Priced> {
    const restaurant = await manager.findOneBy(Restaurant, { id: dto.restaurant_id });
    if (!restaurant) throw new NotFoundException('Restaurant not found');
    if (!restaurant.isOpen) throw new BadRequestException('Restaurant is closed right now');

    const ids = dto.items.map((l) => l.menu_item_id);
    if (new Set(ids).size !== ids.length) throw new BadRequestException('Each dish can appear only once; change its quantity instead');
    const items = await manager.findBy(MenuItem, { id: In(ids), restaurantId: restaurant.id, isAvailable: true });
    if (items.length !== ids.length) throw new BadRequestException('Some dishes are not available any more');
    const byId = new Map(items.map((i) => [i.id, i]));
    const lines = dto.items.map((l) => ({ item: byId.get(l.menu_item_id)!, quantity: l.quantity }));

    const [{ distance }]: Array<{ distance: number }> = await manager.query(
      `SELECT ST_Distance(location, ST_MakePoint($2, $3)::geography)::int AS distance FROM restaurants WHERE id = $1`,
      [restaurant.id, dto.longitude, dto.latitude],
    );
    if (distance > BILL_RULES.maxDeliveryMetres) {
      throw new BadRequestException(`This restaurant does not deliver this far (${(distance / 1000).toFixed(1)} km; the limit is 10 km)`);
    }

    const linesPaise = lines.map((l) => ({ unitPricePaise: rupeesToPaise(l.item.price), quantity: l.quantity }));
    const itemsTotal = linesPaise.reduce((sum, l) => sum + l.unitPricePaise * l.quantity, 0);
    const coupon = dto.coupon_code ? await this.coupons.validate(dto.coupon_code, userId, itemsTotal, manager) : null;
    const bill = calculateBill({ lines: linesPaise, coupon, distanceM: distance, packagingFeePaise: rupeesToPaise(restaurant.packagingFee) });
    return { restaurant, lines, couponCode: coupon?.code ?? null, distanceM: distance, bill };
  }

  /** The bill for a cart; nothing is saved. Shares price() with place(), so the quote and the charge never differ. */
  async quote(dto: PlaceOrderDto, userId: string): Promise<QuoteView> {
    const p = await this.price(dto, userId, this.db.manager);
    return { restaurant_id: p.restaurant.id, distance_m: p.distanceM, coupon_code: p.couponCode, bill: billView(p.bill) };
  }

  /** Save the order, then ask the gateway for a payment. An Idempotency-Key makes a double tap harmless. */
  async place(dto: PlaceOrderDto, userId: string, idempotencyKey?: string): Promise<PlacedView> {
    const idemKey = idempotencyKey ? `idem:order:${userId}:${idempotencyKey.slice(0, 100)}` : null;
    if (idemKey) {
      const claimed = await this.redis.set(idemKey, 'processing', 'EX', IDEMPOTENCY_TTL_SECONDS, 'NX'); // only the first gets "OK"
      if (claimed !== 'OK') {
        const previous = await this.redis.get(idemKey);
        if (previous && previous !== 'processing') return JSON.parse(previous) as PlacedView; // same answer as the first time
        throw new ConflictException('This order is already being placed');
      }
    }

    try {
      const order = await this.db.transaction(async (manager) => {
        const p = await this.price(dto, userId, manager);
        const b = p.bill;
        const saved = await manager.save(
          manager.create(Order, {
            customerId: userId,
            restaurantId: p.restaurant.id,
            status: 'pending_payment',
            deliveryLocation: { type: 'Point', coordinates: [dto.longitude, dto.latitude] },
            deliveryDistanceM: p.distanceM,
            couponCode: p.couponCode,
            itemsTotal: paiseToRupees(b.itemsTotal).toFixed(2),
            discount: paiseToRupees(b.discount).toFixed(2),
            deliveryFee: paiseToRupees(b.deliveryFee).toFixed(2),
            packagingFee: paiseToRupees(b.packagingFee).toFixed(2),
            gst: paiseToRupees(b.gst).toFixed(2),
            grandTotal: paiseToRupees(b.grandTotal).toFixed(2),
            updatedAt: new Date(),
          }),
        );
        await manager.insert(
          OrderItem,
          p.lines.map((l) => ({
            orderId: saved.id,
            menuItemId: l.item.id,
            name: l.item.name, // copied: a later rename never changes this bill
            unitPrice: l.item.price, // copied: a later price change never changes this bill
            quantity: l.quantity,
            lineTotal: paiseToRupees(rupeesToPaise(l.item.price) * l.quantity).toFixed(2),
          })),
        );
        await manager.insert(OrderEvent, { orderId: saved.id, fromStatus: null, toStatus: 'pending_payment', actorUserId: userId });
        await manager.insert(Payment, { orderId: saved.id, amount: saved.grandTotal, status: 'pending', updatedAt: new Date() });
        await this.audit.record({ actorUserId: userId, action: 'place_order', entityType: 'orders', entityId: saved.id }, manager);
        return saved;
      });

      // Outside the transaction: never hold database locks while waiting for another company's server
      const payment = await this.payments.startPayment(order.id, userId);
      const response: PlacedView = { order_id: order.id, status: 'pending_payment', bill: billView(storedBill(order)), payment };
      if (idemKey) await this.redis.set(idemKey, JSON.stringify(response), 'EX', IDEMPOTENCY_TTL_SECONDS);
      return response;
    } catch (err) {
      if (idemKey) await this.redis.del(idemKey); // failed: the customer may retry with the same key
      throw err;
    }
  }

  /** Customer, restaurant owner or assigned rider; 404 for everyone else (don't even admit it exists). */
  private async loadForUser(orderId: string, user: AuthUser, manager: EntityManager, lock = false): Promise<{ order: Order; restaurant: Restaurant }> {
    const order = await manager.findOne(Order, { where: { id: orderId }, ...(lock ? { lock: { mode: 'pessimistic_write' as const } } : {}) });
    if (!order) throw new NotFoundException('Order not found');
    const restaurant = await manager.findOneByOrFail(Restaurant, { id: order.restaurantId });
    const allowed =
      (user.role === 'customer' && order.customerId === user.id) ||
      (user.role === 'restaurant_owner' && restaurant.ownerId === user.id) ||
      (user.role === 'rider' && order.riderId === user.id);
    if (!allowed) throw new NotFoundException('Order not found');
    return { order, restaurant };
  }

  /** Everything the tracking page needs, in one request. */
  async get(orderId: string, user: AuthUser): Promise<OrderView> {
    const { order, restaurant } = await this.loadForUser(orderId, user, this.db.manager);
    const [items, events, rider] = await Promise.all([
      this.db.getRepository(OrderItem).find({ where: { orderId }, order: { name: 'ASC' } }),
      this.db.getRepository(OrderEvent).find({ where: { orderId }, order: { id: 'ASC' } }),
      this.riderView(order.riderId),
    ]);
    return {
      id: order.id,
      status: order.status,
      restaurant: { id: restaurant.id, name: restaurant.name },
      items: items.map((i) => ({ name: i.name, unit_price: Number(i.unitPrice), quantity: i.quantity, line_total: Number(i.lineTotal) })),
      coupon_code: order.couponCode,
      bill: billView(storedBill(order)),
      timeline: events.map((e) => ({ status: e.toStatus, at: e.createdAt })),
      rider,
      created_at: order.createdAt,
    };
  }

  private async riderView(riderId: string | null): Promise<OrderView['rider']> {
    if (!riderId) return null;
    const [user, pos] = await Promise.all([this.db.getRepository(User).findOneBy({ id: riderId }), this.riders.position(riderId)]);
    if (!user || !pos) return null;
    return { name: user.name || 'Your rider', ...pos };
  }

  /** Customers see their orders, owners their restaurants' orders, riders their trips. Newest first. */
  async listMine(user: AuthUser): Promise<OrderSummary[]> {
    const where =
      user.role === 'customer' ? 'o.customer_id = $1' : user.role === 'rider' ? 'o.rider_id = $1' : 'r.owner_id = $1';
    const rows: Array<{ id: string; status: OrderSummary['status']; restaurant_name: string; grand_total: string; created_at: Date }> =
      await this.db.query(
        `SELECT o.id, o.status, r.name AS restaurant_name, o.grand_total, o.created_at
           FROM orders o JOIN restaurants r ON r.id = o.restaurant_id
          WHERE ${where}
          ORDER BY o.created_at DESC
          LIMIT 50`,
        [user.id],
      );
    return rows.map((r) => ({ ...r, grand_total: Number(r.grand_total) }));
  }

  /** The restaurant moves food forward; the rider moves the trip forward. */
  async changeStatus(orderId: string, dto: ChangeStatusDto, user: AuthUser) {
    const result = await this.db.transaction(async (manager) => {
      const { order, restaurant } = await this.loadForUser(orderId, user, manager, true); // FOR UPDATE
      const mover = MOVED_BY[dto.status];
      if (mover !== user.role) {
        throw new ForbiddenException(`Only the ${mover === 'rider' ? 'rider' : 'restaurant'} can mark an order as ${dto.status}`);
      }
      await moveOrder(manager, order, dto.status, user.id);

      let riderAssigned: boolean | undefined;
      if (dto.status === 'ready' && !order.riderId) {
        const [lng, lat] = restaurant.location.coordinates;
        const riderId = await this.riders.claimNearest(lat, lng);
        riderAssigned = riderId !== null;
        if (riderId) {
          order.riderId = riderId;
          await manager.save(order);
          await this.audit.record({ actorUserId: user.id, action: 'assign_rider', entityType: 'orders', entityId: order.id }, manager);
        }
      }
      return { order, riderAssigned };
    });
    if (dto.status === 'delivered' && result.order.riderId) await this.riders.release(result.order.riderId); // free again
    return { id: result.order.id, status: result.order.status, rider_assigned: result.riderAssigned };
  }

  /** Before the kitchen starts: the customer may cancel; the restaurant may reject. Paid orders are refunded first. */
  async cancel(orderId: string, user: AuthUser) {
    return this.db.transaction(async (manager) => {
      const { order } = await this.loadForUser(orderId, user, manager, true);
      const customerMayCancel = user.role === 'customer' && (order.status === 'pending_payment' || order.status === 'paid');
      const restaurantMayReject = user.role === 'restaurant_owner' && order.status === 'paid';
      if (!customerMayCancel && !restaurantMayReject) {
        throw new ConflictException(`An order that is ${order.status} cannot be cancelled`);
      }
      const refunded = await this.payments.refund(order.id, user.id, manager); // 503 if the gateway is down: nothing changes
      await moveOrder(manager, order, 'cancelled', user.id);
      await this.audit.record({ actorUserId: user.id, action: 'cancel_order', entityType: 'orders', entityId: order.id }, manager);
      return { id: order.id, status: order.status, refunded };
    });
  }
}
