import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { LoanStatus, OrderStatus, PaymentStatus, Prisma, Role, StockEvent } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderItemsDto } from './dto/update-order-items.dto';

@Injectable()
export class OrdersService {
  constructor(private readonly prisma: PrismaService) { }

  private normalizeOrderItems(
    items: Array<{
      product_id: number;
      quantity: number;
      unit_type: string;
      unit_price: Prisma.Decimal | string | number;
    }>,
  ) {
    return items
      .map((item) => ({
        product_id: item.product_id,
        quantity: item.quantity,
        unit_type: item.unit_type,
        unit_price: new Prisma.Decimal(item.unit_price.toString()).toString(),
      }))
      .sort((a, b) => {
        if (a.product_id !== b.product_id) return a.product_id - b.product_id;
        if (a.unit_type !== b.unit_type) return a.unit_type.localeCompare(b.unit_type);
        if (a.unit_price !== b.unit_price) return a.unit_price.localeCompare(b.unit_price);
        return a.quantity - b.quantity;
      });
  }

  private hasSameOrderItems(
    left: Array<{ product_id: number; quantity: number; unit_type: string; unit_price: string }>,
    right: Array<{ product_id: number; quantity: number; unit_type: string; unit_price: string }>,
  ) {
    if (left.length !== right.length) {
      return false;
    }

    return left.every((item, index) => {
      const candidate = right[index];
      return (
        item.product_id === candidate.product_id &&
        item.quantity === candidate.quantity &&
        item.unit_type === candidate.unit_type &&
        item.unit_price === candidate.unit_price
      );
    });
  }

