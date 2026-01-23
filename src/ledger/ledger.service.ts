import { Injectable } from '@nestjs/common';
import { LedgerType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class LedgerService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(from?: string, to?: string) {
    const where: Prisma.LedgerEntryWhereInput = {};
    if (from || to) {
      where.entry_date = {};
      if (from) {
        (where.entry_date as Prisma.DateTimeFilter).gte = new Date(from);
      }
      if (to) {
        (where.entry_date as Prisma.DateTimeFilter).lte = new Date(to);
      }
    }

    return this.prisma.ledgerEntry.findMany({
      where,
      orderBy: [{ entry_date: 'desc' }, { id: 'desc' }],
    });
  }

  async getDailySummary(date: string) {
    const entryDate = new Date(date);

    const [debitAgg, creditAgg, dailyBalance] = await Promise.all([
      this.prisma.ledgerEntry.aggregate({
        where: { entry_date: entryDate, type: LedgerType.DEBIT },
        _sum: { amount: true },
      }),
      this.prisma.ledgerEntry.aggregate({
        where: { entry_date: entryDate, type: LedgerType.CREDIT },
        _sum: { amount: true },
      }),
      this.prisma.dailyBalance.findUnique({ where: { date: entryDate } }),
    ]);

    const debit = debitAgg._sum.amount ?? new Prisma.Decimal(0);
    const credit = creditAgg._sum.amount ?? new Prisma.Decimal(0);

    return {
      date: entryDate,
      debit,
      credit,
      opening_balance: dailyBalance?.opening_balance ?? null,
      closing_balance: dailyBalance?.closing_balance ?? null,
    };
  }
}
