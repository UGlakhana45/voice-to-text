# iOS limits & how we work around them

iOS imposes harder restrictions on system-wide dictation than Android. This document is the source of truth so we don't accidentally promise features Apple won't approve.

## What we cannot do on iOS

| Want | Blocked because |
|---|---|
| Floating mic bubble over other apps | iOS has no equivalent of `SYSTEM_ALERT_WINDOW`. |
| Always-on background mic | App Store rejects. Background audio entitlement is for playback. |
| Keyboard extension that records the mic without "Full Access" | Apple disallows; even with Full Access, App Review scrutinizes heavily. |

## What we can do

### 1. In-app dictation pad (primary flow)

Open the app → press mic → speak → cleaned text → "Copy" or "Share". Most reliable, fastest review.

### 2. Share / Action Extension

Long-press text in any app → Share → "Dictate with VoiceFlow" → modal opens with mic → returns cleaned text into the host app's selection. Fully approved use case.

### 3. Keyboard Extension (limited)

Install VoiceFlow keyboard. Mic button **opens the main app** (deep link), where dictation runs. Cleaned text is written to the App Group container; on return to the keyboard, it's inserted via `textDocumentProxy.insertText()`.

This is the same pattern Apple's own dictation key uses for third-party keyboards.

### 4. App Group shared container

- ID: `group.com.udaylakhana.voiceflow`
- Used by the main app, keyboard extension, and share extension to share:
  - Last-dictated text
  - User vocab + snippets
  - Settings

## App Review notes (for future submission)

- Microphone usage descriptions in `Info.plist`: `NSMicrophoneUsageDescription`, `NSSpeechRecognitionUsageDescription`.
- Be explicit in review notes that all transcription happens on-device.
- If we ever add cloud STT, declare the data category and link a privacy policy.

## Roadmap-only

If we later add an iPadOS-only "floating window" mode (Stage Manager) we can revisit a more keyboard-like UX, but it's not in scope for v1.
