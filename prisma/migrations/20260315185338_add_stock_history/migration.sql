-- CreateEnum
CREATE TYPE "StockEvent" AS ENUM ('order', 'restock', 'adjustment', 'return');

-- CreateTable
CREATE TABLE "StockHistory" (
    "id" SERIAL NOT NULL,
    "product_id" INTEGER NOT NULL,
    "event" "StockEvent" NOT NULL,
    "change_quantity" INTEGER NOT NULL,
    "inventory_after" INTEGER NOT NULL,
    "source" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StockHistory_product_id_idx" ON "StockHistory"("product_id");

-- CreateIndex
CREATE INDEX "StockHistory_created_at_idx" ON "StockHistory"("created_at");

-- AddForeignKey
ALTER TABLE "StockHistory" ADD CONSTRAINT "StockHistory_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
