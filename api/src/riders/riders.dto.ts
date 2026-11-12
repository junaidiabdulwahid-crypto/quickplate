import { IsBoolean, IsLatitude, IsLongitude } from 'class-validator';

export class RiderLocationDto {
  @IsLatitude()
  latitude!: number;

  @IsLongitude()
  longitude!: number;

  @IsBoolean()
  available!: boolean; // false = on a trip or offline
}
