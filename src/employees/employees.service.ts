import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';

function parseLocalDate(value: string): Date {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function startOfTodayLocal(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

@Injectable()
export class EmployeesService {
  constructor(private readonly prisma: PrismaService) { }

  private readonly maxAmount = new Prisma.Decimal('9999999999.99');

  private parseAndValidateStartDate(rawDate: string): Date {
    const startDate = parseLocalDate(rawDate);
    const today = startOfTodayLocal();
    if (Number.isNaN(startDate.getTime()) || startDate.getTime() > today.getTime()) {
      throw new BadRequestException('Start date cannot be in the future.');
    }

    return startDate;
  }

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

  findAll() {
    return this.prisma.employee.findMany({ orderBy: { created_at: 'desc' } });
  }

  create(dto: CreateEmployeeDto) {
    return this.prisma.employee.create({
      data: {
        name: dto.name,
        phone: dto.phone,
        address: dto.address,
        position: dto.position,
        basic_salary: this.parsePositiveAmount(dto.basic_salary),
        start_date: dto.start_date ? this.parseAndValidateStartDate(dto.start_date) : null,
        remark: dto.remark,
      },
    });
  }

  async update(id: number, dto: UpdateEmployeeDto) {
    const employee = await this.prisma.employee.findUnique({ where: { id } });
    if (!employee) throw new NotFoundException('Employee not found');
    return this.prisma.employee.update({
      where: { id },
      data: {
        name: dto.name,
        phone: dto.phone,
        address: dto.address,
        position: dto.position,
        basic_salary: dto.basic_salary
          ? this.parsePositiveAmount(dto.basic_salary)
          : undefined,
        start_date: dto.start_date ? this.parseAndValidateStartDate(dto.start_date) : undefined,
        remark: dto.remark,
      },
    });
  }

  async remove(id: number) {
    const employee = await this.prisma.employee.findUnique({ where: { id } });
    if (!employee) throw new NotFoundException('Employee not found');
    // Delete related salary records first to avoid FK constraint violation
    await this.prisma.salaryRecord.deleteMany({ where: { employee_id: id } });
    return this.prisma.employee.delete({ where: { id } });
  }
}

