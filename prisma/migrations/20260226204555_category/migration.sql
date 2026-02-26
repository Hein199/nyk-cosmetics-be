-- CreateTable: Category
CREATE TABLE IF NOT EXISTS "Category" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "Category_name_key" ON "Category"("name");

-- Add expenseCode column to Expense (must exist before NOT NULL can be set)
ALTER TABLE "Expense" ADD COLUMN IF NOT EXISTS "expenseCode" VARCHAR(20);
CREATE UNIQUE INDEX IF NOT EXISTS "Expense_expenseCode_key" ON "Expense"("expenseCode");

-- Backfill any NULL expenseCode rows
UPDATE "Expense" SET "expenseCode" = 'EXP-0000' WHERE "expenseCode" IS NULL;

-- AlterTable: drop category column, make expenseCode NOT NULL
ALTER TABLE "Expense" DROP COLUMN IF EXISTS "category",
ALTER COLUMN "expenseCode" SET NOT NULL;
