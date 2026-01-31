import { Injectable, NotFoundException } from '@nestjs/common';
import { LoanStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';

@Injectable()
export class CustomersService {
  constructor(private readonly prisma: PrismaService) { }

  async findAll() {
    const customers = await this.prisma.customer.findMany({
      orderBy: { name: 'asc' },
      include: {
        loans: {
          select: { remaining_amount: true, status: true },
        },
      },
    });

    return customers.map((customer) => {
      const outstanding_amount = customer.loans
        .filter((loan) => loan.status === LoanStatus.OPEN)
        .reduce((sum, loan) => sum + Number(loan.remaining_amount), 0);

      const { loans, ...rest } = customer;
      return { ...rest, outstanding_amount };
    });
  }

  async findOne(id: string) {
    const customer = await this.prisma.customer.findUnique({ where: { id } });
    if (!customer) {
      throw new NotFoundException('Customer not found');
    }
    return customer;
  }

  create(dto: CreateCustomerDto) {
    return this.prisma.customer.create({ data: dto });
  }

  async update(id: string, dto: UpdateCustomerDto) {
    await this.findOne(id);
    return this.prisma.customer.update({ where: { id }, data: dto });
  }
}
