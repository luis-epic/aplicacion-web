-- CreateOrganizationSchema
CREATE TABLE "Organization" (
    "id" UUID NOT NULL,
    "code" VARCHAR(40) NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "taxId" VARCHAR(50),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OrganizationSite" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "code" VARCHAR(60) NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "address" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "OrganizationSite_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OrganizationPlant" (
    "id" UUID NOT NULL,
    "siteId" UUID NOT NULL,
    "code" VARCHAR(60) NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "capacityM3PerHour" DECIMAL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "OrganizationPlant_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OrganizationFeature" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "featureKey" VARCHAR(100) NOT NULL,
    "isEnabled" BOOLEAN NOT NULL DEFAULT false,
    "config" JSONB,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "OrganizationFeature_pkey" PRIMARY KEY ("id")
);

-- CreateIndexes
CREATE UNIQUE INDEX "Organization_code_key" ON "Organization"("code");
CREATE UNIQUE INDEX "Organization_taxId_key" ON "Organization"("taxId");
CREATE INDEX "Organization_code_idx" ON "Organization"("code");
CREATE INDEX "Organization_taxId_idx" ON "Organization"("taxId");

CREATE UNIQUE INDEX "OrganizationSite_code_key" ON "OrganizationSite"("code");
CREATE INDEX "OrganizationSite_organizationId_code_idx" ON "OrganizationSite"("organizationId", "code");
CREATE INDEX "OrganizationSite_organizationId_isPrimary_idx" ON "OrganizationSite"("organizationId", "isPrimary");

CREATE INDEX "OrganizationPlant_siteId_code_idx" ON "OrganizationPlant"("siteId", "code");

CREATE UNIQUE INDEX "OrganizationFeature_organizationId_featureKey_key" ON "OrganizationFeature"("organizationId", "featureKey");
CREATE INDEX "OrganizationFeature_featureKey_idx" ON "OrganizationFeature"("featureKey");

-- AddForeignKey
ALTER TABLE "OrganizationSite" ADD CONSTRAINT "OrganizationSite_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OrganizationPlant" ADD CONSTRAINT "OrganizationPlant_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "OrganizationSite"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OrganizationFeature" ADD CONSTRAINT "OrganizationFeature_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddOrganizationFieldsToUser
ALTER TABLE "User" ADD COLUMN "organizationId" UUID;
ALTER TABLE "User" ADD COLUMN "siteId" UUID;
ALTER TABLE "User" ADD CONSTRAINT "User_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "User" ADD CONSTRAINT "User_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "OrganizationSite"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "User_organizationId_idx" ON "User"("organizationId");
CREATE INDEX "User_siteId_idx" ON "User"("siteId");

-- AddOrganizationFieldsToRole
ALTER TABLE "Role" ADD COLUMN "organizationId" UUID NOT NULL DEFAULT '00000000-0000-4000-8000-000000000000';
ALTER TABLE "Role" ADD CONSTRAINT "Role_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE UNIQUE INDEX "Role_organizationId_code_key" ON "Role"("organizationId", "code");
CREATE INDEX "Role_organizationId_idx" ON "Role"("organizationId");

-- AddOrganizationFieldsToPermission
ALTER TABLE "Permission" ADD COLUMN "organizationId" UUID NOT NULL DEFAULT '00000000-0000-4000-8000-000000000000';
ALTER TABLE "Permission" ADD CONSTRAINT "Permission_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE UNIQUE INDEX "Permission_organizationId_code_key" ON "Permission"("organizationId", "code");
CREATE INDEX "Permission_organizationId_idx" ON "Permission"("organizationId");

-- AddOrganizationFieldsToClient
ALTER TABLE "Client" ADD COLUMN "organizationId" UUID NOT NULL DEFAULT '00000000-0000-4000-8000-000000000000';
ALTER TABLE "Client" ADD CONSTRAINT "Client_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "Client_organizationId_name_idx" ON "Client"("organizationId", "name");
CREATE INDEX "Client_organizationId_taxId_idx" ON "Client"("organizationId", "taxId");