  findAll(user: { id: number; role: Role }) {
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

  async findOutstanding(user: { id: number; role: Role }) {
    const where: Prisma.OrderWhereInput = {
      status: OrderStatus.DELIVERED,
      OR: [
        { loan: { status: LoanStatus.OPEN } },
        {
          loan: { status: LoanStatus.CLOSED },
          payments: { some: { status: PaymentStatus.PENDING } },
        },
      ],
    };
    if (user.role !== Role.ADMIN) {
      where.salesperson_user_id = user.id;
    }

    return this.prisma.order.findMany({
      where,
      include: {
        customer: { select: { id: true, name: true, phone_number: true, address: true } },
        salesperson: { select: { id: true, username: true } },
        loan: true,
        items: { include: { product: { select: { name: true, category: true } } } },
        payments: {
          where: { status: PaymentStatus.PENDING },
          orderBy: { created_at: 'desc' },
        },
      },
      orderBy: { created_at: 'desc' },
    });
  }

  async findOne(user: { id: number; role: Role }, id: number) {
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

  async create(userId: number, dto: CreateOrderDto) {
    const customer = await this.prisma.customer.findUnique({ where: { id: dto.customer_id } });
    if (!customer) {
      throw new NotFoundException('Customer not found');
    }

    return this.prisma.$transaction(async (tx) => {
      // Serialize create requests per salesperson to prevent rapid double-submit races.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${9001}, ${userId})`;

      // Allow same product_id with different unit_type, but reject true duplicates (same product_id + unit_type)
      const seen = new Set<string>();
      const duplicateKeys: string[] = [];
      for (const item of dto.items) {
        const key = `${item.product_id}:${item.unit_type ?? 'Pcs'}`;
        if (seen.has(key)) {
          duplicateKeys.push(key);
        }
        seen.add(key);
      }

      if (duplicateKeys.length > 0) {
        throw new BadRequestException({
          message: 'Duplicate product with same unit type in order items',
          duplicateKeys: Array.from(new Set(duplicateKeys)),
        });
      }

      const productIds = dto.items.map((item) => item.product_id);
      const uniqueProductIds = Array.from(new Set(productIds)).sort((a, b) => a - b);
      const products = await tx.product.findMany({
        where: { id: { in: uniqueProductIds }, is_active: true },
      });

      if (products.length !== uniqueProductIds.length) {
        const activeIds = new Set(products.map((p) => p.id));
        const invalidProductIds = uniqueProductIds.filter((id) => !activeIds.has(id));
        throw new BadRequestException({
          message: 'Invalid or inactive product in order items',
          invalidProductIds,
        });
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
          unit_type: item.unit_type ?? 'Pcs',
          unit_price: unitPrice,
        };
      });

      // Lock inventory rows first, then check pending+requested demand to prevent overbooking before confirmation.
      await tx.$queryRaw(
        Prisma.sql`SELECT product_id FROM "Inventory" WHERE product_id IN (${Prisma.join(uniqueProductIds)}) ORDER BY product_id FOR UPDATE`,
      );

      const inventoryRows = await tx.inventory.findMany({
        where: { product_id: { in: uniqueProductIds } },
        select: { product_id: true, quantity: true },
      });

      if (inventoryRows.length !== uniqueProductIds.length) {
        throw new BadRequestException('Inventory record missing for product');
      }

      const inventoryMap = new Map(inventoryRows.map((row) => [row.product_id, row.quantity]));

      const requestedPiecesByProduct = new Map<number, number>();
      for (const item of dto.items) {
        const product = productMap.get(item.product_id);
        if (!product) {
          continue;
        }

        let multiplier = 1;
        if (item.unit_type === 'D') {
          multiplier = Number(product.pcs_per_dozen);
        } else if (item.unit_type === 'P') {
          multiplier = Number(product.pcs_per_box);
        }

        const requestedPcs = item.quantity * multiplier;
        requestedPiecesByProduct.set(
          item.product_id,
          (requestedPiecesByProduct.get(item.product_id) ?? 0) + requestedPcs,
        );
      }

      const pendingItems = await tx.orderItem.findMany({
        where: {
          product_id: { in: uniqueProductIds },
          order: { status: OrderStatus.PENDING_ADMIN },
        },
        select: {
          product_id: true,
          quantity: true,
          unit_type: true,
        },
      });

      const pendingPiecesByProduct = new Map<number, number>();
      for (const item of pendingItems) {
        const product = productMap.get(item.product_id);
        if (!product) {
          continue;
        }

        let multiplier = 1;
        if (item.unit_type === 'D') {
          multiplier = Number(product.pcs_per_dozen);
        } else if (item.unit_type === 'P') {
          multiplier = Number(product.pcs_per_box);
        }

        const pendingPcs = item.quantity * multiplier;
        pendingPiecesByProduct.set(
          item.product_id,
          (pendingPiecesByProduct.get(item.product_id) ?? 0) + pendingPcs,
        );
      }

      for (const productId of uniqueProductIds) {
        const inventoryQty = inventoryMap.get(productId) ?? 0;
        const pendingQty = pendingPiecesByProduct.get(productId) ?? 0;
        const requestedQty = requestedPiecesByProduct.get(productId) ?? 0;

        if (pendingQty + requestedQty > inventoryQty) {
          const productName = productMap.get(productId)?.name ?? `Product ${productId}`;
          throw new BadRequestException(
            `${productName} has insufficient stock before confirmation. Available: ${inventoryQty} PCS, Pending: ${pendingQty} PCS, Requested: ${requestedQty} PCS.`,
          );
        }
      }

      const normalizedIncomingItems = this.normalizeOrderItems(itemsData);
      const normalizedIncomingRemark = (dto.remark ?? '').trim();
      const duplicateWindowStart = new Date(Date.now() - 15_000);

      const recentPendingOrders = await tx.order.findMany({
        where: {
          salesperson_user_id: userId,
          customer_id: dto.customer_id,
          status: OrderStatus.PENDING_ADMIN,
          created_at: { gte: duplicateWindowStart },
        },
        include: {
          items: {
            select: {
              product_id: true,
              quantity: true,
              unit_type: true,
              unit_price: true,
            },
          },
        },
        orderBy: { created_at: 'desc' },
        take: 5,
      });

      const duplicateOrder = recentPendingOrders.find((order) => {
        const normalizedExistingRemark = (order.remark ?? '').trim();
        if (normalizedExistingRemark !== normalizedIncomingRemark) {
          return false;
        }

        if ((order.payment_type ?? null) !== (dto.payment_type ?? null)) {
          return false;
        }

        const normalizedExistingItems = this.normalizeOrderItems(order.items);
        return this.hasSameOrderItems(normalizedIncomingItems, normalizedExistingItems);
      });

      if (duplicateOrder) {
        throw new BadRequestException('Duplicate order submission detected. Please wait before trying again.');
      }

      return tx.order.create({
        data: {
          customer_id: dto.customer_id,
          salesperson_user_id: userId,
          total_amount: total,
          status: OrderStatus.PENDING_ADMIN,
          payment_type: dto.payment_type,
          remark: dto.remark,
          items: { create: itemsData },
        },
        include: { items: true },
      });
    });
  }

