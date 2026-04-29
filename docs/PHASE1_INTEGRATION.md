# Phase 1 — Native integration guide

This doc explains how to wire the Phase-1 native modules (under `apps/mobile/native-android/` and `apps/mobile/native-ios/`) into the Expo bare projects after `expo prebuild`.

---

## 1. Vendor upstream sources (one time)

```bash
# from repo root
./scripts/vendor-cpp.sh
```

Adds `apps/mobile/native/whisper.cpp` and `apps/mobile/native/llama.cpp` (MIT-licensed git submodules / clones).

## 2. (Optional) download dev models

```bash
./scripts/download-models.sh
```

Drops `ggml-base.bin` and `gemma-2-2b-it-q4.gguf` into `models/` for desktop testing. The mobile app downloads its own copies on first launch into app-private storage.

## 3. Generate native projects

```bash
cd apps/mobile
pnpm expo prebuild --clean
```

This creates `apps/mobile/android/` and `apps/mobile/ios/` (the standard Expo bare scaffolds — distinct from our `native-android/` / `native-ios/` source folders).

## 4. Wire Android module

After prebuild:

```bash
# copy our native module into the generated Android project
cp -R apps/mobile/native-android/voiceflow-native apps/mobile/android/
```

Edit `apps/mobile/android/settings.gradle`, append:

```gradle
include ':voiceflow-native'
project(':voiceflow-native').projectDir = new File(rootProject.projectDir, 'voiceflow-native')
```

Edit `apps/mobile/android/app/build.gradle`, in `dependencies { ... }`:

```gradle
implementation project(':voiceflow-native')
```

Register the package in `MainApplication.kt` (the file Expo generates), inside `getPackages()`:

```kotlin
add(com.voiceflow.nativecore.VoiceFlowNativePackage())
```

Add the runtime mic permission to `AndroidManifest.xml` (already declared by `app.json`, but verify):

```xml
<uses-permission android:name="android.permission.RECORD_AUDIO" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE_MICROPHONE" />
```

Build:

```bash
pnpm --filter mobile android
```

The first build is slow (compiles whisper.cpp + llama.cpp for arm64/armv7/x86_64). Subsequent builds are cached by Gradle/CMake.

## 5. Wire iOS module

After prebuild:

```bash
# copy our podspec + sources into the generated iOS project
mkdir -p apps/mobile/ios/VoiceFlowNative
cp -R apps/mobile/native-ios/VoiceFlowNative/ apps/mobile/ios/VoiceFlowNative/

# share the same C++ wrappers as Android
mkdir -p apps/mobile/ios/VoiceFlowNative/cpp
cp apps/mobile/native-android/voiceflow-native/src/main/cpp/whisper_wrapper.{h,cpp} apps/mobile/ios/VoiceFlowNative/cpp/
cp apps/mobile/native-android/voiceflow-native/src/main/cpp/llm_wrapper.{h,cpp}    apps/mobile/ios/VoiceFlowNative/cpp/
```

Edit `apps/mobile/ios/Podfile`, add inside the main target:

```ruby
pod 'VoiceFlowNative', :path => './VoiceFlowNative'
```

The podspec ships only the bridge sources. To add `whisper.cpp` and `llama.cpp` themselves, the cleanest path is to add them as separate Pods or Xcode subprojects. Recommended quick path: build static libs once and reference them, or use the prebuilt frameworks Georgi Gerganov publishes for Apple platforms.

```bash
cd apps/mobile/ios
pod install
cd ../../..
pnpm --filter mobile ios
```

Set `Info.plist` keys (already in `app.json` → applied by prebuild):

- `NSMicrophoneUsageDescription`
- `NSSpeechRecognitionUsageDescription`

## 6. Verify the JS bridge

In the mobile app, the JS bridges in `apps/mobile/src/native/{Whisper,Llm,AudioRecorder}.ts` look up `NativeModules.VoiceFlowWhisper`, `VoiceFlowLlm`, and `VoiceFlowAudio`. After steps 4 and 5, those symbols become available — the "native module not linked" fallback disappears.

Smoke test from Metro:

```js
import { Whisper } from './src/native/Whisper';
console.log(await Whisper.isLoaded()); // false until loaded
```

## 7. Runtime flow

1. App launches → `ModelDownloadGate` checks for `ggml-base.bin` and `gemma-*.gguf` in `FileSystem.documentDirectory/models/`.
2. If missing, downloads them with progress UI.
3. `useDictation` calls `ensureWhisperLoaded()` lazily before first transcription.
4. `AudioRecorder.start()` fires `frame` events → `Chunker` aligns on VAD silences → `Whisper.transcribePcm()` per chunk → text appended on screen.
5. User taps **Polish** → `ensureLlmLoaded()` → `Llm.cleanup(text, { tone })`.

## 8. Known gotchas

- **OpenMP on Android NDK**: disabled (`-DGGML_OPENMP=OFF`) because NDK r26 doesn't ship libomp by default for all ABIs.
- **`x86_64` ABI** is included for emulators; drop it in `defaultConfig.ndk.abiFilters` for smaller release APKs.
- **iOS simulator** runs whisper.cpp on x86_64 — slower than a real arm64 device. Test latency on hardware before committing to default model size.
- **First inference is always slow** (model warmup). Hide it behind a "Preparing model…" indicator on first transcribe.
- **App size**: the LLM (~1.5 GB) is downloaded, never bundled. The whisper-base ggml is ~140 MB and also downloaded.

## 9. License compliance

Add a NOTICE file before shipping:

```
This product includes software developed by:
  - OpenAI (Whisper) — MIT
  - Georgi Gerganov (whisper.cpp, llama.cpp) — MIT
  - Google (Gemma) — Gemma Terms of Use
  - Microsoft (Phi-3) — MIT (if used instead of Gemma)
```
