import { Inject, Injectable } from '@nestjs/common';
import Redis from 'ioredis';
import { REDIS } from '../redis/redis.module';

const GEO_KEY = 'riders:geo';
const FREE_KEY = 'riders:available';
export const RIDER_SEARCH_KM = 5;

/** Rider positions live in Redis GEO: they change every few seconds and need no history. */
@Injectable()
export class RidersService {
  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  /** A rider's phone calls this every few seconds while online. */
  async updateLocation(riderId: string, lat: number, lng: number, available: boolean): Promise<void> {
    await this.redis.geoadd(GEO_KEY, lng, lat, riderId); // GEOADD wants longitude first, like PostGIS
    if (available) await this.redis.sadd(FREE_KEY, riderId);
    else await this.redis.srem(FREE_KEY, riderId);
  }

  async position(riderId: string): Promise<{ latitude: number; longitude: number } | null> {
    const [pos] = await this.redis.geopos(GEO_KEY, riderId);
    if (!pos) return null;
    // positions come back as a geohash with tiny noise: round to ~1 m
    return { longitude: Number(Number(pos[0]).toFixed(5)), latitude: Number(Number(pos[1]).toFixed(5)) };
  }

  /**
   * Nearest free rider within 5 km of the restaurant. SREM is the claim: it removes the
   * rider from the free set and answers 1 for exactly one caller, even if two orders ask at once.
   */
  async claimNearest(lat: number, lng: number): Promise<string | null> {
    const nearby = (await this.redis.geosearch(GEO_KEY, 'FROMLONLAT', lng, lat, 'BYRADIUS', RIDER_SEARCH_KM, 'km', 'ASC', 'COUNT', 20)) as string[];
    for (const riderId of nearby) {
      if ((await this.redis.srem(FREE_KEY, riderId)) === 1) return riderId;
    }
    return null;
  }

  /** After a delivery the rider is free again. */
  async release(riderId: string): Promise<void> {
    await this.redis.sadd(FREE_KEY, riderId);
  }
}
