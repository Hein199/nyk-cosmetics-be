-- AlterTable
ALTER TABLE "Salesperson" ADD COLUMN     "region" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "email" TEXT,
ADD COLUMN     "full_name" TEXT,
ADD COLUMN     "phone_number" TEXT,
ADD COLUMN     "photo_url" TEXT;
