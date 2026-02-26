import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCategoryDto } from './dto/create-category.dto';

@Injectable()
export class CategoriesService {
  private readonly logger = new Logger(CategoriesService.name);

  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    try {
      return await this.prisma.category.findMany({ orderBy: { name: 'asc' } });
    } catch (error) {
      this.logger.error('findAll failed', error);
      throw new InternalServerErrorException(error?.message ?? 'Failed to fetch categories');
    }
  }

  async create(dto: CreateCategoryDto) {
    const name = dto.name.trim();
    if (!name) throw new BadRequestException('Category name is required');

    try {
      // Case-insensitive duplicate check
      const existing = await this.prisma.category.findFirst({
        where: { name: { equals: name, mode: 'insensitive' } },
      });
      if (existing) {
        throw new ConflictException(`Category "${name}" already exists`);
      }
      return await this.prisma.category.create({ data: { name } });
    } catch (error) {
      // Re-throw our own HTTP exceptions untouched
      if (error?.status) throw error;
      this.logger.error('create failed', error);
      this.logger.error(error?.stack);
      if (error?.code) this.logger.error(`Prisma code: ${error.code}`);
      throw new InternalServerErrorException(error?.message ?? 'Failed to create category');
    }
  }

  async remove(id: number) {
    try {
      const category = await this.prisma.category.findUnique({ where: { id } });
      if (!category) throw new NotFoundException('Category not found');

      await this.prisma.category.delete({ where: { id } });
      return { success: true };
    } catch (error) {
      // Re-throw our own HTTP exceptions untouched
      if (error?.status) throw error;
      this.logger.error('remove failed', error);
      this.logger.error(error?.stack);
      if (error?.code) this.logger.error(`Prisma code: ${error.code}`);
      // P2003 = foreign key constraint violation
      if (error?.code === 'P2003') {
        throw new BadRequestException('Category is in use by products');
      }
      throw new InternalServerErrorException(error?.message ?? 'Failed to delete category');
    }
  }
}
