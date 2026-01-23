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
      const expense = await tx.expense.create({
        data: {
          description: dto.description,
          amount: new Prisma.Decimal(dto.amount),
          category: dto.category,
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
