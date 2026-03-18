import { BadRequestException, Injectable } from '@nestjs/common';
import { LedgerCategory, LedgerType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateExpenseDto } from './dto/create-expense.dto';

function parseLocalDate(value: string): Date {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
}

@Injectable()
export class ExpensesService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.expense.findMany({ orderBy: { created_at: 'desc' } });
  }

  async create(dto: CreateExpenseDto) {
    return this.prisma.$transaction(async (tx) => {
      const latest = await tx.expense.findFirst({
        orderBy: { expenseCode: 'desc' },
        select: { expenseCode: true },
      });
      const lastNumber = latest?.expenseCode
        ? Number(latest.expenseCode.replace('EXP-', ''))
        : 0;
      const nextNumber = lastNumber + 1;
      const expenseCode = `EXP-${String(nextNumber).padStart(4, '0')}`;
      const expenseDate = dto.expense_date ? parseLocalDate(dto.expense_date) : new Date();
      const rawAmount = String(dto.amount ?? '').trim();
      if (!/^[1-9]\d*$/.test(rawAmount)) {
        throw new BadRequestException('Invalid amount: must be greater than 0');
      }

      const amount = new Prisma.Decimal(rawAmount);
      if (amount.lte(0)) {
        throw new BadRequestException('Invalid amount: must be greater than 0');
      }

      const expense = await tx.expense.create({
        data: {
          expenseCode,
          category: dto.category,
          description: dto.description,
          amount,
          payment_method: dto.payment_method,
          expense_date: expenseDate,
        },
      });

      await tx.ledgerEntry.create({
        data: {
          entry_date: expenseDate,
          type: LedgerType.CREDIT,
          category: LedgerCategory.EXPENSE,
          reference_id: expense.id,
          amount: expense.amount,
          description: expense.description,
        },
      });

      return expense;
    });
  }
}
