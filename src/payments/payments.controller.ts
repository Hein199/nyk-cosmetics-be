import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { PaymentsService } from './payments.service';

@ApiTags('payments')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) { }

  @Post()
  @Roles(Role.ADMIN, Role.SALESPERSON)
  create(@Req() req: any, @Body() dto: CreatePaymentDto) {
    return this.paymentsService.create(req.user.id, dto);
  }

  @Get()
  @Roles(Role.ADMIN, Role.SALESPERSON)
  findAll(@Req() req: any, @Query('outstanding') outstanding?: string) {
    return this.paymentsService.findAll(req.user, outstanding === 'true');
  }

  @Post(':id/confirm')
  @Roles(Role.ADMIN)
  confirm(@Param('id') id: string) {
    return this.paymentsService.confirmPayment(id);
  }
}
