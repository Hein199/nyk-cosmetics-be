import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { LoanStatus, OrderStatus, Prisma, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateOrderDto } from './dto/create-order.dto';

@Injectable()
export class OrdersService {
  constructor(private readonly prisma: PrismaService) { }

  findAll(user: { id: string; role: Role }) {
    const where = user.role === Role.ADMIN ? {} : { salesperson_user_id: user.id };
    return this.prisma.order.findMany({
      where,
      include: {
        items: true,
        customer: true,
        salesperson: { select: { id: true, username: true } },
      },
      orderBy: { created_at: 'desc' },
    });
  }

  async findOne(user: { id: string; role: Role }, id: string) {
    const where = user.role === Role.ADMIN
      ? { id }
      : { id, salesperson_user_id: user.id };

    const order = await this.prisma.order.findFirst({
      where,
      include: {
        items: { include: { product: true } },
        customer: true,
        loan: true,
        salesperson: { select: { id: true, username: true } },
      },
    });
    if (!order) {
      throw new NotFoundException('Order not found');
    }
    return order;
  }

  async create(userId: string, dto: CreateOrderDto) {
    const customer = await this.prisma.customer.findUnique({ where: { id: dto.customer_id } });
    if (!customer) {
      throw new NotFoundException('Customer not found');
    }

    return this.prisma.$transaction(async (tx) => {
      const productIds = dto.items.map((item) => item.product_id);
      const products = await tx.product.findMany({
        where: { id: { in: productIds }, is_active: true },
      });

      if (products.length !== productIds.length) {
        throw new BadRequestException('Invalid or inactive product in order items');
      }

      const productMap = new Map(products.map((p) => [p.id, p]));
      let total = new Prisma.Decimal(0);

      const itemsData = dto.items.map((item) => {
        const product = productMap.get(item.product_id);
        if (!product) {
          throw new BadRequestException('Invalid product in order items');
        }
        const unitPrice = item.unit_price
          ? new Prisma.Decimal(item.unit_price)
          : new Prisma.Decimal(product.unit_price.toString());
        total = total.plus(unitPrice.mul(item.quantity));
        return {
          product_id: item.product_id,
          quantity: item.quantity,
          unit_price: unitPrice,
        };
      });

      return tx.order.create({
        data: {
          customer_id: dto.customer_id,
          salesperson_user_id: userId,
          total_amount: total,
          status: OrderStatus.PENDING_ADMIN,
          created_at: dto.order_date ? new Date(dto.order_date) : undefined,
          payment_type: dto.payment_type,
          remark: dto.remark,
          items: { create: itemsData },
        },
        include: { items: true },
      });
    });
  }

  async confirmOrder(orderId: string) {
    return this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({
        where: { id: orderId },
        include: { items: true },
      });

      if (!order) {
        throw new NotFoundException('Order not found');
      }
      if (order.status !== OrderStatus.PENDING_ADMIN) {
        throw new BadRequestException('Order is not pending admin confirmation');
      }

      const inventoryMap = new Map(
        (
          await tx.inventory.findMany({
            where: { product_id: { in: order.items.map((i) => i.product_id) } },
          })
        ).map((inv) => [inv.product_id, inv]),
      );

      for (const item of order.items) {
        const inventory = inventoryMap.get(item.product_id);
        if (!inventory) {
          throw new BadRequestException('Inventory record missing for product');
        }
        if (inventory.quantity < item.quantity) {
          throw new BadRequestException('Insufficient inventory');
        }
      }

      for (const item of order.items) {
        await tx.inventory.update({
          where: { product_id: item.product_id },
          data: { quantity: { decrement: item.quantity } },
        });
      }

      const updated = await tx.order.update({
        where: { id: orderId },
        data: { status: OrderStatus.CONFIRMED },
      });

      return updated;
    });
  }

  async cancelOrder(orderId: string) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) {
      throw new NotFoundException('Order not found');
    }
    if (order.status !== OrderStatus.PENDING_ADMIN) {
      throw new BadRequestException('Only pending orders can be cancelled');
    }
    return this.prisma.order.update({
      where: { id: orderId },
      data: { status: OrderStatus.CANCELLED },
    });
  }

  async deliverOrder(orderId: string) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) {
      throw new NotFoundException('Order not found');
    }
    if (order.status !== OrderStatus.CONFIRMED) {
      throw new BadRequestException('Only confirmed orders can be delivered');
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.order.update({
        where: { id: orderId },
        data: { status: OrderStatus.DELIVERED },
      });

      const existingLoan = await tx.loan.findUnique({ where: { order_id: orderId } });
      if (!existingLoan) {
        await tx.loan.create({
          data: {
            customer_id: order.customer_id,
            order_id: order.id,
            original_amount: order.total_amount,
            remaining_amount: order.total_amount,
            status: LoanStatus.OPEN,
          },
        });
      }

      return updated;
    });
  }
}
