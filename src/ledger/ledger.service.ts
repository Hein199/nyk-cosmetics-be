import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { LedgerCategory, LedgerType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateLedgerEntryDto } from './dto/create-ledger-entry.dto';

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

    const entries = await this.prisma.ledgerEntry.findMany({
      where,
      orderBy: [{ entry_date: 'asc' }, { id: 'asc' }],
    });

    // Enrich payment entries (SALE category) with customer name + order id
    const paymentRefIds = entries
      .filter((e) => e.category === LedgerCategory.SALE && e.reference_id !== 0)
      .map((e) => e.reference_id);

    const paymentMap = new Map<number, { customer_name: string; order_id: number | null }>();
    if (paymentRefIds.length > 0) {
      const payments = await this.prisma.payment.findMany({
        where: { id: { in: paymentRefIds } },
        include: { customer: { select: { name: true } }, order: { select: { id: true } } },
      });
      for (const p of payments) {
        paymentMap.set(p.id, {
          customer_name: p.customer.name,
          order_id: p.order?.id ?? null,
        });
      }
    }

    // Enrich expense entries with expense description/category
    const expenseRefIds = entries
      .filter((e) => e.category === LedgerCategory.EXPENSE && e.reference_id !== 0)
      .map((e) => e.reference_id);

    const expenseMap = new Map<number, { category: string }>();
    if (expenseRefIds.length > 0) {
      const expenses = await this.prisma.expense.findMany({
        where: { id: { in: expenseRefIds } },
        select: { id: true, category: true },
      });
      for (const ex of expenses) {
        expenseMap.set(ex.id, { category: ex.category });
      }
    }

    return entries.map((e) => {
      const isManual = e.reference_id === 0;
      let reference_label: string | null = null;
      let entry_source: 'system' | 'manual' = isManual ? 'manual' : 'system';

      if (e.category === LedgerCategory.SALE && !isManual) {
        const info = paymentMap.get(e.reference_id);
        if (info) {
          reference_label = info.order_id
            ? `${info.customer_name} - Order #${info.order_id}`
            : info.customer_name;
        }
      } else if (e.category === LedgerCategory.EXPENSE && !isManual) {
        const info = expenseMap.get(e.reference_id);
        reference_label = info ? `Expense - ${info.category}` : `Expense #${e.reference_id}`;
      } else if (e.category === LedgerCategory.OTHER_INCOME && !isManual) {
        reference_label = `Payment #${e.reference_id}`;
      }

      return {
        ...e,
        reference_label,
        entry_source,
      };
    });
  }

  async create(dto: CreateLedgerEntryDto) {
    const amount = new Prisma.Decimal(dto.amount);
    if (amount.lte(0)) {
      throw new BadRequestException('Amount must be greater than zero');
    }

    const type = dto.type === 'INCOME' ? LedgerType.DEBIT : LedgerType.CREDIT;

    return this.prisma.ledgerEntry.create({
      data: {
        entry_date: new Date(dto.entry_date),
        type,
        category: LedgerCategory.OTHER_INCOME,
        reference_id: 0,
        amount,
        description: dto.description,
      },
    });
  }

  async update(id: number, dto: CreateLedgerEntryDto) {
    const entry = await this.prisma.ledgerEntry.findUnique({ where: { id } });
    if (!entry) throw new NotFoundException('Ledger entry not found');
    if (entry.reference_id !== 0) {
      throw new BadRequestException('Cannot edit system-generated entries');
    }

    const amount = new Prisma.Decimal(dto.amount);
    if (amount.lte(0)) {
      throw new BadRequestException('Amount must be greater than zero');
    }

    const type = dto.type === 'INCOME' ? LedgerType.DEBIT : LedgerType.CREDIT;

    return this.prisma.ledgerEntry.update({
      where: { id },
      data: {
        entry_date: new Date(dto.entry_date),
        type,
        amount,
        description: dto.description,
      },
    });
  }

  async remove(id: number) {
    const entry = await this.prisma.ledgerEntry.findUnique({ where: { id } });
    if (!entry) throw new NotFoundException('Ledger entry not found');
    if (entry.reference_id !== 0) {
      throw new BadRequestException('Cannot delete system-generated entries');
    }
    return this.prisma.ledgerEntry.delete({ where: { id } });
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
