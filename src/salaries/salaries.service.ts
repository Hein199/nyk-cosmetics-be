import { Injectable, NotFoundException } from '@nestjs/common';
import { LedgerCategory, LedgerType, PaymentType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSalaryDto } from './dto/create-salary.dto';

@Injectable()
export class SalariesService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.salaryRecord.findMany({
      include: { employee: true },
      orderBy: { created_at: 'desc' },
    });
  }

  async create(dto: CreateSalaryDto) {
    const employee = await this.prisma.employee.findUnique({ where: { id: dto.employee_id } });
    if (!employee) {
      throw new NotFoundException('Employee not found');
    }

    const basicSalary = new Prisma.Decimal(dto.basic_salary);

    // Sum all bonus amounts
    const totalBonusAmount = (dto.bonuses ?? []).reduce(
      (sum, b) => sum.plus(new Prisma.Decimal(b.amount)),
      new Prisma.Decimal(0),
    );

    const netSalary = basicSalary.plus(totalBonusAmount);
    const paymentDate = new Date(dto.payment_date);

    return this.prisma.$transaction(async (tx) => {
      // 1. Create salary record
      const salary = await tx.salaryRecord.create({
        data: {
          employee_id: dto.employee_id,
          salary_month: dto.salary_month,
          basic_salary: basicSalary,
          bonus_amount: totalBonusAmount,
          bonus_types: dto.bonuses ? (dto.bonuses as unknown as Prisma.JsonArray) : [],
          deduction_amount: new Prisma.Decimal(0),
          net_salary: netSalary,
          payment_date: paymentDate,
          remark: dto.remark,
        },
        include: { employee: true },
      });

      // 2. Auto-create expense record
      const latest = await tx.expense.findFirst({
        orderBy: { expenseCode: 'desc' },
        select: { expenseCode: true },
      });
      const lastNumber = latest?.expenseCode
        ? Number(latest.expenseCode.replace('EXP-', ''))
        : 0;
      const expenseCode = `EXP-${String(lastNumber + 1).padStart(4, '0')}`;

      const expense = await tx.expense.create({
        data: {
          expenseCode,
          category: 'Salary',
          description: `Salary payment to ${employee.name}`,
          amount: netSalary,
          payment_method: PaymentType.CASH,
          expense_date: paymentDate,
        },
      });

      // 3. Create ledger entry for the expense (CREDIT = money out)
      await tx.ledgerEntry.create({
        data: {
          entry_date: paymentDate,
          type: LedgerType.CREDIT,
          category: LedgerCategory.SALARY,
          reference_id: expense.id,
          amount: netSalary,
          description: expense.description,
          is_system_generated: true,
        },
      });

      return salary;
    });
  }
}

