import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
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

  async create(dto: CreateProductDto) {
    const data: Prisma.ProductCreateInput = {
      name: dto.name,
      category: dto.category,
      unit_price: new Prisma.Decimal(dto.unit_price),
      pcs_per_dozen: dto.pcs_per_dozen ? new Prisma.Decimal(dto.pcs_per_dozen) : new Prisma.Decimal('12'),
      pcs_per_pack: dto.pcs_per_pack ? new Prisma.Decimal(dto.pcs_per_pack) : new Prisma.Decimal('12'),
      photo_url: dto.photo_url,
      is_active: dto.is_active ?? true,
      inventory: { create: { quantity: 0 } },
    };

    return this.prisma.product.create({ data, include: { inventory: true } });
  }

  async update(id: number, dto: UpdateProductDto) {
    const existing = await this.prisma.product.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Product not found');
    }

    const data: Prisma.ProductUpdateInput = {
      name: dto.name,
      category: dto.category,
      unit_price: dto.unit_price ? new Prisma.Decimal(dto.unit_price) : undefined,
      pcs_per_dozen: dto.pcs_per_dozen ? new Prisma.Decimal(dto.pcs_per_dozen) : undefined,
      pcs_per_pack: dto.pcs_per_pack ? new Prisma.Decimal(dto.pcs_per_pack) : undefined,
      photo_url: dto.photo_url,
      is_active: dto.is_active,
    };

    return this.prisma.product.update({ where: { id }, data, include: { inventory: true } });
  }
}
