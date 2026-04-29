# Release Checklist

Phase 7 of the roadmap. Run through this before submitting to TestFlight /
Play Internal Testing.

## Backend
- [ ] Production Postgres (managed). Backups + PITR enabled.
- [ ] Redis instance (managed) for rate-limit counters.
- [ ] Object storage (Cloudflare R2 / S3) bucket created with private ACL.
- [ ] `JWT_SECRET` is a fresh 32+ byte random — **not** the dev value.
- [ ] `BCRYPT_ROUNDS=12` in production.
- [ ] CORS origin pinned to the mobile app's deep-link origin (or kept open if no web client).
- [ ] All migrations applied: `pnpm --filter ./server migrate`.
- [ ] Smoke test green against the prod URL: `BASE=https://api.yourdomain.example bash scripts/smoke-test.sh`.
- [ ] Rate-limit configuration reviewed (currently 200/min/IP — tune for prod).

## Mobile config
- [ ] `EXPO_PUBLIC_API_BASE_URL` set in EAS build profile.
- [ ] App icon, splash screen, and adaptive icon set.
- [ ] App version bumped in `app.json` (`expo.version`, `expo.android.versionCode`, `expo.ios.buildNumber`).
- [ ] Privacy manifest (iOS): list `NSMicrophoneUsageDescription` and any analytics SDK reasons.
- [ ] Apple App Privacy survey filled — **only** the categories actually collected (see `docs/PRIVACY.md`).
- [ ] Play Console Data Safety form filled — same.

## Native build (after `expo prebuild`)
- [ ] Whisper + LLM modules registered (`docs/PHASE1_INTEGRATION.md`).
- [ ] Voice keyboard wired (`docs/PHASE3_INTEGRATION.md`) — optional for v1.
- [ ] Models bundled or downloaded on first launch (verify on a clean device).
- [ ] Mic permission rationale string approved by reviewers.

## Auth
- [ ] Google: real OAuth client IDs in `GOOGLE_CLIENT_IDS` env.
- [ ] Apple: Service ID + key in Apple Developer console; `APPLE_CLIENT_IDS` env set.
- [ ] Refresh-token rotation tested across reinstall.

## Privacy / legal
- [ ] `docs/PRIVACY.md` reviewed by a lawyer; URL accessible from inside the app + store listing.
- [ ] `docs/TERMS.md` reviewed; URL accessible.
- [ ] DPA in place with each sub-processor (Postgres, R2, etc.).

## Observability
- [ ] Server logs ship to a central store (Loki, Datadog, …).
- [ ] Error tracking enabled on mobile (Sentry free tier).
- [ ] Telemetry dashboard built on the `Event` table (top events, daily active accounts).

## Store assets
- [ ] iOS screenshots: 6.7" + 5.5" required.
- [ ] Android screenshots: phone + 7" tablet + 10" tablet.
- [ ] Feature graphic (Play Store).
- [ ] App preview videos (optional but raises conversion).

## Final sanity
- [ ] Fresh install on a real device → onboarding → signup → dictate → polish → history → sign out → sign in → history restored.
- [ ] Air-plane mode mid-dictation → outbox queues → reconnect → drains.
- [ ] Delete account flow wipes server data (verify with a DB query).
