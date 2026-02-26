-- CreateTable
CREATE TABLE IF NOT EXISTS "Category" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Category_name_key" ON "Category"("name");

-- AlterTable: add expenseCode to Expense
ALTER TABLE "Expense" ADD COLUMN IF NOT EXISTS "expenseCode" VARCHAR(20);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Expense_expenseCode_key" ON "Expense"("expenseCode");
