import { Injectable } from '@nestjs/common';
import { LedgerCategory, LedgerType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateExpenseDto } from './dto/create-expense.dto';

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

      const expense = await tx.expense.create({
        data: {
          expenseCode,
          description: dto.description,
          amount: new Prisma.Decimal(dto.amount),
          payment_method: dto.payment_method,
        },
      });

      await tx.ledgerEntry.create({
        data: {
          entry_date: new Date(),
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
