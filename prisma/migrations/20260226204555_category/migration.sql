/*
  Warnings:

  - You are about to drop the column `category` on the `Expense` table. All the data in the column will be lost.
  - Made the column `expenseCode` on table `Expense` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "Expense" DROP COLUMN "category",
ALTER COLUMN "expenseCode" SET NOT NULL;
