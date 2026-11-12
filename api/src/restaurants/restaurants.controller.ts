import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { AuthUser, CurrentUser, Roles } from '../auth/current-user';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CreateMenuItemDto, CreateRestaurantDto, NearbyQueryDto, UpdateRestaurantDto } from './restaurants.dto';
import { RestaurantsService } from './restaurants.service';

@Controller('restaurants')
export class RestaurantsController {
  constructor(private readonly restaurants: RestaurantsService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  @Roles('restaurant_owner')
  create(@Body() dto: CreateRestaurantDto, @CurrentUser() user: AuthUser) {
    return this.restaurants.create(dto, user.id);
  }

  @Get('nearby') // public
  nearby(@Query() query: NearbyQueryDto) {
    return this.restaurants.nearby(query);
  }

  @Get(':id/menu') // public
  menu(@Param('id', ParseUUIDPipe) id: string) {
    return this.restaurants.menu(id);
  }

  @Post(':id/menu')
  @UseGuards(JwtAuthGuard)
  @Roles('restaurant_owner')
  addMenuItem(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CreateMenuItemDto, @CurrentUser() user: AuthUser) {
    return this.restaurants.addMenuItem(id, dto, user.id);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  @Roles('restaurant_owner')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateRestaurantDto, @CurrentUser() user: AuthUser) {
    return this.restaurants.update(id, dto, user.id);
  }
}
