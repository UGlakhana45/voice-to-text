# Phase 3 — System-wide Voice Input

System-wide dictation requires platform-specific extensions that live outside
the React Native bundle. Both platforms reuse the Phase-1 native modules
(Whisper, LLM, AudioRecorder) via shared C++ + JNI/Obj-C++ wrappers.

This doc lists exactly what to do **after `expo prebuild`** to wire the
scaffolded code in `apps/mobile/native-android/voiceflow-ime/` and
`apps/mobile/native-ios/VoiceFlowKeyboard/`.

---

## Android — Voice IME

### 1. Wire the gradle module
After `expo prebuild`, an `android/` folder is generated. Edit:

- `android/settings.gradle` — append:
  ```gradle
  include ':voiceflow-ime'
  project(':voiceflow-ime').projectDir = new File('../native-android/voiceflow-ime')
  ```
- `android/app/build.gradle` — under `dependencies { … }`:
  ```gradle
  implementation project(':voiceflow-ime')
  ```

### 2. Manifest entries
Merge the contents of
`apps/mobile/native-android/voiceflow-ime/src/main/AndroidManifest.xml`
into `android/app/src/main/AndroidManifest.xml` (the `<service>` block goes
inside `<application>`).

### 3. Permissions
Add to the host manifest if not already present:
```xml
<uses-permission android:name="android.permission.RECORD_AUDIO" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE_MICROPHONE" />
```

The IME itself cannot request mic permission — request it from the host
app first (existing onboarding already does this) and the IME will inherit
the grant.

### 4. Foreground mic service
Create `VoiceFlowMicService` (foreground service, type `microphone`) so audio
keeps streaming when the keyboard view is hidden during long-form dictation.
The service shares the `VoiceFlowAudioModule` instance via a bound binder.

### 5. User flow
1. Install the dev build (`expo run:android` or signed APK).
2. Settings → System → Languages & input → On-screen keyboards → Manage →
   enable **VoiceFlow Voice Keyboard**.
3. Tap the keyboard switcher in any text field → pick VoiceFlow.

### 6. Optional: floating bubble
For drive-time use, add a `SYSTEM_ALERT_WINDOW`-permission opt-in screen
that launches a foreground service drawing an overlay bubble. Keep this
**off by default** — Play Store reviewers reject apps that request the
permission without justification.

---

## iOS — Voice Keyboard Extension

### 1. Add the extension target
After `expo prebuild`, open `ios/VoiceFlow.xcworkspace`. File → New →
Target → **Custom Keyboard Extension** named `VoiceFlowKeyboard`.

Replace the auto-generated `KeyboardViewController.swift` with the content of
`apps/mobile/native-ios/VoiceFlowKeyboard/VoiceFlowKeyboardViewController.swift`.

### 2. Info.plist (extension)
Set inside `NSExtension.NSExtensionAttributes`:
- `RequestsOpenAccess` = `YES` — required for mic + network access.
- `IsASCIICapable` = `NO`.
- `PrimaryLanguage` = `en-US`.

### 3. App Groups
Enable App Groups capability on **both** the host app target and the
keyboard target. Use `group.com.voiceflow.shared`. This lets the extension
read:
- Whisper / LLM model files from the host app's container.
- Auth token (read-only) for optional cloud audio backup.

### 4. Background mic
Background audio is not granted to keyboard extensions. Capture only while
the keyboard view is visible; commit text via `textDocumentProxy.insertText`
on stop.

### 5. Share Extension (optional)
Add a second target — **Share Extension** — to dictate replies into any
share-supporting app (Mail, Messages, …). It reuses the same view controller
with a different host (`SLComposeServiceViewController`).

### 6. User flow
1. Install via TestFlight or `expo run:ios`.
2. Settings → General → Keyboard → Keyboards → Add New Keyboard → VoiceFlow.
3. Toggle **Allow Full Access** (this surfaces the privacy dialog).

---

## Shared post-wire smoke test

1. Open Notes / WhatsApp / any text field.
2. Switch to VoiceFlow keyboard.
3. Tap mic, say "hello world period new line how are you question mark".
4. Expect: `hello world.\nhow are you?` committed inline.

The post-processing (commands + snippets + hotwords) is shared with the
in-app dictation path via the JS bundle running inside the host process —
on iOS the keyboard extension cannot host RN, so the **commit pipeline
runs natively** using a thin Swift port of `voiceflow-postprocess`. That
port is **not** in this scaffold yet; use the same regex tables when you
write it.
