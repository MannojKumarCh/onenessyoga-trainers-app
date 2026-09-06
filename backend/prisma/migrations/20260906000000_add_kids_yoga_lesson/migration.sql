CREATE TABLE "kids_yoga_lessons" (
    "id" SERIAL NOT NULL,
    "session_id" INTEGER NOT NULL,
    "narrative_background" TEXT NOT NULL,
    "primary_theme" TEXT NOT NULL,
    "target_age_range" TEXT NOT NULL,
    "specific_yoga_poses" TEXT,
    "relaxation_setting" TEXT NOT NULL,
    "cultural_context" TEXT NOT NULL,
    "opening_text" TEXT NOT NULL,
    "warmups_text" TEXT NOT NULL,
    "narrative_text" TEXT NOT NULL,
    "closing_text" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "drive_file_id" TEXT,
    "drive_file_link" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "kids_yoga_lessons_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "kids_yoga_lessons_session_id_key" ON "kids_yoga_lessons"("session_id");

ALTER TABLE "kids_yoga_lessons" ADD CONSTRAINT "kids_yoga_lessons_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "kids_lesson_logs" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "summary" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "kids_lesson_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "kids_lesson_logs_user_id_created_at_idx" ON "kids_lesson_logs"("user_id", "created_at");

ALTER TABLE "kids_lesson_logs" ADD CONSTRAINT "kids_lesson_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
