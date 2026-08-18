-- CreateTable
CREATE TABLE "ai_schedule_logs" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_schedule_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ai_schedule_logs_user_id_created_at_idx" ON "ai_schedule_logs"("user_id", "created_at");

-- AddForeignKey
ALTER TABLE "ai_schedule_logs" ADD CONSTRAINT "ai_schedule_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
