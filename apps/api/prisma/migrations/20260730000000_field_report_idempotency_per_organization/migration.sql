-- Scope idempotency to the organization so independent tenants may safely retry the same client-generated key.
DROP INDEX "FieldReport_idempotencyKey_key";
CREATE UNIQUE INDEX "FieldReport_organizationId_idempotencyKey_key"
ON "FieldReport"("organizationId", "idempotencyKey");
