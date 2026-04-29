# Privacy Policy — VoiceFlow

_Last updated: 2026-04-29 — DRAFT_

> This document is a starting point. **Have it reviewed by a lawyer before
> publishing**, especially for jurisdictions with strict consent rules
> (EU, UK, India DPDPA, California CCPA).

## Summary
VoiceFlow processes your speech locally on your device. Audio is **not**
sent to our servers unless you explicitly enable Cloud Audio Backup.

## What we collect

| Category | When | Where it lives |
|---|---|---|
| Audio recordings | While you dictate | Device only by default. Sent to our object storage **only** if Cloud Audio Backup is on. |
| Transcripts (raw + cleaned) | After each dictation | Device + your account on our server, so you can recover history across devices. |
| Vocabulary, snippets, settings | When you save them | Device + your account. |
| Email, display name | At signup | Account record on our server. |
| Anonymous usage events | When telemetry is enabled (off by default) | Our event store. No transcript content. |
| IP address, user-agent | All HTTP requests | Server logs (rolling 30 days), telemetry events. |

## What we do **not** do
- We do not sell or share your data with advertisers.
- We do not train models on your audio or transcripts.
- We do not read your transcripts.

## Your rights
- **Export**: request a JSON export of your account at any time via Settings → Account → Export.
- **Delete**: Settings → Account → Delete Account permanently removes your account, transcripts, and any backed-up audio.
- **Withdraw consent**: turn off Cloud Audio Backup or Telemetry in Settings; previously collected data continues to follow your delete request when you submit one.

## Sub-processors
- **Object storage** (audio backup): _your choice_ — defaults to Cloudflare R2 when configured. In dev: MinIO running locally.
- **Database** (transcripts + accounts): your self-hosted Postgres instance.

## Contact
privacy@yourdomain.example
