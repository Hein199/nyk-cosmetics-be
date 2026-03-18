import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateInventoryDto } from './dto/update-inventory.dto';
import { Prisma, StockEvent } from '@prisma/client';

function parseLocalDate(dateStr: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function startOfTodayLocal(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

@Injectable()
export class InventoryService {
  constructor(private readonly prisma: PrismaService) { }

  async update(productId: number, dto: UpdateInventoryDto) {
    return this.prisma.$transaction(async (tx) => {
      const inventory = await tx.inventory.findUnique({ where: { product_id: productId } });
      if (!inventory) {
        throw new NotFoundException('Inventory not found');
      }

      const change = dto.quantity - inventory.quantity;
      const updated = await tx.inventory.update({
        where: { product_id: productId },
        data: { quantity: dto.quantity },
        include: { product: true },
      });

      if (change !== 0) {
        await tx.stockHistory.create({
          data: {
            product_id: productId,
            event: dto.event ?? (change > 0 ? StockEvent.restock : StockEvent.adjustment),
            change_quantity: change,
            inventory_after: updated.quantity,
            source: dto.source ?? 'manual',
          },
        });
      }

      return updated;
    });
  }

  async getHistory(from?: string, to?: string) {
    const today = startOfTodayLocal();
    let fromDate: Date | null = null;
    let toDate: Date | null = null;

    if (from) {
      fromDate = parseLocalDate(from);
      if (Number.isNaN(fromDate.getTime()) || fromDate.getTime() > today.getTime()) {
        throw new BadRequestException('Invalid date range');
      }
    }

    if (to) {
      toDate = parseLocalDate(to);
      if (Number.isNaN(toDate.getTime()) || toDate.getTime() > today.getTime()) {
        throw new BadRequestException('Invalid date range');
      }
    }

    if (fromDate && toDate && fromDate.getTime() > toDate.getTime()) {
      throw new BadRequestException('Invalid date range');
    }

    const where: Prisma.StockHistoryWhereInput = {};
    if (fromDate || toDate) {
      where.created_at = {};
      if (fromDate) {
        (where.created_at as Prisma.DateTimeFilter).gte = fromDate;
      }
      if (toDate) {
        const endOfDay = new Date(toDate);
        endOfDay.setHours(23, 59, 59, 999);
        (where.created_at as Prisma.DateTimeFilter).lte = endOfDay;
      }
    }

    return this.prisma.stockHistory.findMany({
      where,
      orderBy: { created_at: 'desc' },
      include: { product: { select: { id: true, name: true, photo_url: true } } },
    });
  }
}
