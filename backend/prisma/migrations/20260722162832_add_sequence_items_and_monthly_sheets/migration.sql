-- CreateTable
CREATE TABLE "sequence_items" (
    "id" SERIAL NOT NULL,
    "sequence_id" INTEGER NOT NULL,
    "sort_order" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "remarks" TEXT,
    "reference_url" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sequence_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "monthly_sheets" (
    "id" SERIAL NOT NULL,
    "year_month" TEXT NOT NULL,
    "spreadsheet_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "monthly_sheets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sequence_items_sequence_id_idx" ON "sequence_items"("sequence_id");

-- CreateIndex
CREATE UNIQUE INDEX "monthly_sheets_year_month_key" ON "monthly_sheets"("year_month");

-- AddForeignKey
ALTER TABLE "sequence_items" ADD CONSTRAINT "sequence_items_sequence_id_fkey" FOREIGN KEY ("sequence_id") REFERENCES "sequences"("id") ON DELETE CASCADE ON UPDATE CASCADE;

