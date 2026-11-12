import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { CouponsModule } from './coupons/coupons.module';
import { HealthModule } from './health/health.module';
import { OrdersModule } from './orders/orders.module';
import { PaymentsModule } from './payments/payments.module';
import { RedisModule } from './redis/redis.module';
import { RestaurantsModule } from './restaurants/restaurants.module';
import { RidersModule } from './riders/riders.module';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'postgres',
      url: process.env.DATABASE_URL,
      autoLoadEntities: true,
      synchronize: false, // db/001_init.sql owns the schema
    }),
    RedisModule, // @Global
    AuditModule, // @Global
    AuthModule, // @Global
    HealthModule,
    RestaurantsModule,
    CouponsModule,
    PaymentsModule,
    RidersModule,
    OrdersModule,
  ],
})
export class AppModule {}
