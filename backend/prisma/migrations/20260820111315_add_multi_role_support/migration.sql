-- Non-destructive: adds the new `roles` array column, backfills it from the
-- existing single-role `role` column, then drops the old column. Every
-- existing user ends up with a one-element roles array matching their prior
-- role exactly.
ALTER TABLE "users" ADD COLUMN "roles" "Role"[] NOT NULL DEFAULT '{}';
UPDATE "users" SET "roles" = ARRAY["role"]::"Role"[];
ALTER TABLE "users" ALTER COLUMN "roles" DROP DEFAULT;
ALTER TABLE "users" DROP COLUMN "role";
