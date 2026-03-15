-- CreateTable
CREATE TABLE "Supplier" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "phone_number" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Supplier_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "Expense" ADD COLUMN     "supplier_id" INTEGER;

-- CreateIndex
CREATE INDEX "Supplier_phone_number_idx" ON "Supplier"("phone_number");
CREATE INDEX "Expense_supplier_id_idx" ON "Expense"("supplier_id");

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;
