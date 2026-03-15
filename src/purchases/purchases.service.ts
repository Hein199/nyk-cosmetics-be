import { BadRequestException, Injectable } from '@nestjs/common';
import { LedgerCategory, LedgerType, PaymentType, Prisma, StockEvent } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePurchaseDto } from './dto/create-purchase.dto';

type PurchaseLine = {
    productId: number;
    productName: string;
    quantity: number;
    quantityInPcs: number;
    unitType: 'Pcs' | 'D' | 'P';
    unitPrice: Prisma.Decimal;
    lineTotal: Prisma.Decimal;
};

@Injectable()
export class PurchasesService {
    constructor(private readonly prisma: PrismaService) { }

    async create(dto: CreatePurchaseDto) {
        return this.prisma.$transaction(async (tx) => {
            const supplierDelegate = (tx as Prisma.TransactionClient & {
                supplier: {
                    findUnique: (args: {
                        where: { id: number };
                        select: { id: true; name: true };
                    }) => Promise<{ id: number; name: string } | null>;
                };
            }).supplier;

            const supplier = await supplierDelegate.findUnique({
                where: { id: dto.supplier_id },
                select: { id: true, name: true },
            });
            if (!supplier) {
                throw new BadRequestException('Supplier not found');
            }

            const productIds = dto.items.map((item) => item.product_id);
            const uniqueProductIds = Array.from(new Set(productIds));

            if (uniqueProductIds.length !== dto.items.length) {
                throw new BadRequestException('Duplicate products are not allowed in the purchase list');
            }

            const products = await tx.product.findMany({
                where: { id: { in: uniqueProductIds } },
                select: {
                    id: true,
                    name: true,
                    pcs_per_dozen: true,
                    pcs_per_box: true,
                },
            });

            if (products.length !== uniqueProductIds.length) {
                const found = new Set(products.map((product) => product.id));
                const invalidProductIds = uniqueProductIds.filter((id) => !found.has(id));
                throw new BadRequestException({
                    message: 'Invalid product in purchase list',
                    invalidProductIds,
                });
            }

            const productMap = new Map(products.map((product) => [product.id, product]));
            const purchaseDate = dto.purchase_date ? new Date(dto.purchase_date) : new Date();

            const lines: PurchaseLine[] = dto.items.map((item) => {
                const product = productMap.get(item.product_id);
                const unitType = (item.unit_type ?? 'Pcs') as 'Pcs' | 'D' | 'P';
                const multiplier = unitType === 'D'
                    ? Number(product?.pcs_per_dozen ?? 12)
                    : unitType === 'P'
                        ? Number(product?.pcs_per_box ?? 24)
                        : 1;

                if (!Number.isFinite(multiplier) || multiplier <= 0) {
                    throw new BadRequestException(`Invalid unit conversion for product ${item.product_id}`);
                }

                const quantityInPcs = Math.round(item.quantity * multiplier);
                if (!Number.isInteger(quantityInPcs) || quantityInPcs <= 0) {
                    throw new BadRequestException(`Invalid quantity for product ${item.product_id}`);
                }

                return {
                    productId: item.product_id,
                    productName: product?.name ?? `Product #${item.product_id}`,
                    quantity: item.quantity,
                    quantityInPcs,
                    unitType,
                    unitPrice: new Prisma.Decimal(item.unit_price),
                    lineTotal: new Prisma.Decimal(item.unit_price).mul(item.quantity),
                };
            });

            const inventoryUpdates = await Promise.all(
                lines.map(async (line) => {
                    const updatedInventory = await tx.inventory.upsert({
                        where: { product_id: line.productId },
                        create: {
                            product_id: line.productId,
                            quantity: line.quantityInPcs,
                        },
                        update: {
                            quantity: { increment: line.quantityInPcs },
                        },
                        select: {
                            product_id: true,
                            quantity: true,
                        },
                    });

                    return {
                        productId: updatedInventory.product_id,
                        changeQuantity: line.quantityInPcs,
                        inventoryAfter: updatedInventory.quantity,
                    };
                }),
            );

            await tx.stockHistory.createMany({
                data: inventoryUpdates.map((update) => ({
                    product_id: update.productId,
                    event: StockEvent.restock,
                    change_quantity: update.changeQuantity,
                    inventory_after: update.inventoryAfter,
                    source: 'Admin Purchase',
                })),
            });

            const totalAmount = lines.reduce(
                (sum, line) => sum.plus(line.lineTotal),
                new Prisma.Decimal(0),
            );

            const latestExpense = await tx.expense.findFirst({
                orderBy: { expenseCode: 'desc' },
                select: { expenseCode: true },
            });
            const lastNumber = latestExpense?.expenseCode
                ? Number(latestExpense.expenseCode.replace('EXP-', ''))
                : 0;
            const expenseCode = `EXP-${String(lastNumber + 1).padStart(4, '0')}`;

            const summaryHead = lines
                .slice(0, 3)
                .map((line) => {
                    const unitLabel = line.unitType === 'D' ? 'Dozen' : line.unitType === 'P' ? 'Box' : 'Pcs';
                    return `${line.productName} x${line.quantity} ${unitLabel}`;
                })
                .join(', ');
            const summaryTail = lines.length > 3 ? ` +${lines.length - 3} more` : '';
            const defaultDescription = `Stock purchase: ${summaryHead}${summaryTail}`;
            const note = dto.description?.trim();
            const description = note
                ? `Purchase from ${supplier.name}: ${note}`
                : `Purchase from ${supplier.name}. ${defaultDescription}`;

            const expense = await tx.expense.create({
                data: {
                    expenseCode,
                    category: 'Purchase',
                    description,
                    amount: totalAmount,
                    payment_method: dto.payment_method ?? PaymentType.CASH,
                    supplier_id: supplier.id,
                    expense_date: purchaseDate,
                } as Prisma.ExpenseUncheckedCreateInput,
            });

            const purchaseItemDelegate = (tx as Prisma.TransactionClient & {
                purchaseItem: {
                    create: (args: {
                        data: {
                            expense_id: number;
                            product_id: number;
                            quantity: number;
                            unit_type: string;
                            quantity_pcs: number;
                            unit_price: Prisma.Decimal;
                            line_total: Prisma.Decimal;
                        };
                    }) => Promise<unknown>;
                };
            }).purchaseItem;

            await Promise.all(
                lines.map((line) =>
                    purchaseItemDelegate.create({
                        data: {
                            expense_id: expense.id,
                            product_id: line.productId,
                            quantity: line.quantity,
                            unit_type: line.unitType,
                            quantity_pcs: line.quantityInPcs,
                            unit_price: line.unitPrice,
                            line_total: line.lineTotal,
                        },
                    }),
                ),
            );

            await tx.ledgerEntry.create({
                data: {
                    entry_date: purchaseDate,
                    type: LedgerType.CREDIT,
                    category: LedgerCategory.EXPENSE,
                    reference_id: expense.id,
                    amount: totalAmount,
                    description,
                    is_system_generated: true,
                },
            });

            const inventories = await tx.inventory.findMany({
                where: { product_id: { in: uniqueProductIds } },
                select: { product_id: true, quantity: true },
            });
            const inventoryMap = new Map(inventories.map((inv) => [inv.product_id, inv.quantity]));

            return {
                expense_id: expense.id,
                expense_code: expense.expenseCode,
                supplier_id: supplier.id,
                supplier_name: supplier.name,
                total_amount: totalAmount.toString(),
                purchase_date: purchaseDate,
                items: lines.map((line) => ({
                    product_id: line.productId,
                    product_name: line.productName,
                    quantity: line.quantity,
                    unit_type: line.unitType,
                    quantity_added: line.quantityInPcs,
                    quantity_added_pcs: line.quantityInPcs,
                    unit_price: line.unitPrice.toString(),
                    line_total: line.lineTotal.toString(),
                    quantity_after: inventoryMap.get(line.productId) ?? 0,
                })),
            };
        });
    }
}
