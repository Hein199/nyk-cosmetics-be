import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, Role, CustomerStatus, ProductCategory } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const connectionString = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DIRECT_URL or DATABASE_URL is required');
}

const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

async function main() {
  const adminUsername = process.env.ADMIN_USERNAME || 'admin';
  const adminPassword = process.env.ADMIN_PASSWORD || 'Admin@1234';
  const salespersonUsername = process.env.SALESPERSON_USERNAME || 'salesperson';
  const salespersonPassword = process.env.SALESPERSON_PASSWORD || 'Sales@1234';

  const adminHash = await bcrypt.hash(adminPassword, 10);
  const salespersonHash = await bcrypt.hash(salespersonPassword, 10);

  const admin = await prisma.user.upsert({
    where: { username: adminUsername },
    update: { password_hash: adminHash, role: Role.ADMIN },
    create: { username: adminUsername, password_hash: adminHash, role: Role.ADMIN },
  });

  const salesperson = await prisma.user.upsert({
    where: { username: salespersonUsername },
    update: { password_hash: salespersonHash, role: Role.SALESPERSON },
    create: { username: salespersonUsername, password_hash: salespersonHash, role: Role.SALESPERSON },
  });

  await prisma.salesperson.upsert({
    where: { user_id: salesperson.id },
    update: { name: 'Default Salesperson', monthly_target: 10000 },
    create: { user_id: salesperson.id, name: 'Default Salesperson', monthly_target: 10000 },
  });

  const customers = [
    { name: 'Alice Kyaw', phone_number: '0911111111', address: 'Yangon', status: CustomerStatus.ACTIVE },
    { name: 'Mya Than', phone_number: '0922222222', address: 'Mandalay', status: CustomerStatus.ACTIVE },
  ];

  for (const customer of customers) {
    const existing = await prisma.customer.findFirst({ where: { phone_number: customer.phone_number } });
    if (existing) {
      await prisma.customer.update({ where: { id: existing.id }, data: customer });
    } else {
      await prisma.customer.create({ data: customer });
    }
  }

  const products = [
    {
      name: 'Rose Lipstick',
      category: ProductCategory.COSMETIC,
      unit_price: 15.5,
      pcs_per_dozen: 12,
      pcs_per_pack: 12,
      photo_url: 'https://example.com/lipstick.jpg',
      is_active: true,
    },
    {
      name: 'Aloe Skin Gel',
      category: ProductCategory.SKINCARE,
      unit_price: 22.75,
      pcs_per_dozen: 12,
      pcs_per_pack: 12,
      photo_url: 'https://example.com/gel.jpg',
      is_active: true,
    },
  ];

  for (const product of products) {
    const existing = await prisma.product.findFirst({ where: { name: product.name } });
    const created = existing
      ? await prisma.product.update({ where: { id: existing.id }, data: product })
      : await prisma.product.create({
          data: {
            ...product,
            inventory: { create: { quantity: 50 } },
          },
        });

    await prisma.inventory.upsert({
      where: { product_id: created.id },
      update: { quantity: 50 },
      create: { product_id: created.id, quantity: 50 },
    });
  }

  console.log('Seed complete:', { admin: admin.username, salesperson: salesperson.username });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
