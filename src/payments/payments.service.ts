import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { LedgerCategory, LedgerType, LoanStatus, PaymentStatus, Prisma, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePaymentDto } from './dto/create-payment.dto';

@Injectable()
export class PaymentsService {
  constructor(private readonly prisma: PrismaService) { }

  findAll(user: { id: number; role: Role }, outstanding = false) {
    const where: Prisma.PaymentWhereInput = {};

    if (user.role !== Role.ADMIN) {
      where.collected_by_user_id = user.id;
    }

    if (outstanding) {
      where.status = PaymentStatus.PENDING;
    }

    return this.prisma.payment.findMany({
      where,
      include: { customer: true, order: true },
      orderBy: { created_at: 'desc' },
    });
  }

  async create(userId: number, dto: CreatePaymentDto) {
    const customer = await this.prisma.customer.findUnique({ where: { id: dto.customer_id } });
    if (!customer) {
      throw new NotFoundException('Customer not found');
    }

    return this.prisma.$transaction(async (tx) => {
      const paymentAmount = new Prisma.Decimal(dto.amount_paid);

      if (dto.order_id) {
        const order = await tx.order.findUnique({ where: { id: dto.order_id } });
        if (!order) throw new NotFoundException('Order not found');

        const loan = await tx.loan.findUnique({ where: { order_id: dto.order_id } });
        if (!loan) throw new BadRequestException('No loan record found for this order');
        if (loan.status !== LoanStatus.OPEN) throw new BadRequestException('Loan is already fully paid');

        const remaining = new Prisma.Decimal(loan.remaining_amount.toString());
        if (paymentAmount.greaterThan(remaining)) {
          throw new BadRequestException('Payment amount exceeds outstanding loan balance');
        }

        const payment = await tx.payment.create({
          data: {
            customer_id: dto.customer_id,
            order_id: dto.order_id,
            collected_by_user_id: userId,
            amount_paid: paymentAmount,
            payment_type: dto.payment_type,
            status: PaymentStatus.PENDING,
          },
        });

        const newRemaining = remaining.minus(paymentAmount);
        await tx.loan.update({
          where: { id: loan.id },
          data: {
            remaining_amount: newRemaining,
            status: newRemaining.isZero() ? LoanStatus.CLOSED : LoanStatus.OPEN,
          },
        });

        return payment;
      }

      // Walk-in / non-order payment
      return tx.payment.create({
        data: {
          customer_id: dto.customer_id,
          collected_by_user_id: userId,
          amount_paid: paymentAmount,
          payment_type: dto.payment_type,
          status: PaymentStatus.PENDING,
        },
      });
    });
  }

  async confirmPayment(paymentId: number) {
    return this.prisma.$transaction(async (tx) => {
      const payment = await tx.payment.findUnique({ where: { id: paymentId } });
      if (!payment) {
        throw new NotFoundException('Payment not found');
      }
      if (payment.status !== PaymentStatus.PENDING) {
        throw new BadRequestException('Payment already confirmed');
      }

      // Loan remaining_amount was already deducted when the payment was created.
      // Only update the payment status and add a ledger entry here.

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
