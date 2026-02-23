import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CreateLedgerEntryDto } from './dto/create-ledger-entry.dto';
import { LedgerService } from './ledger.service';

@ApiTags('ledger')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('ledger')
export class LedgerController {
  constructor(private readonly ledgerService: LedgerService) {}

  @Get()
  @Roles(Role.ADMIN)
  findAll(@Query('from') from?: string, @Query('to') to?: string) {
    return this.ledgerService.findAll(from, to);
  }

  @Post()
  @Roles(Role.ADMIN)
  create(@Body() dto: CreateLedgerEntryDto) {
    return this.ledgerService.create(dto);
  }

  @Put(':id')
  @Roles(Role.ADMIN)
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: CreateLedgerEntryDto) {
    return this.ledgerService.update(id, dto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.ledgerService.remove(id);
  }

  @Get('daily-summary')
  @Roles(Role.ADMIN)
  dailySummary(@Query('date') date: string) {
    return this.ledgerService.getDailySummary(date);
  }
}
