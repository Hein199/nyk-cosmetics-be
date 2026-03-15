import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, StockEvent } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) { }

  findAll() {
    return this.prisma.product.findMany({
      include: { inventory: true },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: number) {
    const product = await this.prisma.product.findUnique({
      where: { id },
      include: { inventory: true },
    });
    if (!product) {
      throw new NotFoundException('Product not found');
    }
    return product;
  }

  /** Convert stock input to PCS */
  private resolveStock(qty?: string, unit?: string, pcsPerBox?: string): number {
    if (!qty) return 0;
    const q = Number(qty);
    if (unit === 'BOX') {
      const ppb = pcsPerBox ? Number(pcsPerBox) : 24;
      return Math.round(q * ppb);
    }
    return Math.round(q);
  }

  async create(dto: CreateProductDto) {
    const stock = this.resolveStock(dto.stockQuantity, dto.stockUnit, dto.pcs_per_box);

    const data: Prisma.ProductCreateInput = {
      name: dto.name,
      description: dto.description ?? null,
      category: dto.category,
      unit_price: new Prisma.Decimal(dto.unit_price),
      pcs_per_dozen: dto.pcs_per_dozen ? new Prisma.Decimal(dto.pcs_per_dozen) : new Prisma.Decimal('12'),
      pcs_per_box: dto.pcs_per_box ? new Prisma.Decimal(dto.pcs_per_box) : new Prisma.Decimal('24'),
      photo_url: dto.photo_url,
      is_active: dto.is_active ?? true,
      inventory: { create: { quantity: stock } },
    };

    return this.prisma.$transaction(async (tx) => {
      const product = await tx.product.create({ data, include: { inventory: true } });

      if (stock !== 0) {
        await tx.stockHistory.create({
          data: {
            product_id: product.id,
            event: StockEvent.restock,
            change_quantity: stock,
            inventory_after: product.inventory?.quantity ?? 0,
            source: 'product:create',
          },
        });
      }

      return product;
    });
  }

  async update(id: number, dto: UpdateProductDto) {
    const existing = await this.prisma.product.findUnique({ where: { id }, include: { inventory: true } });
    if (!existing) {
      throw new NotFoundException('Product not found');
    }

    const pcsPerBox = dto.pcs_per_box ?? String(existing.pcs_per_box);

    const data: Prisma.ProductUpdateInput = {
      name: dto.name,
      description: dto.description,
      category: dto.category,
      unit_price: dto.unit_price ? new Prisma.Decimal(dto.unit_price) : undefined,
      pcs_per_dozen: dto.pcs_per_dozen ? new Prisma.Decimal(dto.pcs_per_dozen) : undefined,
      pcs_per_box: dto.pcs_per_box ? new Prisma.Decimal(dto.pcs_per_box) : undefined,
      photo_url: dto.photo_url,
      is_active: dto.is_active,
    };

    let stockChange: number | null = null;

    // If stock info was provided, update inventory
    if (dto.stockQuantity != null) {
      const stock = this.resolveStock(dto.stockQuantity, dto.stockUnit, pcsPerBox);
      const current = existing.inventory?.quantity ?? 0;
      stockChange = stock - current;
      data.inventory = { update: { data: { quantity: stock } } };
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.product.update({ where: { id }, data, include: { inventory: true } });

      if (stockChange !== null && stockChange !== 0) {
        await tx.stockHistory.create({
          data: {
            product_id: id,
            event: stockChange > 0 ? StockEvent.restock : StockEvent.adjustment,
            change_quantity: stockChange,
            inventory_after: updated.inventory?.quantity ?? 0,
            source: 'product:update',
          },
        });
      }

      return updated;
    });
  }

  async remove(id: number) {
    const existing = await this.prisma.product.findUnique({ where: { id }, include: { inventory: true, orderItems: true } });
    if (!existing) {
      throw new NotFoundException('Product not found');
    }

    // Delete related inventory first, then product
    if (existing.inventory) {
      await this.prisma.inventory.delete({ where: { product_id: id } });
    }

    return this.prisma.product.delete({ where: { id } });
  }
}
