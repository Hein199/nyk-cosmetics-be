-- AlterEnum
ALTER TYPE "PaymentStatus" ADD VALUE 'REJECTED';

-- AlterTable
ALTER TABLE "LedgerEntry" ADD COLUMN     "is_system_generated" BOOLEAN NOT NULL DEFAULT false;
