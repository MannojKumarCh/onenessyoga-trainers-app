ALTER TABLE "session_templates" ADD COLUMN "zoom_link" TEXT;

ALTER TABLE "sessions" ADD COLUMN "zoom_link_is_override" BOOLEAN NOT NULL DEFAULT false;
