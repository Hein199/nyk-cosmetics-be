import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
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
    findMany: (args: { orderBy: { created_at: 'desc' } }) => Promise<SupplierRecord[]>;
    findUnique: (args: { where: { id: number } }) => Promise<SupplierRecord | null>;
    create: (args: { data: CreateSupplierDto }) => Promise<SupplierRecord>;
    update: (args: { where: { id: number }; data: UpdateSupplierDto }) => Promise<SupplierRecord>;
    delete: (args: { where: { id: number } }) => Promise<SupplierRecord>;
};

type SupplierPurchaseHistory = {
    id: number;
    date: string;
    expense_code: string;
    category: string | null;
    description: string;
    amount: number;
    payment_method: string;
};

type SupplierPurchaseDetailItem = {
    id: number;
    product_id: number;
    product_name: string;
    quantity: number;
    unit_type: string;
    quantity_pcs: number;
    unit_price: number;
    line_total: number;
};

type SupplierPurchaseDetail = SupplierPurchaseHistory & {
    items: SupplierPurchaseDetailItem[];
};

type SupplierPurchaseDetailRecord = {
    id: number;
    expenseCode: string;
    category: string | null;
    description: string;
    amount: Prisma.Decimal;
    payment_method: string;
    expense_date: Date;
    purchase_items: Array<{
        id: number;
        product_id: number;
        quantity: number;
        unit_type: string;
        quantity_pcs: number;
        unit_price: Prisma.Decimal;
        line_total: Prisma.Decimal;
        product: { name: string };
    }>;
};

@Injectable()
export class SuppliersService {
    constructor(private readonly prisma: PrismaService) { }

    private get supplierClient(): SupplierDelegate {
        return (this.prisma as PrismaService & { supplier: SupplierDelegate }).supplier;
    }

    private get expenseDetailClient(): {
        findFirst: (args: {
            where: { id: number; supplier_id: number };
            include: {
                purchase_items: {
                    include: { product: { select: { name: true } } };
                    orderBy: { created_at: 'desc' };
                };
            };
        }) => Promise<SupplierPurchaseDetailRecord | null>;
    } {
        return (this.prisma as PrismaService & {
            expense: {
                findFirst: (args: {
                    where: { id: number; supplier_id: number };
                    include: {
                        purchase_items: {
                            include: { product: { select: { name: true } } };
                            orderBy: { created_at: 'desc' };
                        };
                    };
                }) => Promise<SupplierPurchaseDetailRecord | null>;
            };
        }).expense;
    }

    findAll() {
        return this.supplierClient.findMany({
            orderBy: { created_at: 'desc' },
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

    async findPurchases(id: number): Promise<SupplierPurchaseHistory[]> {
        await this.findOne(id);

        const purchases = await this.prisma.expense.findMany({
            where: { supplier_id: id },
            orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
        });

        return purchases.map((purchase) => ({
            id: purchase.id,
            date: purchase.expense_date.toISOString().split('T')[0],
            expense_code: purchase.expenseCode,
            category: purchase.category,
            description: purchase.description,
            amount: Number(purchase.amount),
            payment_method: purchase.payment_method,
        }));
    }

    async findPurchaseDetail(id: number, expenseId: number): Promise<SupplierPurchaseDetail> {
        await this.findOne(id);

        const purchase = await this.expenseDetailClient.findFirst({
            where: {
                id: expenseId,
                supplier_id: id,
            },
            include: {
                purchase_items: {
                    include: {
                        product: {
                            select: { name: true },
                        },
                    },
                    orderBy: { created_at: 'desc' },
                },
            },
        });

        if (!purchase) {
            throw new NotFoundException('Purchase not found');
        }

        return {
            id: purchase.id,
            date: purchase.expense_date.toISOString().split('T')[0],
            expense_code: purchase.expenseCode,
            category: purchase.category,
            description: purchase.description,
            amount: Number(purchase.amount),
            payment_method: purchase.payment_method,
            items: purchase.purchase_items.map((item) => ({
                id: item.id,
                product_id: item.product_id,
                product_name: item.product.name,
                quantity: item.quantity,
                unit_type: item.unit_type,
                quantity_pcs: item.quantity_pcs,
                unit_price: Number(item.unit_price),
                line_total: Number(item.line_total),
            })),
        };
    }
}
