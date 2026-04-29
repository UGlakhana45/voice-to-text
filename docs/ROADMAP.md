# Roadmap

> Track progress here. Mark phases done as we ship.

## Phase 0 — Scaffolding ✅
- pnpm + turborepo monorepo
- Backend (Fastify + node-postgres) skeleton with raw-SQL migrations
- Shared packages (`shared-types`, `audio-core`, `postprocess`, `sdk-client`)
- RN/Expo bare app skeleton with screens (Dictate, History, Settings)
- Native module **interfaces** for Whisper, Llm, AudioRecorder (no implementation yet)
- docker-compose: postgres + redis + minio + mailhog
- `.env.example` with zero-signup defaults
- Documentation: ARCHITECTURE, ANDROID_KEYBOARD, IOS_LIMITS

## Phase 1 — Core STT ✅ (code written, requires `expo prebuild` + native build)
- ✅ Vendor scripts: `scripts/vendor-cpp.sh`, `scripts/download-models.sh`
- ✅ Android JNI bridge (`native-android/voiceflow-native/`): `whisper_wrapper`, `llm_wrapper`, JNI glue, CMakeLists, build.gradle
- ✅ Android Kotlin modules: `VoiceFlowWhisperModule`, `VoiceFlowLlmModule`, `VoiceFlowAudioModule`, `VoiceFlowNativePackage`
- ✅ iOS Obj-C++ modules (`native-ios/VoiceFlowNative/`): `VoiceFlowWhisper`, `VoiceFlowLlm`, `VoiceFlowAudio` + podspec
- ✅ Shared C++ wrappers reused across Android JNI and iOS Obj-C++
- ✅ Mobile-side `services/models.ts` + `ModelDownloadGate` onboarding screen
- ✅ App now gates entry on model download
- ✅ Integration guide: `docs/PHASE1_INTEGRATION.md`
- ⏳ User action: run `expo prebuild`, follow integration guide, first device build.
- **Demo target**: in-app dictation works on a connected Android device.

## Phase 2 — On-device LLM cleanup ✅ (code; benchmark requires device)
- ✅ Vendor `llama.cpp` (`scripts/vendor-cpp.sh`)
- ⏳ Bundle Gemma-2B Q4 vs Phi-3-mini; benchmark on real device
- ✅ Tone prompt templates (`packages/postprocess/src/tones.ts`)
- ✅ Diff view (raw vs cleaned) on HomeScreen
- ✅ `PATCH /sync/dictations/:id` to persist cleanedText + tone
- ✅ JS fallback cleanup when native LLM is unavailable

## Phase 3 — System-wide input (scaffolded; requires `expo prebuild`)
- ✅ Android IME scaffold: `apps/mobile/native-android/voiceflow-ime/`
- ✅ iOS Keyboard Extension scaffold: `apps/mobile/native-ios/VoiceFlowKeyboard/`
- ✅ Integration guide: `docs/PHASE3_INTEGRATION.md`
- ⏳ Foreground mic service (Android) — TODO inside IME service
- ⏳ Share Extension (iOS) — sketch in PHASE3 doc
- ⏳ Floating bubble (`SYSTEM_ALERT_WINDOW`) — opt-in, deferred

## Phase 4 — Productivity layer ✅ (logic; per-app profiles deferred)
- ✅ Hotword biasing wired into `Whisper.transcribePcm` (`buildInitialPrompt`)
- ✅ Voice commands (`parseCommands` + `applyCommandOps`) applied on stop
- ✅ Snippet expansion with non-word boundary matching
- ✅ User-data store (`useUserData`) hydrating vocab + snippets from server
- ✅ Unit tests in `packages/postprocess/src/postprocess.test.ts` (9 passing)
- ⏳ Per-app profiles (Android: accessibility-driven; iOS: manual switcher) — Phase 6

## Phase 5 — Backend + sync ✅ (code; OAuth credentials user-side)
- ✅ Offline outbox (mobile, AsyncStorage-backed) drains on reconnect / sign-in
- ✅ OAuth id-token verify endpoints `POST /auth/oauth/google` + `POST /auth/oauth/apple` (jose + JWKS)
- ✅ Audio backup via S3-compatible presigned URLs (MinIO in dev, R2 in prod)
- ✅ Opt-in telemetry: `POST /telemetry/events` + mobile batched emitter, `telemetryEnabled` in settings
- ⏳ OAuth client IDs (Google console + Apple Developer) — user-side credential setup

## Phase 6 — Polish ✅ (core; a11y + i18n deferred to post-launch)
- ✅ Onboarding wizard (welcome → mic permission rationale → privacy)
- ✅ Model manager screen (download / delete + progress UI) under Settings
- ✅ Tone + theme + telemetry pickers in Settings
- ⏳ Full accessibility audit (a11y labels, dynamic type) — post-launch
- ⏳ i18n strings extraction — post-launch

## Phase 7 — Release (drafts ready; user-side execution)
- ✅ Privacy policy draft: `docs/PRIVACY.md`
- ✅ Terms of service draft: `docs/TERMS.md`
- ✅ Release checklist: `docs/RELEASE_CHECKLIST.md`
- ⏳ Store assets (icons, screenshots, feature graphic)
- ⏳ RevenueCat hooks (kept off until pricing decided)
- ⏳ Internal Testing / TestFlight uploads
