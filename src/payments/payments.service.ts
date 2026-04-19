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
      const rawAmount = String(dto.amount_paid ?? '').trim();
      if (!/^\d+(\.\d+)?$/.test(rawAmount)) {
        throw new BadRequestException('Invalid amount: must be greater than 0');
      }

      const paymentAmount = new Prisma.Decimal(rawAmount);
      if (paymentAmount.lte(0)) {
        throw new BadRequestException('Invalid amount: must be greater than 0');
      }

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

        // Only confirmed payments should affect loan balances.
        if (isAdmin) {
          const newRemaining = remaining.minus(paymentAmount);
          await tx.loan.update({
            where: { id: loan.id },
            data: {
              remaining_amount: newRemaining,
              status: newRemaining.isZero() ? LoanStatus.CLOSED : LoanStatus.OPEN,
            },
          });
        }

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

      const ledgerCategory = payment.order_id ? LedgerCategory.SALE : LedgerCategory.OTHER_INCOME;

      // Category-aware idempotency check.
      const existingEntry = await tx.ledgerEntry.findFirst({
        where: {
          reference_id: payment.id,
          category: ledgerCategory,
          type: LedgerType.DEBIT,
        },
      });

      const description = payment.order
        ? `${payment.customer.name} - Order #${payment.order.id}`
        : `${payment.customer.name} - Walk-in payment`;

      // Self-heal: if payment is already confirmed but ledger entry is missing, create it.
      if (payment.status === PaymentStatus.CONFIRMED) {
        if (!existingEntry) {
          await tx.ledgerEntry.create({
            data: {
              entry_date: new Date(),
              type: LedgerType.DEBIT,
              category: ledgerCategory,
              reference_id: payment.id,
              amount: payment.amount_paid,
              description,
              is_system_generated: true,
            },
          });
        }
        return payment;
      }

      if (payment.status !== PaymentStatus.PENDING) {
        throw new BadRequestException('Only pending payments can be confirmed');
      }

      // Apply pending order payment to loan only at confirmation time.
      if (payment.order_id) {
        const loan = await tx.loan.findUnique({ where: { order_id: payment.order_id } });
        if (!loan) {
          throw new BadRequestException('No loan record found for this order');
        }

        const confirmedPayments = await tx.payment.aggregate({
          _sum: { amount_paid: true },
          where: {
            order_id: payment.order_id,
            status: PaymentStatus.CONFIRMED,
            id: { not: payment.id },
          },
        });
        const confirmedTotalBefore = new Prisma.Decimal(confirmedPayments._sum.amount_paid?.toString() ?? '0');
        const original = new Prisma.Decimal(loan.original_amount.toString());
        const expectedRemainingBefore = original.minus(confirmedTotalBefore);
        const currentRemaining = new Prisma.Decimal(loan.remaining_amount.toString());
        const expectedRemainingAfter = expectedRemainingBefore.minus(payment.amount_paid);

        // New flow: pending payment has not reduced loan yet, so apply deduction now.
        if (currentRemaining.equals(expectedRemainingBefore)) {
          if (payment.amount_paid.greaterThan(currentRemaining)) {
            throw new BadRequestException('Payment amount exceeds outstanding loan balance');
          }

          await tx.loan.update({
            where: { id: loan.id },
            data: {
              remaining_amount: expectedRemainingAfter,
              status: expectedRemainingAfter.isZero() ? LoanStatus.CLOSED : LoanStatus.OPEN,
            },
          });
        } else if (currentRemaining.equals(expectedRemainingAfter)) {
          // Legacy flow: payment amount was already deducted while still pending.
          // Keep current loan balance to avoid double deduction.
        } else {
          throw new BadRequestException('Payment amount exceeds outstanding loan balance');
        }
      }

      const updatedPayment = await tx.payment.update({
        where: { id: paymentId },
        data: { status: PaymentStatus.CONFIRMED },
      });

      if (!existingEntry) {
        await tx.ledgerEntry.create({
          data: {
            entry_date: new Date(),
            type: LedgerType.DEBIT,
            category: ledgerCategory,
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

    // Pending payments do not affect loan balances before admin confirmation.
    return this.prisma.$transaction(async (tx) => {
      const updatedPayment = await tx.payment.update({
        where: { id: paymentId },
        data: { status: PaymentStatus.REJECTED },
      });

      // Legacy compatibility: restore balance only when older pending payments were already applied.
      if (payment.order_id) {
        const loan = await tx.loan.findUnique({ where: { order_id: payment.order_id } });
        if (loan) {
          const confirmedPayments = await tx.payment.aggregate({
            _sum: { amount_paid: true },
            where: { order_id: payment.order_id, status: PaymentStatus.CONFIRMED },
          });
          const confirmedTotal = new Prisma.Decimal(confirmedPayments._sum.amount_paid?.toString() ?? '0');
          const original = new Prisma.Decimal(loan.original_amount.toString());
          const expectedRemaining = original.minus(confirmedTotal);
          const currentRemaining = new Prisma.Decimal(loan.remaining_amount.toString());

          if (currentRemaining.lessThan(expectedRemaining)) {
            const restored = currentRemaining.plus(payment.amount_paid);
            const normalized = restored.greaterThan(expectedRemaining) ? expectedRemaining : restored;
            await tx.loan.update({
              where: { id: loan.id },
              data: {
                remaining_amount: normalized,
                status: normalized.isZero() ? LoanStatus.CLOSED : LoanStatus.OPEN,
              },
            });
          }
        }
      }

      return updatedPayment;
    });
  }
}
