import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) { }

  findAll() {
    return this.prisma.user.findMany({
      select: { id: true, username: true, role: true },
      orderBy: { username: 'asc' },
    });
  }

  async findOne(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: { id: true, username: true, role: true, salesperson: true },
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
    const monthlyTarget = dto.monthly_target ? new Prisma.Decimal(dto.monthly_target) : new Prisma.Decimal('0');

    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          username: dto.username,
          password_hash: passwordHash,
          role: dto.role,
        },
      });

      if (dto.role === Role.SALESPERSON) {
        await tx.salesperson.create({
          data: {
            user_id: user.id,
            name: dto.salesperson_name || dto.username,
            monthly_target: monthlyTarget,
          },
        });
      }

      return { id: user.id, username: user.username, role: user.role };
    });
  }

  async update(id: string, dto: UpdateUserDto) {
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
        ? new Prisma.Decimal(dto.monthly_target)
        : existingSalesperson?.monthly_target ?? new Prisma.Decimal('0');

      if (existingSalesperson) {
        await this.prisma.salesperson.update({
          where: { user_id: id },
          data: {
            ...(shouldUpdateName ? { name: nextName } : {}),
            monthly_target: nextMonthlyTarget,
          },
        });
      } else {
        await this.prisma.salesperson.create({
          data: {
            user_id: id,
            name: nextName,
            monthly_target: nextMonthlyTarget,
          },
        });
      }
    } else if (existingSalesperson) {
      await this.prisma.salesperson.delete({ where: { user_id: id } });
    }

    return { id: updated.id, username: updated.username, role: updated.role };
  }
}
