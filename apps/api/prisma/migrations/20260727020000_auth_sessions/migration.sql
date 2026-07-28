-- CreateTable
CREATE TABLE "RefreshSession" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "tokenHash" CHAR(64) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userAgent" VARCHAR(512),
    "ipAddress" VARCHAR(64),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "RefreshSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoginAttempt" (
    "id" UUID NOT NULL,
    "email" CITEXT NOT NULL,
    "succeeded" BOOLEAN NOT NULL,
    "ipAddress" VARCHAR(64),
    "userAgent" VARCHAR(512),
    "attemptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LoginAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RefreshSession_userId_revokedAt_idx" ON "RefreshSession"("userId", "revokedAt");
CREATE INDEX "RefreshSession_expiresAt_idx" ON "RefreshSession"("expiresAt");
CREATE INDEX "LoginAttempt_email_attemptedAt_idx" ON "LoginAttempt"("email", "attemptedAt");
CREATE INDEX "LoginAttempt_ipAddress_attemptedAt_idx" ON "LoginAttempt"("ipAddress", "attemptedAt");

-- AddForeignKey
ALTER TABLE "RefreshSession" ADD CONSTRAINT "RefreshSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
