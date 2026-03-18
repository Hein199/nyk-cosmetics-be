import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PurchaseItemsService {
    constructor(private readonly prisma: PrismaService) { }

    async findByProduct(productId: number, limit?: number) {
        const take = Number.isInteger(limit) && (limit ?? 0) > 0
            ? Math.min(limit as number, 10)
            : 10;

        const items = await this.prisma.purchaseItem.findMany({
            where: { product_id: productId },
            orderBy: { created_at: 'desc' },
            take,
            select: {
                id: true,
                product_id: true,
                quantity: true,
                unit_type: true,
                multiplier: true,
                quantity_pcs: true,
                unit_price: true,
                line_total: true,
                created_at: true,
                expense: {
                    select: {
                        expense_date: true,
                        supplier: {
                            select: {
                                name: true,
                            },
                        },
                    },
                },
            },
        });

        return items.map((item) => ({
            id: item.id,
            product_id: item.product_id,
            quantity: item.quantity,
            unit_type: item.unit_type,
            multiplier: item.multiplier,
            quantity_pcs: item.quantity_pcs,
            purchase_price_per_pcs: item.unit_price,
            total_price: item.line_total,
            unit_price: item.unit_price,
            line_total: item.line_total,
            created_at: item.created_at,
            expense_date: item.expense?.expense_date ?? null,
            supplier_name: item.expense?.supplier?.name ?? null,
        }));
    }
}
