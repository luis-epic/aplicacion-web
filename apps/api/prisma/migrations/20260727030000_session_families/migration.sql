-- AlterTable
ALTER TABLE "RefreshSession"
ADD COLUMN "familyId" UUID,
ADD COLUMN "tokenVersion" INTEGER;

-- Backfill existing sessions before enforcing the new invariants.
UPDATE "RefreshSession" AS session
SET
    "familyId" = session."id",
    "tokenVersion" = app_user."tokenVersion"
FROM "User" AS app_user
WHERE app_user."id" = session."userId";

ALTER TABLE "RefreshSession"
ALTER COLUMN "familyId" SET NOT NULL,
ALTER COLUMN "tokenVersion" SET NOT NULL;

-- CreateTable
CREATE TABLE "LoginThrottle" (
    "email" CITEXT NOT NULL,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "windowStartedAt" TIMESTAMP(3) NOT NULL,
    "blockedUntil" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "LoginThrottle_pkey" PRIMARY KEY ("email")
);

-- CreateIndex
CREATE INDEX "RefreshSession_familyId_revokedAt_idx" ON "RefreshSession"("familyId", "revokedAt");
