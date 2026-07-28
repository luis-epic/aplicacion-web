-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "citext";

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'INACTIVE');
CREATE TYPE "PermissionCode" AS ENUM ('users.read', 'users.manage', 'clients.read', 'clients.manage', 'projects.read', 'projects.manage', 'fieldReports.create', 'fieldReports.read', 'fieldReports.approve');
CREATE TYPE "ProjectStatus" AS ENUM ('DRAFT', 'ACTIVE', 'ON_HOLD', 'COMPLETED', 'CANCELLED');
CREATE TYPE "ProjectMemberRole" AS ENUM ('SUPERVISOR', 'WORKER', 'VIEWER');
CREATE TYPE "ReportStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "email" CITEXT NOT NULL,
    "passwordHash" VARCHAR(255) NOT NULL,
    "displayName" VARCHAR(120) NOT NULL,
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "tokenVersion" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Role" (
    "id" UUID NOT NULL,
    "code" VARCHAR(60) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "description" VARCHAR(300),
    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Permission" (
    "id" UUID NOT NULL,
    "code" "PermissionCode" NOT NULL,
    "description" VARCHAR(300),
    CONSTRAINT "Permission_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "UserRole" (
    "userId" UUID NOT NULL,
    "roleId" UUID NOT NULL,
    CONSTRAINT "UserRole_pkey" PRIMARY KEY ("userId","roleId")
);

CREATE TABLE "RolePermission" (
    "roleId" UUID NOT NULL,
    "permissionId" UUID NOT NULL,
    CONSTRAINT "RolePermission_pkey" PRIMARY KEY ("roleId","permissionId")
);

CREATE TABLE "Client" (
    "id" UUID NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "taxId" VARCHAR(50),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Client_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Contact" (
    "id" UUID NOT NULL,
    "clientId" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "email" VARCHAR(254),
    "phone" VARCHAR(40),
    "position" VARCHAR(100),
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "Contact_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Project" (
    "id" UUID NOT NULL,
    "code" VARCHAR(40) NOT NULL,
    "clientId" UUID NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "description" TEXT,
    "status" "ProjectStatus" NOT NULL DEFAULT 'DRAFT',
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProjectMember" (
    "projectId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "role" "ProjectMemberRole" NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProjectMember_pkey" PRIMARY KEY ("projectId","userId")
);

CREATE TABLE "FieldReport" (
    "id" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "authorId" UUID NOT NULL,
    "approverId" UUID,
    "reportDate" DATE NOT NULL,
    "summary" TEXT NOT NULL,
    "personnelCount" INTEGER NOT NULL DEFAULT 0,
    "weatherNotes" TEXT,
    "weatherSnapshot" JSONB,
    "incidentNotes" TEXT,
    "status" "ReportStatus" NOT NULL DEFAULT 'DRAFT',
    "submittedAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "clientUpdatedAt" TIMESTAMP(3) NOT NULL,
    "idempotencyKey" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "FieldReport_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Attachment" (
    "id" UUID NOT NULL,
    "reportId" UUID NOT NULL,
    "objectKey" VARCHAR(500) NOT NULL,
    "fileName" VARCHAR(255) NOT NULL,
    "contentType" VARCHAR(120) NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Attachment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AuditLog" (
    "id" UUID NOT NULL,
    "actorId" UUID,
    "action" VARCHAR(120) NOT NULL,
    "entityType" VARCHAR(80) NOT NULL,
    "entityId" VARCHAR(80),
    "metadata" JSONB,
    "ipAddress" VARCHAR(64),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE UNIQUE INDEX "Role_code_key" ON "Role"("code");
CREATE UNIQUE INDEX "Permission_code_key" ON "Permission"("code");
CREATE UNIQUE INDEX "Client_taxId_key" ON "Client"("taxId");
CREATE INDEX "Contact_clientId_idx" ON "Contact"("clientId");
CREATE UNIQUE INDEX "Project_code_key" ON "Project"("code");
CREATE INDEX "Project_clientId_status_idx" ON "Project"("clientId", "status");
CREATE INDEX "ProjectMember_userId_idx" ON "ProjectMember"("userId");
CREATE UNIQUE INDEX "FieldReport_idempotencyKey_key" ON "FieldReport"("idempotencyKey");
CREATE INDEX "FieldReport_projectId_reportDate_idx" ON "FieldReport"("projectId", "reportDate");
CREATE INDEX "FieldReport_authorId_status_idx" ON "FieldReport"("authorId", "status");
CREATE UNIQUE INDEX "Attachment_objectKey_key" ON "Attachment"("objectKey");
CREATE INDEX "Attachment_reportId_idx" ON "Attachment"("reportId");
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");
CREATE INDEX "AuditLog_actorId_createdAt_idx" ON "AuditLog"("actorId", "createdAt");

-- AddForeignKey
ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "Permission"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Project" ADD CONSTRAINT "Project_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProjectMember" ADD CONSTRAINT "ProjectMember_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProjectMember" ADD CONSTRAINT "ProjectMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FieldReport" ADD CONSTRAINT "FieldReport_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FieldReport" ADD CONSTRAINT "FieldReport_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FieldReport" ADD CONSTRAINT "FieldReport_approverId_fkey" FOREIGN KEY ("approverId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "FieldReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