  async confirmOrder(orderId: number) {
    return this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({
        where: { id: orderId },
        include: { items: { include: { product: { select: { id: true, pcs_per_dozen: true, pcs_per_box: true } } } } },
      });

      if (!order) {
        throw new NotFoundException('Order not found');
      }
      if (order.status !== OrderStatus.PENDING_ADMIN) {
        throw new BadRequestException('Order is not pending admin confirmation');
      }

      // Compute actual piece deduction per product, summing across different unit_types
      const deductionMap = new Map<number, number>();
      for (const item of order.items) {
        let multiplier = 1;
        if (item.unit_type === 'D') {
          multiplier = Number(item.product.pcs_per_dozen);
        } else if (item.unit_type === 'P') {
          multiplier = Number(item.product.pcs_per_box);
        }
        const current = deductionMap.get(item.product_id) ?? 0;
        deductionMap.set(item.product_id, current + item.quantity * multiplier);
      }

      // Apply atomic inventory decrements per product to avoid race conditions.
      for (const [productId, deduction] of deductionMap.entries()) {
        const updatedCount = await tx.inventory.updateMany({
          where: {
            product_id: productId,
            quantity: { gte: deduction },
          },
          data: {
            quantity: { decrement: deduction },
          },
        });

        if (updatedCount.count === 0) {
          throw new BadRequestException('Insufficient inventory');
        }

        const updatedInventory = await tx.inventory.findUnique({
          where: { product_id: productId },
          select: { quantity: true },
        });

        if (!updatedInventory) {
          throw new BadRequestException('Inventory record missing for product');
        }

        await tx.stockHistory.create({
          data: {
            product_id: productId,
            event: StockEvent.order,
            change_quantity: -deduction,
            inventory_after: updatedInventory.quantity,
            source: `order:${orderId}`,
          },
        });
      }

      const updated = await tx.order.update({
        where: { id: orderId },
        data: { status: OrderStatus.CONFIRMED },
      });

      return updated;
    });
  }

  async updateOrderItems(user: { id: number; role: Role }, orderId: number, dto: UpdateOrderItemsDto) {
    const order = await this.prisma.order.findFirst({
      where: user.role === Role.ADMIN ? { id: orderId } : { id: orderId, salesperson_user_id: user.id },
      include: {
        items: {
          include: {
            product: {
              select: {
                id: true,
                name: true,
                pcs_per_dozen: true,
                pcs_per_box: true,
              },
            },
          },
        },
      },
    });
    if (!order) {
      throw new NotFoundException('Order not found');
    }

    if (user.role === Role.SALESPERSON && order.status !== OrderStatus.PENDING_ADMIN) {
      throw new ForbiddenException('Salespersons can only edit pending orders');
    }

    const existingItemIds = new Set(order.items.map((i) => i.id));
    for (const entry of dto.items) {
      if (!existingItemIds.has(entry.id)) {
        throw new BadRequestException(`Order item ${entry.id} does not belong to this order`);
      }
    }

    return this.prisma.$transaction(async (tx) => {
      const updateMap = new Map(dto.items.map((entry) => [entry.id, entry]));

      const requiredPcsByProduct = new Map<number, { required: number; productName: string }>();
      for (const item of order.items) {
        const patch = updateMap.get(item.id);
        const quantity = patch?.quantity ?? item.quantity;
        const unitType = patch?.unit_type ?? item.unit_type;

        let multiplier = 1;
        if (unitType === 'D') {
          multiplier = Number(item.product.pcs_per_dozen);
        } else if (unitType === 'P') {
          multiplier = Number(item.product.pcs_per_box);
        }

        const requiredPcs = quantity * multiplier;
        const current = requiredPcsByProduct.get(item.product_id);
        if (current) {
          current.required += requiredPcs;
        } else {
          requiredPcsByProduct.set(item.product_id, {
            required: requiredPcs,
            productName: item.product.name,
          });
        }
      }

      const productIds = Array.from(requiredPcsByProduct.keys());
      const inventories = await tx.inventory.findMany({
        where: { product_id: { in: productIds } },
      });
      const inventoryMap = new Map(inventories.map((inventory) => [inventory.product_id, inventory.quantity]));

      for (const [productId, required] of requiredPcsByProduct.entries()) {
        const availableQty = inventoryMap.get(productId);
        if (availableQty === undefined) {
          throw new BadRequestException(`Inventory record missing for ${required.productName}`);
        }
        if (required.required > availableQty) {
          throw new BadRequestException(
            `${required.productName} exceeds current stock (${availableQty} PCS).`,
          );
        }
      }

      for (const entry of dto.items) {
        const data: Prisma.OrderItemUpdateInput = {};
        if (entry.quantity !== undefined) {
          data.quantity = entry.quantity;
        }
        if (entry.unit_price !== undefined) {
          data.unit_price = new Prisma.Decimal(entry.unit_price);
        }
        if (entry.unit_type !== undefined) {
          data.unit_type = entry.unit_type;
        }
        await tx.orderItem.update({ where: { id: entry.id }, data });
      }

      // Recalculate total
      const updatedItems = await tx.orderItem.findMany({ where: { order_id: orderId } });
      const newTotal = updatedItems.reduce(
        (sum, item) => sum.plus(new Prisma.Decimal(item.unit_price.toString()).mul(item.quantity)),
        new Prisma.Decimal(0),
      );

      return tx.order.update({
        where: { id: orderId },
        data: { total_amount: newTotal },
        include: {
          items: { include: { product: true } },
          customer: true,
          salesperson: { select: { id: true, username: true } },
        },
      });
    });
  }

  async cancelOrder(orderId: number) {
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

  async deliverOrder(orderId: number) {
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
