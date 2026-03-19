import { Injectable, NotFoundException } from '@nestjs/common';
import { CustomerStatus, LoanStatus, Prisma, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';

function toLocalDateYmd(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

@Injectable()
export class CustomersService {
  constructor(private readonly prisma: PrismaService) { }

  async findAll(user: { id: number; role: Role }) {
    const where: Prisma.CustomerWhereInput =
      user.role === Role.SALESPERSON
        ? {
          orders: {
            some: {
              salesperson_user_id: user.id,
            },
          },
        }
        : {};

    const customers = await this.prisma.customer.findMany({
      where,
      orderBy: { id: 'desc' },
      include: {
        loans: {
          select: { remaining_amount: true, status: true },
        },
      },
    });

    const mappedCustomers = customers.map((customer) => {
      const outstanding_amount = customer.loans
        .filter((loan) => loan.status === LoanStatus.OPEN)
        .reduce((sum, loan) => sum + Number(loan.remaining_amount), 0);

      const { loans, ...rest } = customer;
      return { ...rest, outstanding_amount };
    });

    if (user.role === Role.SALESPERSON) {
      return mappedCustomers.filter((customer) => {
        if (customer.status === CustomerStatus.ACTIVE) {
          return true;
        }

        // For archived customers, keep visibility only when debt remains outstanding.
        return customer.outstanding_amount > 0;
      });
    }

    return mappedCustomers;
  }

  async findOne(id: number) {
    const customer = await this.prisma.customer.findUnique({ where: { id } });
    if (!customer) {
      throw new NotFoundException('Customer not found');
    }
    return customer;
  }

  create(dto: CreateCustomerDto) {
    return this.prisma.customer.create({ data: dto });
  }

  async update(id: number, dto: UpdateCustomerDto) {
    await this.findOne(id);
    return this.prisma.customer.update({ where: { id }, data: dto });
  }

  async remove(id: number) {
    const customer = await this.findOne(id);
    if (customer.status === CustomerStatus.INACTIVE) {
      return customer;
    }

    return this.prisma.customer.update({
      where: { id },
      data: { status: CustomerStatus.INACTIVE },
    });
  }

  async updateNotes(id: number, notes: string) {
    await this.findOne(id);
    return this.prisma.customer.update({ where: { id }, data: { notes } });
  }

  async findOrders(id: number) {
    await this.findOne(id);
    const orders = await this.prisma.order.findMany({
      where: { customer_id: id },
      include: {
        loan: { select: { remaining_amount: true, status: true } },
        payments: { select: { amount_paid: true } },
      },
      orderBy: { created_at: 'desc' },
    });

    return orders.map((order) => {
      const total = Number(order.total_amount);
      const remaining = order.loan ? Number(order.loan.remaining_amount) : 0;
      const paid = total - remaining;
      return {
        id: order.id,
        date: toLocalDateYmd(order.created_at),
        status: order.status,
        total_amount: total,
        paid_amount: paid,
        remaining_amount: remaining,
      };
    });
  }
}
