import { Injectable } from '@nestjs/common';
import { OrderStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

// ── Bangkok timezone helper ────────────────────────────────────────────────────
const BKK_MS = 7 * 60 * 60 * 1000;

/** Returns a Date whose UTC fields represent the current Bangkok calendar date/time */
function bkkNow(): Date {
    return new Date(Date.now() + BKK_MS);
}

function isoDate(d: Date): string {
    return d.toISOString().slice(0, 10);
}

// ── Row types for raw queries ─────────────────────────────────────────────────
// NOTE: DATE columns must be fetched as strings via TO_CHAR to avoid the pg
// driver constructing a Date via `new Date(y, m, d)` (local-time), which on a
// Bangkok-timezone machine shifts every date to the previous UTC day, breaking
// the map key lookup and zeroing out all chart values.
interface DailyRow { date: string; sales: string }
interface MonthRow { month: string; sales: string }
interface ProductRow { name: string; revenue: string; quantity: string }
interface SalespersonRow { month_key: string; month_label: string; salesperson: string; revenue: string }
interface IncomeRow { date: string; income: string }
interface ExpenseRow { date: string; expense: string }

@Injectable()
export class DashboardService {
    constructor(private readonly prisma: PrismaService) { }

    // ── Main stats (recent orders + low stock) ─────────────────────────────────
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
                where: { status: { in: [OrderStatus.CONFIRMED, OrderStatus.DELIVERED] } },
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
                orderBy: { id: 'desc' },
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

    // ── Sales chart ────────────────────────────────────────────────────────────
    async getSalesChart(mode: 'daily' | 'monthly') {
        const now = bkkNow();

        if (mode === 'daily') {
            // Use TO_CHAR instead of DATE() to get a guaranteed 'YYYY-MM-DD' string.
            // DATE() via pg driver would create Date via new Date(y,m,d) (local-time),
            // shifting every date one day back on a Bangkok-timezone Node process.
            const rows = await this.prisma.$queryRaw<DailyRow[]>`
                SELECT
                    TO_CHAR(created_at AT TIME ZONE 'Asia/Bangkok', 'YYYY-MM-DD') AS date,
                    SUM(total_amount)::text                                         AS sales
                FROM   "Order"
                WHERE  status IN ('CONFIRMED'::"OrderStatus", 'DELIVERED'::"OrderStatus")
                  AND  created_at >= NOW() - INTERVAL '16 days'
                GROUP  BY 1
                ORDER  BY 1 ASC
            `;

            // r.date is already 'YYYY-MM-DD' — use directly, no Date construction
            const map = new Map(rows.map((r) => [r.date.slice(0, 10), Number(r.sales)]));

            return Array.from({ length: 14 }, (_, i) => {
                const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - (13 - i)));
                const key = isoDate(d); // isoDate uses .toISOString() which is always UTC
                const label = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
                return { label, sales: map.get(key) ?? 0 };
            });
        } else {
            const rows = await this.prisma.$queryRaw<MonthRow[]>`
                SELECT
                    TO_CHAR(created_at AT TIME ZONE 'Asia/Bangkok', 'YYYY-MM') AS month,
                    SUM(total_amount)::text                                     AS sales
                FROM   "Order"
                WHERE  status IN ('CONFIRMED'::"OrderStatus", 'DELIVERED'::"OrderStatus")
                  AND  created_at >= NOW() - INTERVAL '8 months'
                GROUP  BY 1
                ORDER  BY 1 ASC
            `;

            const map = new Map(rows.map((r) => [r.month, Number(r.sales)]));

            // Build last 7 months as YYYY-MM keys using bkkNow UTC components
            return Array.from({ length: 7 }, (_, i) => {
                // Subtract months from bkkNow; Date.UTC handles month underflow correctly
                const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (6 - i), 1));
                const key = isoDate(d).slice(0, 7); // 'YYYY-MM'
                const label = d.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' });
                return { label, sales: map.get(key) ?? 0 };
            });
        }
    }

    // ── Top selling products ───────────────────────────────────────────────────
    async getTopProducts(mode: 'daily' | 'monthly', metric: 'revenue' | 'qty') {
        const intervalSql = mode === 'daily'
            ? Prisma.sql`'14 days'::interval`
            : Prisma.sql`'1 month'::interval`;

        const orderSql = metric === 'revenue'
            ? Prisma.sql`revenue`
            : Prisma.sql`quantity`;

        const rows = await this.prisma.$queryRaw<ProductRow[]>(Prisma.sql`
            SELECT
                p.name,
                SUM(oi.unit_price * oi.quantity)::text AS revenue,
                SUM(oi.quantity)::text                  AS quantity
            FROM   "OrderItem" oi
            JOIN   "Order"   o ON oi.order_id   = o.id
            JOIN   "Product" p ON oi.product_id = p.id
            WHERE  o.status IN ('CONFIRMED'::"OrderStatus", 'DELIVERED'::"OrderStatus")
              AND  o.created_at >= NOW() - ${intervalSql}
            GROUP  BY p.name
            ORDER  BY ${orderSql} DESC
            LIMIT  5
        `);

        return rows.map((r) => ({
            name: r.name,
            value: metric === 'revenue' ? Number(r.revenue) : Number(r.quantity),
        }));
    }

    // ── Salesperson performance ────────────────────────────────────────────────
    async getSalespersonPerformance() {
        const rows = await this.prisma.$queryRaw<SalespersonRow[]>`
            SELECT
                TO_CHAR(o.created_at AT TIME ZONE 'Asia/Bangkok', 'YYYY-MM') AS month_key,
                TO_CHAR(o.created_at AT TIME ZONE 'Asia/Bangkok', 'Mon')     AS month_label,
                u.username                                                     AS salesperson,
                SUM(o.total_amount)::text                                      AS revenue
            FROM   "Order"  o
            JOIN   "User"   u ON o.salesperson_user_id = u.id
            WHERE  o.status IN ('CONFIRMED'::"OrderStatus", 'DELIVERED'::"OrderStatus")
              AND  o.created_at >= NOW() - INTERVAL '4 months'
            GROUP  BY month_key, month_label, u.username
            ORDER  BY month_key ASC
        `;

        // Collect ordered months and salesperson names
        const monthKeys: string[] = [];
        const monthLabels: Record<string, string> = {};
        const names = new Set<string>();

        for (const r of rows) {
            if (!monthKeys.includes(r.month_key)) {
                monthKeys.push(r.month_key);
                monthLabels[r.month_key] = r.month_label;
            }
            names.add(r.salesperson);
        }

        // Build lookup: "YYYY-MM:salesperson" → revenue
        const lookup = new Map(rows.map((r) => [`${r.month_key}:${r.salesperson}`, Number(r.revenue)]));

        const data = monthKeys.map((mk) => {
            const entry: Record<string, string | number> = { month: monthLabels[mk] };
            for (const name of names) {
                entry[name] = lookup.get(`${mk}:${name}`) ?? 0;
            }
            return entry;
        });

        return { data, names: [...names] };
    }

    // ── Cash flow (last 30 days) ───────────────────────────────────────────────
    async getCashFlow() {
        const now = bkkNow();

        const [incomeRows, expenseRows] = await Promise.all([
            this.prisma.$queryRaw<IncomeRow[]>`
                SELECT
                    TO_CHAR(created_at AT TIME ZONE 'Asia/Bangkok', 'YYYY-MM-DD') AS date,
                    SUM(amount_paid)::text                                          AS income
                FROM   "Payment"
                WHERE  status IN ('CONFIRMED'::"PaymentStatus", 'PENDING'::"PaymentStatus")
                  AND  created_at >= NOW() - INTERVAL '31 days'
                GROUP  BY 1
                ORDER  BY 1 ASC
            `,
            this.prisma.$queryRaw<ExpenseRow[]>`
                SELECT
                    TO_CHAR(created_at AT TIME ZONE 'Asia/Bangkok', 'YYYY-MM-DD') AS date,
                    SUM(amount)::text                                               AS expense
                FROM   "Expense"
                WHERE  created_at >= NOW() - INTERVAL '31 days'
                GROUP  BY 1
                ORDER  BY 1 ASC
            `,
        ]);

        // r.date is already 'YYYY-MM-DD' — no Date construction needed
        const incomeMap = new Map(incomeRows.map((r) => [r.date.slice(0, 10), Number(r.income)]));
        const expenseMap = new Map(expenseRows.map((r) => [r.date.slice(0, 10), Number(r.expense)]));

        return Array.from({ length: 30 }, (_, i) => {
            const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - (29 - i)));
            const key = isoDate(d);
            const label = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
            return {
                label,
                'Cash In': incomeMap.get(key) ?? 0,
                'Cash Out': expenseMap.get(key) ?? 0,
            };
        });
    }
}
