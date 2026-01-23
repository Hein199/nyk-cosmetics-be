import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateInventoryDto } from './dto/update-inventory.dto';

@Injectable()
export class InventoryService {
  constructor(private readonly prisma: PrismaService) {}

  async update(productId: string, dto: UpdateInventoryDto) {
    const inventory = await this.prisma.inventory.findUnique({ where: { product_id: productId } });
    if (!inventory) {
      throw new NotFoundException('Inventory not found');
    }

    return this.prisma.inventory.update({
      where: { product_id: productId },
      data: { quantity: dto.quantity },
      include: { product: true },
    });
  }
}
