import { Controller, Get } from '@nestjs/common';
import { CouponsService } from './coupons.service';

@Controller('coupons')
export class CouponsController {
  constructor(private readonly coupons: CouponsService) {}

  @Get() // public
  list() {
    return this.coupons.listActive();
  }
}
