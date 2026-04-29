-- Phase 5: telemetry + provider auth.
-- Idempotent (migration runner uses CREATE IF NOT EXISTS via per-file marker).

CREATE TABLE IF NOT EXISTS "Event" (
  "id"          TEXT NOT NULL PRIMARY KEY,
  "userId"      TEXT,
  "name"        TEXT NOT NULL,
  "props"       JSONB NOT NULL DEFAULT '{}'::jsonb,
  "ts"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "ipAddress"   TEXT,
  "userAgent"   TEXT
);
CREATE INDEX IF NOT EXISTS "Event_userId_ts_idx" ON "Event"("userId", "ts");
CREATE INDEX IF NOT EXISTS "Event_name_ts_idx"   ON "Event"("name", "ts");

CREATE TABLE IF NOT EXISTS "OAuthIdentity" (
  "id"         TEXT NOT NULL PRIMARY KEY,
  "userId"     TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "provider"   TEXT NOT NULL,            -- 'google' | 'apple'
  "subject"    TEXT NOT NULL,            -- provider's `sub`
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "OAuthIdentity_provider_subject_key"
  ON "OAuthIdentity"("provider", "subject");
CREATE INDEX IF NOT EXISTS "OAuthIdentity_userId_idx" ON "OAuthIdentity"("userId");

-- Allow password-less users (OAuth-only). Existing rows already have a hash.
ALTER TABLE "User" ALTER COLUMN "passwordHash" DROP NOT NULL;
