# Android keyboard (InputMethodService)

The "kill feature" of VoiceFlow on Android: a system-wide keyboard with a mic key that dictates into any text field, in any app.

## Components (under `apps/mobile/android/keyboard/`)

- `VoiceFlowInputMethodService` (Kotlin) — extends `InputMethodService`. Owns lifecycle.
- `KeyboardView` — minimal layout with mic button + space + return + backspace + globe (switch IME).
- `DictationCoordinator` — orchestrates mic → Whisper → text insertion. Runs in a foreground service so the OS doesn't kill it.
- `AudioCaptureService` — `ForegroundService` with `FOREGROUND_SERVICE_MICROPHONE` type (Android 14+).

## Manifest entries

```xml
<service
    android:name=".keyboard.VoiceFlowInputMethodService"
    android:label="@string/voiceflow_keyboard"
    android:permission="android.permission.BIND_INPUT_METHOD"
    android:exported="true">
    <intent-filter>
        <action android:name="android.view.InputMethod" />
    </intent-filter>
    <meta-data
        android:name="android.view.im"
        android:resource="@xml/method" />
</service>

<service
    android:name=".keyboard.AudioCaptureService"
    android:foregroundServiceType="microphone"
    android:exported="false" />
```

## Flow

1. User long-presses mic → `AudioCaptureService` starts.
2. Frames stream into `whisper-jni` for streaming inference.
3. Partial results show in the candidate strip.
4. User releases → final transcript committed via `currentInputConnection.commitText(text, 1)`.
5. Optional: a "polish" key runs the `llama.cpp` pass on the most recent commit.

## Why a foreground service

Android 14 enforces `foregroundServiceType="microphone"` for any background mic use. The IME process itself is foregrounded only while keys are visible; the dictation must outlive any pause.

## Privacy

- Notification clearly states "VoiceFlow is using the microphone."
- A persistent settings page in the main app lets the user view/disable history.
- All audio stays on device unless cloud backup is enabled in Settings.
