import { Controller, Get, Inject, ServiceUnavailableException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import Redis from 'ioredis';
import { DataSource } from 'typeorm';
import { REDIS } from '../redis/redis.module';

@Controller('health')
export class HealthController {
  constructor(
    @InjectDataSource() private readonly db: DataSource,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  /** For load balancers: 200 only when both the database and Redis answer. */
  @Get()
  async check() {
    const [database, redis] = await Promise.all([
      this.db.query('SELECT 1').then(() => 'up' as const, () => 'down' as const),
      this.redis.ping().then(() => 'up' as const, () => 'down' as const),
    ]);
    if (database === 'down' || redis === 'down') throw new ServiceUnavailableException({ message: 'Not ready', database, redis });
    return { status: 'ok', database, redis };
  }
}
