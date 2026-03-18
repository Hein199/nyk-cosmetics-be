import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { LedgerCategory, LedgerType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateLedgerEntryDto } from './dto/create-ledger-entry.dto';

function parseLocalDate(dateStr: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function startOfTodayLocal(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function parseAndValidateEntryDate(entryDate: string): Date {
  const parsedDate = parseLocalDate(entryDate);
  if (Number.isNaN(parsedDate.getTime())) {
    throw new BadRequestException('Invalid entry date');
  }

  if (parsedDate.getTime() > startOfTodayLocal().getTime()) {
    throw new BadRequestException('Date cannot be in the future');
  }

  return parsedDate;
}

function parseAndValidateAmount(rawAmount: string): Prisma.Decimal {
  const normalizedAmount = String(rawAmount ?? '').trim();
  if (!/^[1-9]\d*$/.test(normalizedAmount)) {
    throw new BadRequestException('Invalid amount: must be greater than 0');
  }

  const amount = new Prisma.Decimal(normalizedAmount);
  if (amount.lte(0)) {
    throw new BadRequestException('Invalid amount: must be greater than 0');
  }

  return amount;
}

@Injectable()
export class LedgerService {
  constructor(private readonly prisma: PrismaService) { }

  async findAll(from?: string, to?: string) {
    const today = startOfTodayLocal();
    let fromDate: Date | null = null;
    let toDate: Date | null = null;

    if (from) {
      fromDate = parseLocalDate(from);
      if (Number.isNaN(fromDate.getTime()) || fromDate.getTime() > today.getTime()) {
        throw new BadRequestException('Invalid date range');
      }
    }

    if (to) {
      toDate = parseLocalDate(to);
      if (Number.isNaN(toDate.getTime()) || toDate.getTime() > today.getTime()) {
        throw new BadRequestException('Invalid date range');
      }
    }

    if (fromDate && toDate && fromDate.getTime() > toDate.getTime()) {
      throw new BadRequestException('Invalid date range');
    }

    const where: Prisma.LedgerEntryWhereInput = {};
    if (fromDate || toDate) {
      where.entry_date = {};
      if (fromDate) {
        (where.entry_date as Prisma.DateTimeFilter).gte = fromDate;
      }
      if (toDate) {
        const endOfDay = new Date(toDate);
        endOfDay.setHours(23, 59, 59, 999);
        (where.entry_date as Prisma.DateTimeFilter).lte = endOfDay;
      }
    }

    const entries = await this.prisma.ledgerEntry.findMany({
      where,
      orderBy: [{ id: 'desc' }],
    });

    // Enrich payment entries (SALE category) with customer name + order id
    const paymentRefIds = entries
      .filter(
        (e) =>
          (e.category === LedgerCategory.SALE || e.category === LedgerCategory.OTHER_INCOME) &&
          e.reference_id !== 0,
      )
      .map((e) => e.reference_id);

    const paymentMap = new Map<number, { customer_name: string; order_id: number | null; created_at: Date }>();
    if (paymentRefIds.length > 0) {
      const payments = await this.prisma.payment.findMany({
        where: { id: { in: paymentRefIds } },
        include: {
          customer: { select: { name: true } },
          order: { select: { id: true } },
        },
      });
      for (const p of payments) {
        paymentMap.set(p.id, {
          customer_name: p.customer.name,
          order_id: p.order?.id ?? null,
          created_at: p.created_at,
        });
      }
    }

    // Enrich expense entries with expense code
    const expenseRefIds = entries
      .filter(
        (e) =>
          (e.category === LedgerCategory.EXPENSE || e.category === LedgerCategory.SALARY) &&
          e.reference_id !== 0,
      )
      .map((e) => e.reference_id);

    const expenseMap = new Map<number, { expenseCode: string; supplier_name: string | null; created_at: Date }>();
    if (expenseRefIds.length > 0) {
      const expenses = await this.prisma.expense.findMany({
        where: { id: { in: expenseRefIds } },
        select: {
          id: true,
          created_at: true,
          expenseCode: true,
          supplier: { select: { name: true } },
        },
      });
      for (const ex of expenses) {
        expenseMap.set(ex.id, {
          expenseCode: ex.expenseCode,
          supplier_name: ex.supplier?.name ?? null,
          created_at: ex.created_at,
        });
      }
    }

    const enriched = entries.map((e) => {
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
      } else if ((e.category === LedgerCategory.EXPENSE || e.category === LedgerCategory.SALARY) && !isManual) {
        const info = expenseMap.get(e.reference_id);
        if (info?.supplier_name) {
          reference_label = `${info.supplier_name} - ${info.expenseCode}`;
        } else {
          reference_label = info?.expenseCode ?? `Expense #${e.reference_id}`;
        }
      } else if (e.category === LedgerCategory.OTHER_INCOME && !isManual) {
        reference_label = `Payment #${e.reference_id}`;
      }

      return {
        ...e,
        display_date:
          !isManual &&
          (e.category === LedgerCategory.SALE || e.category === LedgerCategory.OTHER_INCOME)
            ? paymentMap.get(e.reference_id)?.created_at ?? e.entry_date
            : e.entry_date,
        sort_datetime:
          !isManual &&
          (e.category === LedgerCategory.SALE || e.category === LedgerCategory.OTHER_INCOME)
            ? paymentMap.get(e.reference_id)?.created_at ?? e.entry_date
            : !isManual && (e.category === LedgerCategory.EXPENSE || e.category === LedgerCategory.SALARY)
              ? expenseMap.get(e.reference_id)?.created_at ?? e.entry_date
              : e.entry_date,
        reference_label,
        entry_source,
      };
    });

    return enriched.sort((a, b) => {
      const diff = new Date(b.sort_datetime).getTime() - new Date(a.sort_datetime).getTime();
      if (diff !== 0) return diff;
      return b.id - a.id;
    });
  }

  async create(dto: CreateLedgerEntryDto) {
    const amount = parseAndValidateAmount(dto.amount);
    const entryDate = parseAndValidateEntryDate(dto.entry_date);

    const type = dto.type === 'INCOME' ? LedgerType.DEBIT : LedgerType.CREDIT;

    return this.prisma.ledgerEntry.create({
      data: {
        entry_date: entryDate,
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

    const amount = parseAndValidateAmount(dto.amount);
    const entryDate = parseAndValidateEntryDate(dto.entry_date);

    const type = dto.type === 'INCOME' ? LedgerType.DEBIT : LedgerType.CREDIT;

    return this.prisma.ledgerEntry.update({
      where: { id },
      data: {
        entry_date: entryDate,
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
    const entryDate = parseLocalDate(date);

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
