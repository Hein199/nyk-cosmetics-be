import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateInventoryDto } from './dto/update-inventory.dto';
import { StockEvent } from '@prisma/client';

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

  async getHistory() {
    return this.prisma.stockHistory.findMany({
      orderBy: { created_at: 'desc' },
      include: { product: { select: { id: true, name: true, photo_url: true } } },
    });
  }
}
