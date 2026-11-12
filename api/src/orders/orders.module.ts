import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../auth/user.entity';
import { CouponsModule } from '../coupons/coupons.module';
import { Payment } from '../payments/payment.entity';
import { PaymentsModule } from '../payments/payments.module';
import { MenuItem } from '../restaurants/menu-item.entity';
import { Restaurant } from '../restaurants/restaurant.entity';
import { RidersModule } from '../riders/riders.module';
import { OrderEvent } from './order-event.entity';
import { OrderItem } from './order-item.entity';
import { Order } from './order.entity';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Order, OrderItem, OrderEvent, Payment, Restaurant, MenuItem, User]),
    CouponsModule,
    PaymentsModule,
    RidersModule,
  ],
  controllers: [OrdersController],
  providers: [OrdersService],
})
export class OrdersModule {}
