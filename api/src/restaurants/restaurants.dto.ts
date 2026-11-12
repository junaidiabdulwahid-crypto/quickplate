import { Type } from 'class-transformer';
import {
  IsBoolean, IsInt, IsLatitude, IsLongitude, IsNotEmpty, IsNumber, IsOptional, IsString, Max, MaxLength, Min,
} from 'class-validator';

export class CreateRestaurantDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(40)
  cuisine!: string;

  @IsLatitude()
  latitude!: number;

  @IsLongitude()
  longitude!: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  packaging_fee?: number;
}

export class UpdateRestaurantDto {
  @IsBoolean()
  is_open!: boolean;
}

export class CreateMenuItemDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  name!: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(1)
  @Max(5000)
  price!: number;

  @IsBoolean()
  is_veg!: boolean;
}

export class NearbyQueryDto {
  @Type(() => Number)
  @IsLatitude()
  lat!: number;

  @Type(() => Number)
  @IsLongitude()
  lng!: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(500)
  @Max(10000)
  radius_m: number = 5000; // 5 km if not sent
}

export interface NearbyRestaurant {
  id: string;
  name: string;
  cuisine: string;
  distance_m: number;
}

export interface MenuView {
  restaurant: { id: string; name: string; cuisine: string; is_open: boolean };
  items: Array<{ id: string; name: string; price: number; is_veg: boolean }>;
}
