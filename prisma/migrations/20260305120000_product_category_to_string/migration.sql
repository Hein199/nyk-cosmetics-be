-- Convert Product.category from ProductCategory enum to plain TEXT
-- First convert existing enum values to title-case strings
ALTER TABLE "Product" ALTER COLUMN "category" TYPE TEXT USING
  CASE "category"::text
    WHEN 'COSMETIC'  THEN 'Cosmetic'
    WHEN 'SKINCARE'  THEN 'Skincare'
    WHEN 'ACCESSORY' THEN 'Accessory'
    WHEN 'OTHER'     THEN 'Other'
    ELSE "category"::text
  END;

-- Drop the enum type (no longer needed)
DROP TYPE IF EXISTS "ProductCategory";
