import { Injectable, NotFoundException } from '@nestjs/common';
import { LedgerCategory, LedgerType, Prisma } from '@prisma/client';
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
    const bonusAmount = dto.bonus_amount ? new Prisma.Decimal(dto.bonus_amount) : new Prisma.Decimal(0);
    const deductionAmount = dto.deduction_amount
      ? new Prisma.Decimal(dto.deduction_amount)
      : new Prisma.Decimal(0);
    const totalPaid = basicSalary.plus(bonusAmount).minus(deductionAmount);

    return this.prisma.$transaction(async (tx) => {
      const salary = await tx.salaryRecord.create({
        data: {
          employee_id: dto.employee_id,
          basic_salary: basicSalary,
          bonus_amount: bonusAmount,
          deduction_amount: deductionAmount,
          total_paid: totalPaid,
        },
      });

      await tx.ledgerEntry.create({
        data: {
          entry_date: new Date(),
          type: LedgerType.CREDIT,
          category: LedgerCategory.SALARY,
          reference_id: salary.id,
          amount: totalPaid,
          description: `Salary payment for employee ${dto.employee_id}`,
        },
      });

      return salary;
    });
  }
}
