import { Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { DailyBalanceService } from './daily-balance.service';

@ApiTags('daily-balance')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('daily-balance')
export class DailyBalanceController {
  constructor(private readonly dailyBalanceService: DailyBalanceService) {}

  @Post('close')
  @Roles(Role.ADMIN)
  close(@Query('date') date?: string) {
    return this.dailyBalanceService.closeDay(date);
  }

  @Get()
  @Roles(Role.ADMIN)
  findAll(@Query('from') from?: string, @Query('to') to?: string) {
    return this.dailyBalanceService.findAll(from, to);
  }
}
