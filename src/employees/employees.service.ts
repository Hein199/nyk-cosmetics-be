import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';

@Injectable()
export class EmployeesService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.employee.findMany({ orderBy: { name: 'asc' } });
  }

  create(dto: CreateEmployeeDto) {
    return this.prisma.employee.create({
      data: {
        name: dto.name,
        phone: dto.phone,
        address: dto.address,
        position: dto.position,
        basic_salary: new Prisma.Decimal(dto.basic_salary),
        start_date: dto.start_date ? new Date(dto.start_date) : null,
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
          ? new Prisma.Decimal(dto.basic_salary)
          : undefined,
        start_date: dto.start_date ? new Date(dto.start_date) : undefined,
        remark: dto.remark,
      },
    });
  }

  async remove(id: number) {
    const employee = await this.prisma.employee.findUnique({ where: { id } });
    if (!employee) throw new NotFoundException('Employee not found');
    return this.prisma.employee.delete({ where: { id } });
  }
}

