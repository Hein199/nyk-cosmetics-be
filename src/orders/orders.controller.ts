import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CreateOrderDto } from './dto/create-order.dto';
import { OrdersService } from './orders.service';

@ApiTags('orders')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) { }

  @Post()
  @Roles(Role.SALESPERSON)
  create(@Req() req: any, @Body() dto: CreateOrderDto) {
    return this.ordersService.create(req.user.id, dto);
  }

  @Get()
  @Roles(Role.ADMIN, Role.SALESPERSON)
  findAll(@Req() req: any) {
    return this.ordersService.findAll(req.user);
  }

  @Get('outstanding')
  @Roles(Role.ADMIN, Role.SALESPERSON)
  findOutstanding(@Req() req: any) {
    return this.ordersService.findOutstanding(req.user);
  }

  @Get(':id')
  @Roles(Role.ADMIN, Role.SALESPERSON)
  findOne(@Req() req: any, @Param('id') id: string) {
    return this.ordersService.findOne(req.user, id);
  }

  @Post(':id/confirm')
  @Roles(Role.ADMIN)
  confirm(@Param('id') id: string) {
    return this.ordersService.confirmOrder(id);
  }

  @Post(':id/cancel')
  @Roles(Role.ADMIN)
  cancel(@Param('id') id: string) {
    return this.ordersService.cancelOrder(id);
  }

  @Post(':id/deliver')
  @Roles(Role.ADMIN)
  deliver(@Param('id') id: string) {
    return this.ordersService.deliverOrder(id);
  }
}
