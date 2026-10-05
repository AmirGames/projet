CREATE TABLE "PrivacyAuditEvent" (
  "id" TEXT PRIMARY KEY, "actor" TEXT NOT NULL, "action" TEXT NOT NULL,
  "target" TEXT NOT NULL, "outcome" TEXT NOT NULL, "integrity" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "PrivacyAuditEvent_createdAt_idx" ON "PrivacyAuditEvent"("createdAt");
CREATE INDEX "PrivacyAuditEvent_actor_createdAt_idx" ON "PrivacyAuditEvent"("actor", "createdAt");
CREATE FUNCTION protect_privacy_audit() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' OR OLD."createdAt" > CURRENT_TIMESTAMP - INTERVAL '180 days' THEN
    RAISE EXCEPTION 'Privacy audit is append-only during its retention period';
  END IF;
  RETURN OLD;
END;
$$;
CREATE TRIGGER privacy_audit_immutable BEFORE UPDATE OR DELETE ON "PrivacyAuditEvent"
FOR EACH ROW EXECUTE FUNCTION protect_privacy_audit();
CREATE TABLE "ErasureRecord" (
  "id" TEXT PRIMARY KEY, "subjectId" TEXT NOT NULL, "scope" TEXT NOT NULL,
  "erasedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "ErasureRecord_subjectId_scope_key" ON "ErasureRecord"("subjectId", "scope");
CREATE INDEX "ErasureRecord_erasedAt_idx" ON "ErasureRecord"("erasedAt");
CREATE TABLE "PrivacyErasureRequest" (
  "userId" TEXT PRIMARY KEY, "status" TEXT NOT NULL DEFAULT 'PENDING',
  "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3)
);
CREATE INDEX "PrivacyErasureRequest_status_requestedAt_idx" ON "PrivacyErasureRequest"("status", "requestedAt");
CREATE TABLE "PrivacyLegalHold" (
  "id" TEXT PRIMARY KEY, "model" TEXT NOT NULL, "recordId" TEXT NOT NULL,
  "reason" TEXT NOT NULL, "createdBy" TEXT NOT NULL, "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "PrivacyLegalHold_model_recordId_key" ON "PrivacyLegalHold"("model", "recordId");
CREATE INDEX "PrivacyLegalHold_expiresAt_idx" ON "PrivacyLegalHold"("expiresAt");
ALTER TABLE "DriverPayout" ADD COLUMN "beneficiaryJson" JSONB NOT NULL DEFAULT '{}';
CREATE FUNCTION reject_privacy_audit_truncate() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Privacy audit cannot be truncated'; END;
$$;
CREATE TRIGGER privacy_audit_no_truncate BEFORE TRUNCATE ON "PrivacyAuditEvent"
FOR EACH STATEMENT EXECUTE FUNCTION reject_privacy_audit_truncate();
