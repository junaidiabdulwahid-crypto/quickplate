import { Body, Controller, Get, Headers, HttpCode, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { AuthUser, CurrentUser, Roles } from '../auth/current-user';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ChangeStatusDto, PlaceOrderDto } from './orders.dto';
import { OrdersService } from './orders.service';

@Controller('orders')
@UseGuards(JwtAuthGuard) // every order route needs a signed-in user
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Post('quote')
  @HttpCode(200)
  @Roles('customer')
  quote(@Body() dto: PlaceOrderDto, @CurrentUser() user: AuthUser) {
    return this.orders.quote(dto, user.id);
  }

  @Post()
  @Roles('customer')
  place(@Body() dto: PlaceOrderDto, @CurrentUser() user: AuthUser, @Headers('idempotency-key') idempotencyKey?: string) {
    return this.orders.place(dto, user.id, idempotencyKey);
  }

  @Get()
  mine(@CurrentUser() user: AuthUser) {
    return this.orders.listMine(user);
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.orders.get(id, user);
  }

  @Post(':id/status')
  @HttpCode(200)
  @Roles('restaurant_owner', 'rider') // the service decides who moves which step
  changeStatus(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ChangeStatusDto, @CurrentUser() user: AuthUser) {
    return this.orders.changeStatus(id, dto, user);
  }

  @Post(':id/cancel')
  @HttpCode(200)
  @Roles('customer', 'restaurant_owner')
  cancel(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.orders.cancel(id, user);
  }
}
