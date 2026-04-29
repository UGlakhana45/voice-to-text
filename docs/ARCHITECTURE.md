# Architecture

VoiceFlow is a fully on-device speech-to-text + AI cleanup app with an optional cloud backend for sync, auth, and (later) subscriptions.

## Layers

```
┌─────────────────────────────────────────────────────────────────┐
│                        React Native (TS)                        │
│  Screens   |  features/  |  state (zustand)  |  sdk-client      │
├─────────────────────────────────────────────────────────────────┤
│                  Native bridge (TS interface)                   │
│  Whisper.ts        Llm.ts        AudioRecorder.ts (events)      │
├──────────────────────────┬──────────────────────────────────────┤
│       Android (Kotlin)   │           iOS (Swift)                │
│  • InputMethodService    │  • Keyboard Extension                │
│  • Floating bubble       │  • Share Extension                   │
│  • Foreground service    │  • App Group shared container        │
│  • whisper-jni (.so)     │  • WhisperBridge (.a)                │
├──────────────────────────┴──────────────────────────────────────┤
│                whisper.cpp + llama.cpp (C/C++)                  │
│             Quantized GGUF weights, on-device only              │
└─────────────────────────────────────────────────────────────────┘
                                  │
                                  │ (optional, for sync only)
                                  ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Fastify backend (TS)                         │
│   /auth   /sync   /billing(stub)   /telemetry(opt-in)           │
│   Postgres   Redis   S3 (Minio in dev, R2 in prod)              │
└─────────────────────────────────────────────────────────────────┘
```

## Audio pipeline

`mic → 16 kHz Float32 PCM frames → AudioRecorder native event → Chunker (VAD-aligned) → Whisper.transcribePcm() → basicPunctuate() → UI`

The polish pass is deferred and explicit: user taps "Polish" → `Llm.cleanup(rawText, { tone })` → diff view.

## Data flow / sync

- All data lives **first** in local SQLite/MMKV on device.
- Sync is opportunistic: a debounced `push` after writes, a `pull?since=...` on app foreground.
- Last-writer-wins per record. Vector clocks deferred until multi-device editing matters.
- Audio backups (encrypted) are opt-in and uploaded via presigned S3 PUT — server never holds raw audio in memory.

## Security

- All inference is local; no audio leaves the device by default.
- Backend stores only what the user opts to sync.
- JWTs signed with HS256; refresh tokens hashed with bcrypt.
- TLS terminated at the edge (Fly/Cloudflare) in production.

## Pluggability

- `Whisper` / `Llm` / `AudioRecorder` are interfaces. Adapters can be swapped (e.g. cloud STT for low-end devices) without touching screens or state.
- `sdk-client` is the only place the app talks to the backend; replace base URL or transport without touching app code.
