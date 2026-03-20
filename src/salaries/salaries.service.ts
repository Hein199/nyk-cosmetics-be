import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { LedgerCategory, LedgerType, PaymentType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSalaryDto } from './dto/create-salary.dto';

function parseLocalDate(value: string): Date {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function startOfTodayLocal(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

@Injectable()
export class SalariesService {
  constructor(private readonly prisma: PrismaService) { }

  private readonly maxAmount = new Prisma.Decimal('9999999999.99');

  private parsePositiveAmount(rawAmount: string | undefined): Prisma.Decimal {
    const normalizedAmount = String(rawAmount ?? '').trim();
    if (!/^[1-9]\d*$/.test(normalizedAmount)) {
      throw new BadRequestException('Invalid amount: must be greater than 0');
    }

    const amount = new Prisma.Decimal(normalizedAmount);
    if (amount.lte(0)) {
      throw new BadRequestException('Invalid amount: must be greater than 0');
    }
    if (amount.gt(this.maxAmount)) {
      throw new BadRequestException(`Invalid amount: must not exceed ${this.maxAmount.toFixed(2)}`);
    }

    return amount;
  }

  findAll(from?: string, to?: string) {
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

    const where: Prisma.SalaryRecordWhereInput = {};
    if (fromDate || toDate) {
      where.payment_date = {};
      if (fromDate) {
        (where.payment_date as Prisma.DateTimeFilter).gte = fromDate;
      }
      if (toDate) {
        const endOfDay = new Date(toDate);
        endOfDay.setHours(23, 59, 59, 999);
        (where.payment_date as Prisma.DateTimeFilter).lte = endOfDay;
      }
    }

    return this.prisma.salaryRecord.findMany({
      where,
      include: { employee: true },
      orderBy: { created_at: 'desc' },
    });
  }

  async create(dto: CreateSalaryDto) {
    const employee = await this.prisma.employee.findUnique({ where: { id: dto.employee_id } });
    if (!employee) {
      throw new NotFoundException('Employee not found');
    }

    const basicSalary = this.parsePositiveAmount(dto.basic_salary);

    // Sum all bonus amounts
    const totalBonusAmount = (dto.bonuses ?? []).reduce(
      (sum, b) => sum.plus(this.parsePositiveAmount(b.amount)),
      new Prisma.Decimal(0),
    );
    if (totalBonusAmount.gt(this.maxAmount)) {
      throw new BadRequestException(`Total bonus must not exceed ${this.maxAmount.toFixed(2)}`);
    }

    const totalDeductionAmount = (dto.deductions ?? []).reduce(
      (sum, d) => sum.plus(this.parsePositiveAmount(d.amount)),
      new Prisma.Decimal(0),
    );
    if (totalDeductionAmount.gt(this.maxAmount)) {
      throw new BadRequestException(`Total deduction must not exceed ${this.maxAmount.toFixed(2)}`);
    }

    const netSalary = basicSalary.plus(totalBonusAmount).minus(totalDeductionAmount);
    if (netSalary.lt(0)) {
      throw new BadRequestException('Total salary must be greater than or equal to 0');
    }
    if (netSalary.gt(this.maxAmount)) {
      throw new BadRequestException(`Total salary must not exceed ${this.maxAmount.toFixed(2)}`);
    }
    const paymentDate = parseLocalDate(dto.payment_date);
    const today = startOfTodayLocal();
    if (Number.isNaN(paymentDate.getTime()) || paymentDate.getTime() > today.getTime()) {
      throw new BadRequestException('Payment date cannot be in the future.');
    }

    return this.prisma.$transaction(async (tx) => {
      // 1. Create salary record
      const salary = await tx.salaryRecord.create({
        data: {
          employee_id: dto.employee_id,
          salary_month: dto.salary_month,
          basic_salary: basicSalary,
          bonus_amount: totalBonusAmount,
          bonus_types: dto.bonuses ? (dto.bonuses as unknown as Prisma.JsonArray) : [],
          deduction_amount: totalDeductionAmount,
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

