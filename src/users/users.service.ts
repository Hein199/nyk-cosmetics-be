import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) { }

  private parseNonNegativeMonthlyTarget(rawValue: string | undefined): Prisma.Decimal {
    const normalizedValue = String(rawValue ?? '').trim();
    if (!/^(0|[1-9]\d*)$/.test(normalizedValue)) {
      throw new BadRequestException('Invalid monthly target: must be greater than or equal to 0');
    }

    const monthlyTarget = new Prisma.Decimal(normalizedValue);
    if (monthlyTarget.lt(0)) {
      throw new BadRequestException('Invalid monthly target: must be greater than or equal to 0');
    }

    return monthlyTarget;
  }

  findAll() {
    return this.prisma.user.findMany({
      select: {
        id: true,
        username: true,
        role: true,
        phone_number: true,
        is_active: true,
        remark: true,
        created_at: true,
        salesperson: { select: { id: true, name: true, region: true, monthly_target: true } },
      },
      orderBy: { created_at: 'desc' },
    });
  }

  async findOne(id: number) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true, username: true, role: true,
        email: true, phone_number: true, photo_url: true, created_at: true,
        salesperson: true,
      },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user;
  }

  async create(dto: CreateUserDto) {
    if (dto.role === Role.SALESPERSON && !dto.salesperson_name) {
      throw new BadRequestException('salesperson_name is required for SALESPERSON');
    }

    const existing = await this.prisma.user.findUnique({ where: { username: dto.username } });
    if (existing) {
      throw new BadRequestException('Username already exists');
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const monthlyTarget = dto.monthly_target
      ? this.parseNonNegativeMonthlyTarget(dto.monthly_target)
      : new Prisma.Decimal('0');

    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          username: dto.username,
          password_hash: passwordHash,
          role: dto.role,
          phone_number: dto.phone_number,
          is_active: dto.is_active ?? true,
          remark: dto.remark,
        },
      });

      if (dto.role === Role.SALESPERSON) {
        await tx.salesperson.create({
          data: {
            user_id: user.id,
            name: dto.salesperson_name || dto.username,
            region: dto.region,
            monthly_target: monthlyTarget,
          },
        });
      }

      return { id: user.id, username: user.username, role: user.role };
    });
  }

  async update(id: number, dto: UpdateUserDto) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (dto.username && dto.username !== user.username) {
      const existing = await this.prisma.user.findUnique({ where: { username: dto.username } });
      if (existing) {
        throw new BadRequestException('Username already exists');
      }
    }

    const data: Prisma.UserUpdateInput = {};
    if (dto.username) {
      data.username = dto.username;
    }
    if (dto.password) {
      data.password_hash = await bcrypt.hash(dto.password, 10);
    }
    if (dto.role) {
      data.role = dto.role;
    }
    if (dto.phone_number !== undefined) {
      data.phone_number = dto.phone_number;
    }
    if (dto.is_active !== undefined) {
      data.is_active = dto.is_active;
    }
    if (dto.remark !== undefined) {
      data.remark = dto.remark;
    }

    const updated = await this.prisma.user.update({
      where: { id },
      data,
    });

    const nextRole = dto.role ?? user.role;
    const existingSalesperson = await this.prisma.salesperson.findUnique({ where: { user_id: id } });

    if (nextRole === Role.SALESPERSON) {
      const shouldUpdateName = Boolean(dto.salesperson_name) || Boolean(dto.username);
      const nextName = dto.salesperson_name ?? updated.username;
      const nextMonthlyTarget = dto.monthly_target
        ? this.parseNonNegativeMonthlyTarget(dto.monthly_target)
        : existingSalesperson?.monthly_target ?? new Prisma.Decimal('0');

      if (existingSalesperson) {
        await this.prisma.salesperson.update({
          where: { user_id: id },
          data: {
            ...(shouldUpdateName ? { name: nextName } : {}),
            ...(dto.region !== undefined ? { region: dto.region } : {}),
            monthly_target: nextMonthlyTarget,
          },
        });
      } else {
        await this.prisma.salesperson.create({
          data: {
            user_id: id,
            name: nextName,
            region: dto.region,
            monthly_target: nextMonthlyTarget,
          },
        });
      }
    } else if (existingSalesperson) {
      await this.prisma.salesperson.delete({ where: { user_id: id } });
    }

    return { id: updated.id, username: updated.username, role: updated.role };
  }

  async remove(id: number) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('User not found');

    if (user.role === Role.SALESPERSON) {
      return this.prisma.user.update({
        where: { id },
        data: { is_active: false },
        select: {
          id: true,
          username: true,
          role: true,
          is_active: true,
        },
      });
    }

    // Remove salesperson record first to avoid FK constraint
    await this.prisma.salesperson.deleteMany({ where: { user_id: id } });
    return this.prisma.user.delete({ where: { id } });
  }

  async updateProfile(id: number, dto: { email?: string; phone_number?: string; photo_url?: string }) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    const updated = await this.prisma.user.update({
      where: { id },
      data: {
        ...(dto.email !== undefined ? { email: dto.email } : {}),
        ...(dto.phone_number !== undefined ? { phone_number: dto.phone_number } : {}),
        ...(dto.photo_url !== undefined ? { photo_url: dto.photo_url } : {}),
      },
      select: {
        id: true, username: true, role: true,
        email: true, phone_number: true, photo_url: true, created_at: true,
        salesperson: true,
      },
    });
    return updated;
  }
}