-- AddOrganizationFieldsToProject
ALTER TABLE "Project" ADD COLUMN "organizationId" UUID NOT NULL DEFAULT '00000000-0000-4000-8000-000000000000';
ALTER TABLE "Project" ADD CONSTRAINT "Project_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
DROP INDEX "Project_code_key";
CREATE UNIQUE INDEX "Project_organizationId_code_key" ON "Project"("organizationId", "code");
CREATE INDEX "Project_organizationId_clientId_status_idx" ON "Project"("organizationId", "clientId", "status");

-- AddOrganizationFieldsToFieldReport
ALTER TABLE "FieldReport" ADD COLUMN "organizationId" UUID NOT NULL DEFAULT '00000000-0000-4000-8000-000000000000';
ALTER TABLE "FieldReport" ADD CONSTRAINT "FieldReport_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "FieldReport_organizationId_projectId_reportDate_idx" ON "FieldReport"("organizationId", "projectId", "reportDate");
CREATE INDEX "FieldReport_organizationId_authorId_status_idx" ON "FieldReport"("organizationId", "authorId", "status");

-- AddOrganizationFieldsToPublication
ALTER TABLE "Publication" ADD COLUMN "organizationId" UUID NOT NULL DEFAULT '00000000-0000-4000-8000-000000000000';
ALTER TABLE "Publication" ADD CONSTRAINT "Publication_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "Publication_organizationId_status_publishedAt_idx" ON "Publication"("organizationId", "status", "publishedAt");
CREATE INDEX "Publication_organizationId_projectId_status_idx" ON "Publication"("organizationId", "projectId", "status");
CREATE INDEX "Publication_organizationId_type_category_idx" ON "Publication"("organizationId", "type", "category");

-- AddOrganizationFieldsToWorkTask
ALTER TABLE "WorkTask" ADD COLUMN "organizationId" UUID NOT NULL DEFAULT '00000000-0000-4000-8000-000000000000';
ALTER TABLE "WorkTask" ADD CONSTRAINT "WorkTask_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "WorkTask_organizationId_assigneeId_status_dueAt_idx" ON "WorkTask"("organizationId", "assigneeId", "status", "dueAt");
CREATE INDEX "WorkTask_organizationId_projectId_status_idx" ON "WorkTask"("organizationId", "projectId", "status");
CREATE INDEX "WorkTask_organizationId_supervisorId_status_idx" ON "WorkTask"("organizationId", "supervisorId", "status");

-- AddOrganizationFieldsToAuditLog
ALTER TABLE "AuditLog" ADD COLUMN "organizationId" UUID;
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "AuditLog_organizationId_entityType_entityId_idx" ON "AuditLog"("organizationId", "entityType", "entityId");

-- AddConcreteOrderModel
CREATE TABLE "ConcreteOrder" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "projectCode" VARCHAR(40) NOT NULL,
    "projectCodeId" UUID,
    "plantId" UUID,
    "mixDesignCode" VARCHAR(60) NOT NULL,
    "volumeM3" DECIMAL NOT NULL,
    "requiredAt" TIMESTAMP(3) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ConcreteOrder_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ConcreteOrder_organizationId_status_idx" ON "ConcreteOrder"("organizationId", "status");
CREATE INDEX "ConcreteOrder_organizationId_projectCodeId_status_idx" ON "ConcreteOrder"("organizationId", "projectCodeId", "status");
CREATE INDEX "ConcreteOrder_plantId_requiredAt_idx" ON "ConcreteOrder"("plantId", "requiredAt");

ALTER TABLE "ConcreteOrder" ADD CONSTRAINT "ConcreteOrder_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ConcreteOrder" ADD CONSTRAINT "ConcreteOrder_projectCodeId_fkey" FOREIGN KEY ("projectCodeId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ConcreteOrder" ADD CONSTRAINT "ConcreteOrder_plantId_fkey" FOREIGN KEY ("plantId") REFERENCES "OrganizationPlant"("id") ON DELETE SET NULL ON UPDATE CASCADE;