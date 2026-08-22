-- Adds the recurring weekly/Saturday session schedule (SessionTemplate) and
-- a backup-trainer column on Session. Purely additive - no existing data touched.

CREATE TABLE "session_templates" (
    "id" SERIAL NOT NULL,
    "label" TEXT NOT NULL,
    "scheduled_time" TEXT NOT NULL,
    "weekdays" INTEGER[],
    "session_type" TEXT DEFAULT 'BKP',
    "dedicated_trainer_id" INTEGER,
    "title" TEXT NOT NULL DEFAULT 'Daily Session',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "session_templates_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "session_templates" ADD CONSTRAINT "session_templates_dedicated_trainer_id_fkey"
    FOREIGN KEY ("dedicated_trainer_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "sessions" ADD COLUMN "backup_trainer_id" INTEGER;

ALTER TABLE "sessions" ADD CONSTRAINT "sessions_backup_trainer_id_fkey"
    FOREIGN KEY ("backup_trainer_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "sessions_backup_trainer_id_idx" ON "sessions"("backup_trainer_id");
