/*
  Warnings:

  - You are about to drop the column `total_paid` on the `SalaryRecord` table. All the data in the column will be lost.
  - Added the required column `net_salary` to the `SalaryRecord` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Employee" ADD COLUMN     "address" TEXT,
ADD COLUMN     "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "phone" VARCHAR(20),
ADD COLUMN     "position" VARCHAR(100),
ADD COLUMN     "remark" TEXT,
ADD COLUMN     "start_date" DATE;

-- AlterTable
ALTER TABLE "Expense" ADD COLUMN     "category" VARCHAR(100),
ADD COLUMN     "expense_date" DATE NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "SalaryRecord" DROP COLUMN "total_paid",
ADD COLUMN     "bonus_types" JSONB,
ADD COLUMN     "net_salary" DECIMAL(12,2) NOT NULL,
ADD COLUMN     "payment_date" DATE NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "remark" TEXT,
ADD COLUMN     "salary_month" VARCHAR(7) NOT NULL DEFAULT '';

-- CreateIndex
CREATE INDEX "SalaryRecord_salary_month_idx" ON "SalaryRecord"("salary_month");
