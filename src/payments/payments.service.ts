import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { LedgerCategory, LedgerType, LoanStatus, PaymentStatus, Prisma, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePaymentDto } from './dto/create-payment.dto';

const COLLECTED_BY_SELECT = {
  select: {
    id: true,
    role: true,
    salesperson: { select: { name: true } },
  },
} as const;

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
      include: {
        customer: true,
        order: true,
        collected_by: COLLECTED_BY_SELECT,
      },
      orderBy: { created_at: 'desc' },
    });
  }

  async create(user: { id: number; role: Role }, dto: CreatePaymentDto) {
    const customer = await this.prisma.customer.findUnique({ where: { id: dto.customer_id } });
    if (!customer) {
      throw new NotFoundException('Customer not found');
    }

    const isAdmin = user.role === Role.ADMIN;

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
            collected_by_user_id: user.id,
            amount_paid: paymentAmount,
            payment_type: dto.payment_type,
            // Admin payments are auto-confirmed; salesperson payments require admin approval
            status: isAdmin ? PaymentStatus.CONFIRMED : PaymentStatus.PENDING,
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

        // Admin payment: immediately create system ledger entry
        if (isAdmin) {
          await tx.ledgerEntry.create({
            data: {
              entry_date: new Date(),
              type: LedgerType.DEBIT,
              category: LedgerCategory.SALE,
              reference_id: payment.id,
              amount: paymentAmount,
              description: `${customer.name} - Order #${dto.order_id}`,
              is_system_generated: true,
            },
          });
        }

        return payment;
      }

      // Walk-in / non-order payment
      const payment = await tx.payment.create({
        data: {
          customer_id: dto.customer_id,
          collected_by_user_id: user.id,
          amount_paid: paymentAmount,
          payment_type: dto.payment_type,
          status: isAdmin ? PaymentStatus.CONFIRMED : PaymentStatus.PENDING,
        },
      });

      if (isAdmin) {
        await tx.ledgerEntry.create({
          data: {
            entry_date: new Date(),
            type: LedgerType.DEBIT,
            category: LedgerCategory.OTHER_INCOME,
            reference_id: payment.id,
            amount: paymentAmount,
            description: `${customer.name} - Walk-in payment`,
            is_system_generated: true,
          },
        });
      }

      return payment;
    });
  }

  async confirmPayment(paymentId: number) {
    return this.prisma.$transaction(async (tx) => {
      const payment = await tx.payment.findUnique({
        where: { id: paymentId },
        include: {
          customer: { select: { name: true } },
          order: { select: { id: true } },
        },
      });
      if (!payment) {
        throw new NotFoundException('Payment not found');
      }
      // Idempotency: if already confirmed, do nothing (no duplicate ledger entry)
      if (payment.status === PaymentStatus.CONFIRMED) {
        return payment;
      }
      if (payment.status !== PaymentStatus.PENDING) {
        throw new BadRequestException('Only pending payments can be confirmed');
      }

      // Check for existing ledger entry to ensure idempotency
      const existingEntry = await tx.ledgerEntry.findFirst({
        where: { reference_id: payment.id },
      });

      const updatedPayment = await tx.payment.update({
        where: { id: paymentId },
        data: { status: PaymentStatus.CONFIRMED },
      });

      if (!existingEntry) {
        const description = payment.order
          ? `${payment.customer.name} - Order #${payment.order.id}`
          : `${payment.customer.name} - Walk-in payment`;

        await tx.ledgerEntry.create({
          data: {
            entry_date: new Date(),
            type: LedgerType.DEBIT,
            category: payment.order_id ? LedgerCategory.SALE : LedgerCategory.OTHER_INCOME,
            reference_id: payment.id,
            amount: payment.amount_paid,
            description,
            is_system_generated: true,
          },
        });
      }

      return updatedPayment;
    });
  }

  async rejectPayment(paymentId: number) {
    const payment = await this.prisma.payment.findUnique({ where: { id: paymentId } });
    if (!payment) {
      throw new NotFoundException('Payment not found');
    }
    if (payment.status !== PaymentStatus.PENDING) {
      throw new BadRequestException('Only pending payments can be rejected');
    }

    // Restore the loan remaining amount when rejecting a payment
    return this.prisma.$transaction(async (tx) => {
      const updatedPayment = await tx.payment.update({
        where: { id: paymentId },
        data: { status: PaymentStatus.REJECTED },
      });

      // Restore the loan outstanding balance since the payment was never confirmed
      if (payment.order_id) {
        const loan = await tx.loan.findUnique({ where: { order_id: payment.order_id } });
        if (loan) {
          const restored = new Prisma.Decimal(loan.remaining_amount.toString()).plus(payment.amount_paid);
          const total = new Prisma.Decimal(loan.original_amount.toString());
          await tx.loan.update({
            where: { id: loan.id },
            data: {
              remaining_amount: restored,
              status: restored.greaterThan(0) && restored.lte(total) ? LoanStatus.OPEN : loan.status,
            },
          });
        }
      }

      return updatedPayment;
    });
  }
}
