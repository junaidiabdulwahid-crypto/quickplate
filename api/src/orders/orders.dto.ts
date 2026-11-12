import { Type } from 'class-transformer';
import {
  ArrayMaxSize, ArrayMinSize, IsIn, IsInt, IsLatitude, IsLongitude, IsOptional, IsString, IsUUID, Max, MaxLength, Min, ValidateNested,
} from 'class-validator';
import type { BillView } from '../coupons/bill';
import type { CheckoutInfo } from '../payments/payments.dto';
import type { OrderStatus } from './order-status';

export class OrderLineDto {
  @IsUUID()
  menu_item_id!: string;

  @IsInt()
  @Min(1)
  @Max(20)
  quantity!: number;
}

/** The cart, as the phone sends it. No prices: the server reads prices from the database. */
export class PlaceOrderDto {
  @IsUUID()
  restaurant_id!: string;

  @ValidateNested({ each: true })
  @Type(() => OrderLineDto)
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  items!: OrderLineDto[];

  @IsOptional()
  @IsString()
  @MaxLength(20)
  coupon_code?: string;

  @IsLatitude()
  latitude!: number;

  @IsLongitude()
  longitude!: number;
}

export const HAND_MOVED = ['accepted', 'preparing', 'ready', 'picked_up', 'delivered'] as const;

export class ChangeStatusDto {
  @IsIn(HAND_MOVED)
  status!: (typeof HAND_MOVED)[number];
}

export interface QuoteView {
  restaurant_id: string;
  distance_m: number;
  coupon_code: string | null;
  bill: BillView;
}

export interface PlacedView {
  order_id: string;
  status: OrderStatus;
  bill: BillView;
  payment: CheckoutInfo;
}

export interface OrderView {
  id: string;
  status: OrderStatus;
  restaurant: { id: string; name: string };
  items: Array<{ name: string; unit_price: number; quantity: number; line_total: number }>;
  coupon_code: string | null;
  bill: BillView;
  timeline: Array<{ status: string; at: Date }>;
  rider: { name: string; latitude: number; longitude: number } | null;
  created_at: Date;
}

export interface OrderSummary {
  id: string;
  status: OrderStatus;
  restaurant_name: string;
  grand_total: number;
  created_at: Date;
}
