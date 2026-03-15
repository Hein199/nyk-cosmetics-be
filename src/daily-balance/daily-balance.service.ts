import { Injectable } from '@nestjs/common';
import { LedgerType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class DailyBalanceService {
  constructor(private readonly prisma: PrismaService) {}

  private parseDate(date?: string) {
    const toLocalDate = (value: string) => {
      const [year, month, day] = value.split('-').map(Number);
      return new Date(year, month - 1, day);
    };

    if (!date) {
      const now = new Date();
      return new Date(now.getFullYear(), now.getMonth(), now.getDate());
    }

    return toLocalDate(date);
  }

  async closeDay(date?: string) {
    const targetDate = this.parseDate(date);

    const previous = await this.prisma.dailyBalance.findFirst({
      where: { date: { lt: targetDate } },
      orderBy: { date: 'desc' },
    });

    const opening = previous?.closing_balance ?? new Prisma.Decimal(0);

    const [debitAgg, creditAgg] = await Promise.all([
      this.prisma.ledgerEntry.aggregate({
        where: { entry_date: targetDate, type: LedgerType.DEBIT },
        _sum: { amount: true },
      }),
      this.prisma.ledgerEntry.aggregate({
        where: { entry_date: targetDate, type: LedgerType.CREDIT },
        _sum: { amount: true },
      }),
    ]);

    const debit = debitAgg._sum.amount ?? new Prisma.Decimal(0);
    const credit = creditAgg._sum.amount ?? new Prisma.Decimal(0);
    const closing = opening.plus(debit).minus(credit);

    return this.prisma.dailyBalance.upsert({
      where: { date: targetDate },
      update: { opening_balance: opening, closing_balance: closing },
      create: { date: targetDate, opening_balance: opening, closing_balance: closing },
    });
  }

  async findAll(from?: string, to?: string) {
    const where: Prisma.DailyBalanceWhereInput = {};
    if (from || to) {
      where.date = {};
      if (from) {
        (where.date as Prisma.DateTimeFilter).gte = this.parseDate(from);
      }
      if (to) {
        (where.date as Prisma.DateTimeFilter).lte = this.parseDate(to);
      }
    }

    return this.prisma.dailyBalance.findMany({
      where,
      orderBy: { date: 'desc' },
    });
  }
}
