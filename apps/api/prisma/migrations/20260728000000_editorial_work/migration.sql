-- Extend permissions
ALTER TYPE "PermissionCode" ADD VALUE IF NOT EXISTS 'publications.read';
ALTER TYPE "PermissionCode" ADD VALUE IF NOT EXISTS 'publications.create';
ALTER TYPE "PermissionCode" ADD VALUE IF NOT EXISTS 'publications.manage';
ALTER TYPE "PermissionCode" ADD VALUE IF NOT EXISTS 'publications.publish';
ALTER TYPE "PermissionCode" ADD VALUE IF NOT EXISTS 'tasks.read';
ALTER TYPE "PermissionCode" ADD VALUE IF NOT EXISTS 'tasks.create';
ALTER TYPE "PermissionCode" ADD VALUE IF NOT EXISTS 'tasks.manage';
ALTER TYPE "PermissionCode" ADD VALUE IF NOT EXISTS 'tasks.assign';
ALTER TYPE "PermissionCode" ADD VALUE IF NOT EXISTS 'tasks.complete';
ALTER TYPE "PermissionCode" ADD VALUE IF NOT EXISTS 'tasks.approve';

CREATE TYPE "PublicationType" AS ENUM ('DAILY', 'WEEKLY', 'PROJECT_NEWS', 'SAFETY', 'HR', 'RECOGNITION', 'URGENT');
CREATE TYPE "PublicationStatus" AS ENUM ('DRAFT', 'IN_REVIEW', 'SCHEDULED', 'PUBLISHED', 'ARCHIVED');
CREATE TYPE "PublicationAudience" AS ENUM ('ALL', 'PROJECT', 'ROLE');
CREATE TYPE "PublicationPriority" AS ENUM ('NORMAL', 'IMPORTANT', 'URGENT');
CREATE TYPE "TaskStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'BLOCKED', 'IN_REVIEW', 'COMPLETED', 'CANCELLED');
CREATE TYPE "TaskPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'CRITICAL');
CREATE TYPE "TaskRecurrence" AS ENUM ('NONE', 'DAILY', 'WEEKLY', 'MONTHLY');

CREATE TABLE "Publication" (
  "id" UUID NOT NULL,
  "title" VARCHAR(180) NOT NULL,
  "slug" VARCHAR(180) NOT NULL,
  "summary" VARCHAR(500) NOT NULL,
  "content" TEXT NOT NULL,
  "coverImageUrl" VARCHAR(2000),
  "type" "PublicationType" NOT NULL,
  "category" VARCHAR(80) NOT NULL,
  "status" "PublicationStatus" NOT NULL DEFAULT 'DRAFT',
  "priority" "PublicationPriority" NOT NULL DEFAULT 'NORMAL',
  "audience" "PublicationAudience" NOT NULL DEFAULT 'ALL',
  "audienceRoleCode" VARCHAR(60),
  "projectId" UUID,
  "authorId" UUID NOT NULL,
  "reviewerId" UUID,
  "scheduledAt" TIMESTAMP(3),
  "publishedAt" TIMESTAMP(3),
  "expiresAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Publication_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Publication_audience_check" CHECK (
    ("audience" = 'ALL' AND "projectId" IS NULL AND "audienceRoleCode" IS NULL) OR
    ("audience" = 'PROJECT' AND "projectId" IS NOT NULL AND "audienceRoleCode" IS NULL) OR
    ("audience" = 'ROLE' AND "projectId" IS NULL AND "audienceRoleCode" IS NOT NULL)
  )
);

CREATE TABLE "PublicationAcknowledgement" (
  "publicationId" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "readAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PublicationAcknowledgement_pkey" PRIMARY KEY ("publicationId", "userId")
);

CREATE TABLE "WorkTask" (
  "id" UUID NOT NULL,
  "projectId" UUID,
  "title" VARCHAR(180) NOT NULL,
  "description" TEXT,
  "status" "TaskStatus" NOT NULL DEFAULT 'PENDING',
  "priority" "TaskPriority" NOT NULL DEFAULT 'NORMAL',
  "recurrence" "TaskRecurrence" NOT NULL DEFAULT 'NONE',
  "creatorId" UUID NOT NULL,
  "assigneeId" UUID,
  "supervisorId" UUID,
  "sourcePublicationId" UUID,
  "idempotencyKey" UUID,
  "dueAt" TIMESTAMP(3),
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "estimatedMinutes" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WorkTask_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "WorkTask_estimatedMinutes_check" CHECK ("estimatedMinutes" IS NULL OR "estimatedMinutes" >= 0)
);

CREATE TABLE "TaskChecklistItem" (
  "id" UUID NOT NULL,
  "taskId" UUID NOT NULL,
  "label" VARCHAR(300) NOT NULL,
  "completed" BOOLEAN NOT NULL DEFAULT false,
  "position" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TaskChecklistItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TaskComment" (
  "id" UUID NOT NULL,
  "taskId" UUID NOT NULL,
  "authorId" UUID NOT NULL,
  "content" VARCHAR(4000) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TaskComment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Publication_slug_key" ON "Publication"("slug");
CREATE INDEX "Publication_status_publishedAt_idx" ON "Publication"("status", "publishedAt");
CREATE INDEX "Publication_projectId_status_idx" ON "Publication"("projectId", "status");
CREATE INDEX "Publication_type_category_idx" ON "Publication"("type", "category");
CREATE INDEX "PublicationAcknowledgement_userId_readAt_idx" ON "PublicationAcknowledgement"("userId", "readAt");
CREATE UNIQUE INDEX "WorkTask_idempotencyKey_key" ON "WorkTask"("idempotencyKey");
CREATE INDEX "WorkTask_assigneeId_status_dueAt_idx" ON "WorkTask"("assigneeId", "status", "dueAt");
CREATE INDEX "WorkTask_projectId_status_idx" ON "WorkTask"("projectId", "status");
CREATE INDEX "WorkTask_supervisorId_status_idx" ON "WorkTask"("supervisorId", "status");
CREATE INDEX "TaskChecklistItem_taskId_position_idx" ON "TaskChecklistItem"("taskId", "position");
CREATE INDEX "TaskComment_taskId_createdAt_idx" ON "TaskComment"("taskId", "createdAt");
CREATE INDEX "TaskComment_authorId_createdAt_idx" ON "TaskComment"("authorId", "createdAt");

ALTER TABLE "Publication" ADD CONSTRAINT "Publication_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Publication" ADD CONSTRAINT "Publication_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Publication" ADD CONSTRAINT "Publication_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PublicationAcknowledgement" ADD CONSTRAINT "PublicationAcknowledgement_publicationId_fkey" FOREIGN KEY ("publicationId") REFERENCES "Publication"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PublicationAcknowledgement" ADD CONSTRAINT "PublicationAcknowledgement_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkTask" ADD CONSTRAINT "WorkTask_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "WorkTask" ADD CONSTRAINT "WorkTask_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "WorkTask" ADD CONSTRAINT "WorkTask_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "WorkTask" ADD CONSTRAINT "WorkTask_supervisorId_fkey" FOREIGN KEY ("supervisorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "WorkTask" ADD CONSTRAINT "WorkTask_sourcePublicationId_fkey" FOREIGN KEY ("sourcePublicationId") REFERENCES "Publication"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TaskChecklistItem" ADD CONSTRAINT "TaskChecklistItem_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "WorkTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TaskComment" ADD CONSTRAINT "TaskComment_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "WorkTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TaskComment" ADD CONSTRAINT "TaskComment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
