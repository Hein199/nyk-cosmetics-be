import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { CategoriesModule } from './categories/categories.module';
import { CustomersModule } from './customers/customers.module';
import { DailyBalanceModule } from './daily-balance/daily-balance.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { EmployeesModule } from './employees/employees.module';
import { ExpensesModule } from './expenses/expenses.module';
import { InventoryModule } from './inventory/inventory.module';
import { LedgerModule } from './ledger/ledger.module';
import { OrdersModule } from './orders/orders.module';
import { PaymentsModule } from './payments/payments.module';
import { PrismaModule } from './prisma/prisma.module';
import { ProductsModule } from './products/products.module';
import { PurchasesModule } from './purchases/purchases.module';
import { SalariesModule } from './salaries/salaries.module';
import { SettingsModule } from './settings/settings.module';
import { SuppliersModule } from './suppliers/suppliers.module';
import { UploadModule } from './upload/upload.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    UploadModule,
    CategoriesModule,
    UsersModule,
    CustomersModule,
    ProductsModule,
    PurchasesModule,
    SuppliersModule,
    InventoryModule,
    OrdersModule,
    PaymentsModule,
    ExpensesModule,
    EmployeesModule,
    SalariesModule,
    LedgerModule,
    DailyBalanceModule,
    DashboardModule,
    SettingsModule,
  ],
})
export class AppModule { }
