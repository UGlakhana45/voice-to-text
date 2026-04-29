# VoiceFlow

On-device speech-to-text + AI cleanup, system-wide dictation for Android & iOS. Built on open-source Whisper (`whisper.cpp`) and a small on-device LLM (Gemma-2B / Phi-3-mini via `llama.cpp`). Backed by a Fastify + Postgres backend that runs entirely on a zero-signup local Docker stack for the demo.

> Status: **Phase 0 — scaffolding**. Native modules (Kotlin JNI for whisper.cpp, Swift bridge for iOS) and the Expo bare projects are stubbed and require additional setup steps documented below.

---

## Repository layout

```
voice-to-text/
├── apps/
│   └── mobile/              # React Native (Expo bare) — Android + iOS
├── server/                  # Fastify + node-postgres backend
├── packages/
│   ├── shared-types/        # API contracts shared between mobile + server
│   ├── audio-core/          # VAD, ring buffer, chunker (TS)
│   ├── postprocess/         # punctuation, hotwords, command parser
│   └── sdk-client/          # typed API client used by mobile + web
├── docs/                    # architecture + platform notes
├── docker-compose.yml       # postgres, redis, minio, mailhog
├── .env.example
└── README.md
```

## Prerequisites

- **Node** ≥ 20.10
- **pnpm** ≥ 9 (`npm i -g pnpm`)
- **Docker** + **Docker Compose**
- **Android**: Android Studio + JDK 17 + an emulator or device
- **iOS** (macOS only): Xcode 15+ + CocoaPods
- ~10 GB free disk space (for whisper + LLM models, downloaded on first app launch)

## First-time setup

```bash
# 1. install dependencies
pnpm install

# 2. copy env defaults
cp .env.example .env

# 3. start the local stack (postgres + redis + minio + mailhog)
pnpm stack:up

# 4. run database migrations
pnpm --filter server migrate

# 5. start everything in dev
pnpm dev
```

This runs:
- Backend: <http://localhost:4000>
- Mailhog UI: <http://localhost:8025>
- MinIO console: <http://localhost:9001> (login: `minioadmin` / `minioadmin`)

## Mobile app

```bash
# Android
pnpm --filter mobile android

# iOS (macOS only — first time only: cd apps/mobile/ios && pod install)
pnpm --filter mobile ios
```

The first launch downloads a quantized Whisper `base` model (~140 MB) and the Gemma-2B Q4 model (~1.5 GB) into the app's private storage. You can skip the LLM and use punctuation-only cleanup.

## Demo definition

See [`docs/ROADMAP.md`](./docs/ROADMAP.md). The Phase-1 demo target:

1. Mic button → push-to-talk → live transcript via on-device Whisper
2. "Polish" → on-device LLM cleanup with diff view
3. History tab with replay
4. Sign up / log in → settings sync to local Postgres
5. Custom keyboard (Android) → dictate into any app

## Architecture

See [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md), [`docs/ANDROID_KEYBOARD.md`](./docs/ANDROID_KEYBOARD.md), and [`docs/IOS_LIMITS.md`](./docs/IOS_LIMITS.md).

## Licensing

- Application code: MIT (this repo)
- Whisper: MIT (OpenAI)
- whisper.cpp / llama.cpp: MIT (Georgi Gerganov)
- Gemma: Gemma Terms of Use (commercial allowed)
- Phi-3: MIT
