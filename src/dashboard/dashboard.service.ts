import { Injectable } from '@nestjs/common';
import { OrderStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class DashboardService {
    constructor(private readonly prisma: PrismaService) { }

    async getAdminStats() {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);

        const [
            totalSalesAgg,
            ordersToday,
            pendingOrders,
            lowStockProducts,
            recentOrders,
        ] = await Promise.all([
            this.prisma.order.aggregate({
                where: { status: OrderStatus.DELIVERED },
                _sum: { total_amount: true },
            }),
            this.prisma.order.count({
                where: {
                    created_at: { gte: today, lt: tomorrow },
                },
            }),
            this.prisma.order.count({
                where: { status: OrderStatus.PENDING_ADMIN },
            }),
            this.prisma.product.findMany({
                where: {
                    is_active: true,
                    inventory: { quantity: { lt: 20 } },
                },
                include: { inventory: true },
                orderBy: { name: 'asc' },
                take: 10,
            }),
            this.prisma.order.findMany({
                include: {
                    customer: true,
                    salesperson: { select: { id: true, username: true } },
                    items: true,
                },
                orderBy: { created_at: 'desc' },
                take: 5,
            }),
        ]);

        return {
            totalSales: totalSalesAgg._sum.total_amount ?? new Prisma.Decimal(0),
            ordersToday,
            pendingOrders,
            lowStockCount: lowStockProducts.length,
            lowStockProducts: lowStockProducts.map((p) => ({
                id: p.id,
                name: p.name,
                stock: p.inventory?.quantity ?? 0,
            })),
            recentOrders: recentOrders.map((o) => ({
                id: o.id,
                customer: o.customer.name,
                salesperson: o.salesperson?.username ?? '-',
                amount: o.total_amount,
                status: o.status.toLowerCase(),
                date: o.created_at,
                itemCount: o.items.length,
            })),
        };
    }
}
