import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import { MenuItem } from './menu-item.entity';
import { Restaurant } from './restaurant.entity';
import { CreateMenuItemDto, CreateRestaurantDto, MenuView, NearbyQueryDto, NearbyRestaurant, UpdateRestaurantDto } from './restaurants.dto';

@Injectable()
export class RestaurantsService {
  constructor(
    @InjectDataSource() private readonly db: DataSource,
    private readonly audit: AuditService,
  ) {}

  async create(dto: CreateRestaurantDto, ownerId: string): Promise<Restaurant> {
    return this.db.transaction(async (manager) => {
      const restaurant = await manager.save(
        manager.create(Restaurant, {
          ownerId,
          name: dto.name.trim(),
          cuisine: dto.cuisine.trim(),
          location: { type: 'Point', coordinates: [dto.longitude, dto.latitude] },
          packagingFee: (dto.packaging_fee ?? 15).toFixed(2),
        }),
      );
      await this.audit.record({ actorUserId: ownerId, action: 'create_restaurant', entityType: 'restaurants', entityId: restaurant.id }, manager);
      return restaurant;
    });
  }

  /** Open restaurants within radius_m metres, nearest first. */
  async nearby(q: NearbyQueryDto): Promise<NearbyRestaurant[]> {
    const rows: Array<{ id: string; name: string; cuisine: string; distance_m: string }> = await this.db.query(
      `SELECT id, name, cuisine,
              ST_Distance(location, ST_MakePoint($2, $1)::geography) AS distance_m
         FROM restaurants
        WHERE is_open AND ST_DWithin(location, ST_MakePoint($2, $1)::geography, $3)
        ORDER BY distance_m
        LIMIT 50`,
      [q.lat, q.lng, q.radius_m],
    );
    return rows.map((r) => ({ ...r, distance_m: Math.round(Number(r.distance_m)) }));
  }

  async menu(restaurantId: string): Promise<MenuView> {
    const restaurant = await this.db.getRepository(Restaurant).findOneBy({ id: restaurantId });
    if (!restaurant) throw new NotFoundException('Restaurant not found');
    const items = await this.db.getRepository(MenuItem).find({
      where: { restaurantId, isAvailable: true }, // a sold-out dish disappears from the menu
      order: { name: 'ASC' },
    });
    return {
      restaurant: { id: restaurant.id, name: restaurant.name, cuisine: restaurant.cuisine, is_open: restaurant.isOpen },
      items: items.map((i) => ({ id: i.id, name: i.name, price: Number(i.price), is_veg: i.isVeg })),
    };
  }

  /** Only the restaurant's owner may add dishes. */
  async addMenuItem(restaurantId: string, dto: CreateMenuItemDto, userId: string): Promise<MenuItem> {
    return this.db.transaction(async (manager) => {
      const restaurant = await manager.findOneBy(Restaurant, { id: restaurantId });
      if (!restaurant) throw new NotFoundException('Restaurant not found');
      if (restaurant.ownerId !== userId) throw new ForbiddenException('Only the restaurant owner can change the menu');

      const item = await manager.save(
        manager.create(MenuItem, { restaurantId, name: dto.name.trim(), price: dto.price.toFixed(2), isVeg: dto.is_veg }),
      );
      await this.audit.record({ actorUserId: userId, action: 'create_menu_item', entityType: 'menu_items', entityId: item.id }, manager);
      return item;
    });
  }

  /** Open or close the restaurant; a closed one disappears from "nearby" and takes no orders. */
  async update(restaurantId: string, dto: UpdateRestaurantDto, userId: string): Promise<{ id: string; is_open: boolean }> {
    return this.db.transaction(async (manager) => {
      const restaurant = await manager.findOne(Restaurant, { where: { id: restaurantId }, lock: { mode: 'pessimistic_write' } });
      if (!restaurant) throw new NotFoundException('Restaurant not found');
      if (restaurant.ownerId !== userId) throw new ForbiddenException('Only the restaurant owner can change this restaurant');

      await manager.update(Restaurant, restaurantId, { isOpen: dto.is_open });
      await this.audit.record(
        { actorUserId: userId, action: dto.is_open ? 'open_restaurant' : 'close_restaurant', entityType: 'restaurants', entityId: restaurantId },
        manager,
      );
      return { id: restaurantId, is_open: dto.is_open };
    });
  }
}
