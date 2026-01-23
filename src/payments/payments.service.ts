import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { LedgerCategory, LedgerType, LoanStatus, PaymentStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePaymentDto } from './dto/create-payment.dto';

@Injectable()
export class PaymentsService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.payment.findMany({
      include: { customer: true, order: true },
      orderBy: { created_at: 'desc' },
    });
  }

  async create(userId: string, dto: CreatePaymentDto) {
    const customer = await this.prisma.customer.findUnique({ where: { id: dto.customer_id } });
    if (!customer) {
      throw new NotFoundException('Customer not found');
    }

    if (dto.order_id) {
      const order = await this.prisma.order.findUnique({ where: { id: dto.order_id } });
      if (!order) {
        throw new NotFoundException('Order not found');
      }
    }

    return this.prisma.payment.create({
      data: {
        customer_id: dto.customer_id,
        order_id: dto.order_id,
        collected_by_user_id: userId,
        amount_paid: new Prisma.Decimal(dto.amount_paid),
        payment_type: dto.payment_type,
        status: PaymentStatus.PENDING,
      },
    });
  }

  async confirmPayment(paymentId: string) {
    return this.prisma.$transaction(async (tx) => {
      const payment = await tx.payment.findUnique({ where: { id: paymentId } });
      if (!payment) {
        throw new NotFoundException('Payment not found');
      }
      if (payment.status !== PaymentStatus.PENDING) {
        throw new BadRequestException('Payment already confirmed');
      }

      if (payment.order_id) {
        const loan = await tx.loan.findUnique({ where: { order_id: payment.order_id } });
        if (!loan) {
          throw new BadRequestException('Loan not found for order');
        }
        if (loan.status !== LoanStatus.OPEN) {
          throw new BadRequestException('Loan already closed');
        }

        const remaining = new Prisma.Decimal(loan.remaining_amount.toString());
        const nextRemaining = remaining.minus(payment.amount_paid);
        if (nextRemaining.isNegative()) {
          throw new BadRequestException('Payment exceeds remaining loan amount');
        }

        await tx.loan.update({
          where: { id: loan.id },
          data: {
            remaining_amount: nextRemaining,
            status: nextRemaining.isZero() ? LoanStatus.CLOSED : LoanStatus.OPEN,
          },
        });
      }

      const updatedPayment = await tx.payment.update({
        where: { id: paymentId },
        data: { status: PaymentStatus.CONFIRMED },
      });

      await tx.ledgerEntry.create({
        data: {
          entry_date: new Date(),
          type: LedgerType.DEBIT,
          category: payment.order_id ? LedgerCategory.SALE : LedgerCategory.OTHER_INCOME,
          reference_id: payment.id,
          amount: payment.amount_paid,
          description: payment.order_id ? 'Order payment confirmation' : 'Walk-in payment confirmation',
        },
      });

      return updatedPayment;
    });
  }
}
