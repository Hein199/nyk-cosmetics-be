import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async get() {
    let settings = await this.prisma.systemSettings.findUnique({ where: { id: 1 } });
    if (!settings) {
      settings = await this.prisma.systemSettings.create({
        data: { id: 1, system_name: 'NYK Cosmetics' },
      });
    }
    return settings;
  }

  async update(dto: { system_name?: string; system_logo?: string }) {
    // Upsert to guarantee the row exists
    return this.prisma.systemSettings.upsert({
      where: { id: 1 },
      create: {
        id: 1,
        system_name: dto.system_name ?? 'NYK Cosmetics',
        system_logo: dto.system_logo ?? null,
      },
      update: {
        ...(dto.system_name !== undefined ? { system_name: dto.system_name } : {}),
        ...(dto.system_logo !== undefined ? { system_logo: dto.system_logo } : {}),
      },
    });
  }
}
