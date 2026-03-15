import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSupplierDto } from './dto/create-supplier.dto';
import { UpdateSupplierDto } from './dto/update-supplier.dto';

type SupplierRecord = {
    id: number;
    name: string;
    phone_number: string;
    address: string;
    created_at: Date;
};

type SupplierDelegate = {
    findMany: (args: { orderBy: { name: 'asc' } }) => Promise<SupplierRecord[]>;
    findUnique: (args: { where: { id: number } }) => Promise<SupplierRecord | null>;
    create: (args: { data: CreateSupplierDto }) => Promise<SupplierRecord>;
    update: (args: { where: { id: number }; data: UpdateSupplierDto }) => Promise<SupplierRecord>;
    delete: (args: { where: { id: number } }) => Promise<SupplierRecord>;
};

@Injectable()
export class SuppliersService {
    constructor(private readonly prisma: PrismaService) { }

    private get supplierClient(): SupplierDelegate {
        return (this.prisma as PrismaService & { supplier: SupplierDelegate }).supplier;
    }

    findAll() {
        return this.supplierClient.findMany({
            orderBy: { name: 'asc' },
        });
    }

    async findOne(id: number) {
        const supplier = await this.supplierClient.findUnique({ where: { id } });
        if (!supplier) {
            throw new NotFoundException('Supplier not found');
        }
        return supplier;
    }

    create(dto: CreateSupplierDto) {
        return this.supplierClient.create({ data: dto });
    }

    async update(id: number, dto: UpdateSupplierDto) {
        await this.findOne(id);
        return this.supplierClient.update({
            where: { id },
            data: dto,
        });
    }

    async remove(id: number) {
        await this.findOne(id);
        return this.supplierClient.delete({ where: { id } });
    }
}
