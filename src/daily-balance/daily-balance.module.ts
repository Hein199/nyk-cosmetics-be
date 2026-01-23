import { Module } from '@nestjs/common';
import { DailyBalanceController } from './daily-balance.controller';
import { DailyBalanceService } from './daily-balance.service';

@Module({
  controllers: [DailyBalanceController],
  providers: [DailyBalanceService],
})
export class DailyBalanceModule {}
