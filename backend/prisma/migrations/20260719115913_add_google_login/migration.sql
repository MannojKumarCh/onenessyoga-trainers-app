-- CreateEnum
CREATE TYPE "GoogleLinkStatus" AS ENUM ('none', 'pending', 'approved', 'rejected');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "google_id" TEXT,
ADD COLUMN     "google_link_status" "GoogleLinkStatus" NOT NULL DEFAULT 'none',
ADD COLUMN     "google_linked_at" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "users_google_id_key" ON "users"("google_id");

