import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import { paiseToRupees, rupeesToPaise } from '../common/money';
import { Order } from '../orders/order.entity';
import { moveOrder } from '../orders/order-status';
import { GATEWAY, GatewayError, PaymentGateway } from './gateway.client';
import { Payment } from './payment.entity';
import { CheckoutInfo, GatewayWebhook, VerifyPaymentDto } from './payments.dto';
import { isValidCheckoutSignature, isValidWebhookSignature } from './signatures';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    @InjectDataSource() private readonly db: DataSource,
    private readonly gateway: PaymentGateway,
    private readonly audit: AuditService,
  ) {}

  /** Step 1 (after the order is committed): ask the gateway for a payment order. */
  async startPayment(orderId: string, customerId: string): Promise<CheckoutInfo> {
    const payment = await this.db.getRepository(Payment).findOneByOrFail({ orderId });
    const amountPaise = rupeesToPaise(payment.amount);
    try {
      const gOrder = await this.gateway.createOrder(amountPaise, orderId); // receipt = our order id
      await this.db.getRepository(Payment).update(payment.id, { gatewayOrderId: gOrder.id, status: 'created', updatedAt: new Date() });
      return {
        gateway_order_id: gOrder.id,
        amount_paise: amountPaise,
        currency: 'INR',
        key_id: GATEWAY.keyId,
        checkout_url: `${GATEWAY.url}/checkout/${gOrder.id}`,
      };
    } catch (err) {
      if (!(err instanceof GatewayError)) throw err;
      await this.db.transaction(async (manager) => {
        const order = await manager.findOneByOrFail(Order, { id: orderId });
        await moveOrder(manager, order, 'payment_failed', customerId); // no half-made order left hanging
        await manager.update(Payment, payment.id, { status: 'failed', updatedAt: new Date() });
      });
      this.logger.error(`Could not start payment for order ${orderId}: ${err.message}`);
      throw new ServiceUnavailableException('Payment service is unavailable. Please try again in a minute.');
    }
  }

  /** Step 3a: the app sends back what the checkout page gave it. */
  async verifyCheckout(dto: VerifyPaymentDto, userId: string): Promise<{ order_id: string; status: string }> {
    const ok = isValidCheckoutSignature(dto.razorpay_order_id, dto.razorpay_payment_id, dto.razorpay_signature, GATEWAY.keySecret);
    if (!ok) throw new BadRequestException('Payment signature does not match'); // the seal first

    const payment = await this.db.getRepository(Payment).findOneBy({ gatewayOrderId: dto.razorpay_order_id });
    if (!payment) throw new NotFoundException('Payment not found');
    const order = await this.db.getRepository(Order).findOneByOrFail({ id: payment.orderId });
    if (order.customerId !== userId) throw new ForbiddenException('This is not your order');

    // The checkout page does not say how much was paid; the amount we expect is the one we stored
    const status = await this.markPaid(dto.razorpay_order_id, dto.razorpay_payment_id, rupeesToPaise(payment.amount), userId);
    return { order_id: order.id, status };
  }

  /** Step 3b: the gateway's own server tells ours. Works even if the customer closed the app. */
  async handleWebhook(rawBody: Buffer | undefined, signature: string | undefined, eventId: string | undefined): Promise<{ status: string }> {
    if (!rawBody || !signature || !isValidWebhookSignature(rawBody, signature, GATEWAY.webhookSecret)) {
      throw new BadRequestException('Invalid webhook signature');
    }
    const event = JSON.parse(rawBody.toString('utf8')) as GatewayWebhook;
    const id = eventId ?? `${event.event}:${event.payload.payment.entity.id}`;

    return this.db.transaction(async (manager) => {
      // The same event can arrive twice: the primary key turns the second insert into 0 rows
      const inserted: Array<{ event_id: string }> = await manager.query(
        `INSERT INTO webhook_events (event_id, event_type) VALUES ($1, $2)
         ON CONFLICT (event_id) DO NOTHING RETURNING event_id`,
        [id, event.event],
      );
      if (inserted.length === 0) return { status: 'duplicate' }; // still 200, so the gateway stops retrying

      const p = event.payload.payment.entity;
      if (event.event === 'payment.captured') await this.markPaid(p.order_id, p.id, p.amount, null, manager);
      else if (event.event === 'payment.failed') await this.markFailed(p.order_id, manager);
      return { status: 'ok' }; // the event row and the order change commit together
    });
  }

  /** Both 3a and 3b end here. Safe to call twice: the second call changes nothing. */
  async markPaid(gatewayOrderId: string, gatewayPaymentId: string, amountPaise: number, actorUserId: string | null, outer?: EntityManager): Promise<string> {
    const work = async (manager: EntityManager): Promise<string> => {
      // if verify and the webhook arrive together, one waits here
      const payment = await manager.findOne(Payment, { where: { gatewayOrderId }, lock: { mode: 'pessimistic_write' } });
      if (!payment) throw new NotFoundException('Payment not found');
      const order = await manager.findOneByOrFail(Order, { id: payment.orderId });
      if (payment.status === 'captured' || payment.status === 'refunded') return order.status; // the other path got here first

      if (amountPaise !== rupeesToPaise(payment.amount)) {
        await this.audit.record({ actorUserId, action: 'payment_amount_mismatch', entityType: 'payments', entityId: payment.id }, manager);
        throw new BadRequestException('Paid amount does not match the order');
      }

      await manager.update(Payment, payment.id, { status: 'captured', gatewayPaymentId, updatedAt: new Date() });
      if (order.status === 'pending_payment') {
        await moveOrder(manager, order, 'paid', actorUserId);
      } else {
        // e.g. the customer cancelled, then the money arrived anyway: a person must refund it
        await this.audit.record({ actorUserId, action: 'late_payment_needs_review', entityType: 'orders', entityId: order.id }, manager);
      }
      await this.audit.record({ actorUserId, action: 'capture_payment', entityType: 'payments', entityId: payment.id }, manager);
      return order.status;
    };
    return outer ? work(outer) : this.db.transaction(work); // join the caller's transaction, or open one
  }

  /** The gateway says the payment failed: the order cannot be paid any more. */
  private async markFailed(gatewayOrderId: string, manager: EntityManager): Promise<void> {
    const payment = await manager.findOne(Payment, { where: { gatewayOrderId }, lock: { mode: 'pessimistic_write' } });
    if (!payment || payment.status === 'captured' || payment.status === 'refunded') return;
    await manager.update(Payment, payment.id, { status: 'failed', updatedAt: new Date() });
    const order = await manager.findOneByOrFail(Order, { id: payment.orderId });
    if (order.status === 'pending_payment') await moveOrder(manager, order, 'payment_failed', null);
    await this.audit.record({ actorUserId: null, action: 'fail_payment', entityType: 'payments', entityId: payment.id }, manager);
  }

  /** Money back to the customer. Called by OrdersService inside its transaction, with the order locked. */
  async refund(orderId: string, actorUserId: string, manager: EntityManager): Promise<boolean> {
    const payment = await manager.findOne(Payment, { where: { orderId }, lock: { mode: 'pessimistic_write' } });
    if (!payment || payment.status !== 'captured' || !payment.gatewayPaymentId) return false; // nothing was paid
    try {
      const refund = await this.gateway.refund(payment.gatewayPaymentId, rupeesToPaise(payment.amount)); // money back first…
      await manager.update(Payment, payment.id, { status: 'refunded', gatewayRefundId: refund.id, updatedAt: new Date() }); // …then our record
      await this.audit.record({ actorUserId, action: 'refund_payment', entityType: 'payments', entityId: payment.id }, manager);
      return true;
    } catch (err) {
      if (err instanceof GatewayError) {
        const amount = paiseToRupees(rupeesToPaise(payment.amount)).toFixed(2);
        throw new ServiceUnavailableException(`Refund of ₹${amount} could not be started. The order was not cancelled; please try again.`);
      }
      throw err;
    }
  }
}
