ALTER TABLE "LedgerEntry"
ADD COLUMN "created_at" TIMESTAMP(3);

UPDATE "LedgerEntry"
SET "created_at" = "entry_date"::timestamp
WHERE "created_at" IS NULL;

ALTER TABLE "LedgerEntry"
ALTER COLUMN "created_at" SET NOT NULL,
ALTER COLUMN "created_at" SET DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX "LedgerEntry_created_at_idx" ON "LedgerEntry"("created_at");
