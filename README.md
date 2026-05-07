<div align="center">

# 🎙️ VoiceFlow

**Pick your trade-off: a tiny cloud app or a fully offline on-device one.**

Choose at first launch between **Cloud** (smallest install, best accuracy, multilingual translation), **On-device** (offline whisper.cpp + Gemma, audio never leaves the phone), or **Hybrid** (cloud first, on-device fallback). Voice-activity auto-stop, AI-powered cleanup, and system-wide dictation on Android.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)
[![Platform](https://img.shields.io/badge/platform-Android%20%7C%20iOS-lightgrey)](#)
[![React Native](https://img.shields.io/badge/React%20Native-0.74-61dafb)](#)

</div>

---

## ✨ Features

- 🎤 **Push-to-talk dictation** with auto-stop after 3 s of silence
- � **Pick your mode** — `cloud`, `on-device`, or `hybrid`, set during onboarding and changeable in Settings
- ☁️ **Backend AI proxy** — `/ai/stt`, `/ai/translate`, `/ai/cleanup` so users don't need their own API key
- 🌍 **Translation** — transcribe + translate to any target language via the proxy
- 🧠 **On-device Whisper** (`whisper.cpp`) — bundled in the `full` build, works fully offline
- ✍️ **AI cleanup** — cloud (`gpt-4o-mini` / Llama-3.1) or local Gemma-2B via `llama.cpp` for punctuation, grammar and tone polish
- 📦 **Two APK flavors** — `cloud` (~10 MB, no JNI) and `full` (~80 MB with the on-device engines)
- 🗂️ **History sync** — Fastify + PostgreSQL backend with offline outbox
- 🔐 **Secure storage** — API keys and mode preference kept in the OS keystore via `expo-secure-store`
- ⌨️ **System keyboard (Android)** — dictate into any app

## 🏗️ Architecture

```
voice-to-text/
├── apps/mobile/                 # React Native (Expo bare) Android + iOS
│   ├── src/                     # TS source (screens, features, services)
│   ├── android/                 # Native Android + vendored whisper.cpp/llama.cpp
│   └── ios/                     # Native iOS bridges
├── server/                      # Fastify + Prisma + PostgreSQL backend
├── packages/
│   ├── shared-types/            # API contracts
│   ├── audio-core/              # VAD, ring buffer, chunker
│   ├── postprocess/             # Punctuation, hotwords, voice commands
│   └── sdk-client/              # Typed API client
├── docs/                        # Architecture & platform notes
├── docker-compose.yml           # Local Postgres + Redis + MinIO
└── LICENSE                      # MIT
```

## 🛠️ Prerequisites

| Tool             | Version    |
|------------------|------------|
| Node.js          | ≥ 20.10    |
| pnpm             | ≥ 9        |
| Docker + Compose | latest     |
| Android Studio   | + JDK 17   |
| Xcode (iOS only) | 15+ + CocoaPods |
| Free disk        | ~10 GB (for Whisper + LLM models) |

## 🚀 Quick start

```bash
# 1. Install workspace dependencies
pnpm install

# 2. Copy environment defaults
cp .env.example .env

# 3. Boot the local stack (Postgres + Redis + MinIO + Mailhog)
pnpm stack:up

# 4. Apply database migrations
pnpm --filter server migrate

# 5. Start everything in dev mode
pnpm dev
```

Local services:

| Service        | URL                                   |
|----------------|---------------------------------------|
| Backend API    | <http://localhost:4000>               |
| Mailhog UI     | <http://localhost:8025>               |
| MinIO console  | <http://localhost:9001> *(`minioadmin` / `minioadmin`)* |

## 📱 Run the mobile app

```bash
# Android (device or emulator)
pnpm --filter mobile android

# iOS (macOS only — first time: cd apps/mobile/ios && pod install)
pnpm --filter mobile ios
```

The first launch downloads a quantized Whisper `base` model (~140 MB) and an optional Gemma-2B Q4 model (~1.5 GB) into the app's private storage. You can skip the LLM and use punctuation-only cleanup.

## ☁️ Cloud transcription (optional)

Switch from on-device Whisper to a cloud provider for higher accuracy:

1. Open **Settings → Use OpenAI Cloud**
2. Pick a provider:
   - **Groq** — free tier, very fast (`whisper-large-v3-turbo`). Get a key at <https://console.groq.com/keys>.
   - **OpenAI** — paid (`whisper-1`). Get a key at <https://platform.openai.com/api-keys>.
3. Paste your API key → **Save**
4. Tap the mic and speak — the audio is uploaded directly from device to the chosen provider.

Keys are persisted in the OS keystore. If a cloud call fails (network / quota), the app transparently falls back to on-device Whisper.

## ⌨️ Voice commands

While dictating, the post-processor recognises spoken commands such as:

- *"new line"*, *"new paragraph"*
- *"comma"*, *"period"*, *"question mark"*
- *"all caps <word>"*

See [`packages/postprocess`](./packages/postprocess) for the full grammar.

## 🧪 Testing

```bash
pnpm -r test          # all packages
pnpm --filter server test
pnpm --filter mobile typecheck
```

## 📦 Building a release APK

The Android module ships with two product flavors so you can pick the trade-off
between install size and offline capability:

| Flavor  | Includes whisper.cpp / llama.cpp | APK size (arm64) | Offline mode |
|---------|----------------------------------|------------------|--------------|
| `cloud` | ❌ no                            | ~10–15 MB        | ❌            |
| `full`  | ✅ yes                            | ~80–100 MB       | ✅            |

```bash
cd apps/mobile/android

# Smallest, cloud-only build (no JNI, recommended default):
./gradlew :app:assembleCloudRelease
# → app/build/outputs/apk/cloud/release/app-cloud-release.apk

# Full build with on-device Whisper + Gemma:
./gradlew :app:assembleFullRelease
# → app/build/outputs/apk/full/release/app-full-release.apk
```

The `cloud` flavor still lets the user paste their own OpenAI/Groq key in
Settings (direct route). The `full` flavor adds the "on-device" and "hybrid"
modes shown in the onboarding wizard.

## 🌐 Deployment

The backend is a stateless Fastify app and runs on any Node-friendly host (Render, Fly.io, Railway, AWS, …) with a Postgres database.

A typical Render setup:

1. Push the repo to GitHub.
2. Create a **PostgreSQL** instance on Render and copy the internal database URL.
3. Create a **Web Service** pointing at the `server/` folder.
   - **Build:** `pnpm install --ignore-workspace && pnpm prisma generate && pnpm build`
   - **Start:** `pnpm start`
   - **Env:** `DATABASE_URL`, `JWT_SECRET`, `NODE_ENV=production`
4. Update `API_BASE_URL` in the mobile app and rebuild.

## 🤝 Contributing

Issues and pull requests are welcome. Please:

1. Fork the repo and create a feature branch.
2. Run `pnpm -r typecheck && pnpm -r test` before pushing.
3. Follow the existing code style (Prettier + ESLint).

## 📄 License

This project is released under the **MIT License** — see [`LICENSE`](./LICENSE).

### Third-party components

| Component           | License       | Notes                              |
|---------------------|---------------|------------------------------------|
| OpenAI Whisper      | MIT           | Speech-to-text model               |
| `whisper.cpp`       | MIT           | C++ Whisper inference              |
| `llama.cpp`         | MIT           | C++ LLM inference                  |
| Google Gemma        | Gemma Terms   | Commercial use permitted           |
| Microsoft Phi-3     | MIT           | Optional cleanup model             |

## 🙏 Acknowledgements

Built on the shoulders of giants — huge thanks to Georgi Gerganov, the OpenAI Whisper team, the React Native community, and everyone who has contributed to the open-source AI ecosystem.
