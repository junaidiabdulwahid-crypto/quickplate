import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { AuthUser, CurrentUser, Roles } from '../auth/current-user';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RiderLocationDto } from './riders.dto';
import { RidersService } from './riders.service';

@Controller('riders')
@UseGuards(JwtAuthGuard)
@Roles('rider') // every route below is riders-only
export class RidersController {
  constructor(private readonly riders: RidersService) {}

  @Post('me/location')
  @HttpCode(204)
  async location(@Body() dto: RiderLocationDto, @CurrentUser() user: AuthUser): Promise<void> {
    await this.riders.updateLocation(user.id, dto.latitude, dto.longitude, dto.available);
  }
}
