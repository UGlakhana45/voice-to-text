-- Phase 6: explicit telemetry toggle (separate from cleanupEnabled).
ALTER TABLE "UserSettings"
  ADD COLUMN IF NOT EXISTS "telemetryEnabled" BOOLEAN NOT NULL DEFAULT FALSE;
