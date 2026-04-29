package com.voiceflow.ime

import android.inputmethodservice.InputMethodService
import android.view.View
import android.view.inputmethod.EditorInfo
import android.widget.TextView
import com.voiceflow.nativecore.R // generated after prebuild + module wire-up

/**
 * VoiceFlow IME — system-wide voice keyboard.
 *
 * Phase 3 scaffold:
 *  - View hosts a single mic button (real layout in res/layout/voiceflow_ime.xml).
 *  - Tapping mic toggles VoiceFlowAudio + Whisper via the same JNI path the app uses.
 *  - On final transcript, commit text via currentInputConnection.commitText(...).
 *
 * Wire-up (after `expo prebuild`):
 *  1. Add this module path to settings.gradle.
 *  2. Add `<service>` entry to AndroidManifest with intent-filter
 *     "android.view.InputMethod" and meta-data pointing at res/xml/method.xml.
 *  3. Add res/xml/method.xml describing the IME subtype.
 *  4. User enables it in Settings → System → Languages & input → Keyboards.
 *
 * Mic permission: request through the app, not the IME (system restriction).
 */
class VoiceFlowImeService : InputMethodService() {
  private var micButton: TextView? = null
  private var recording = false

  override fun onCreateInputView(): View {
    val view = layoutInflater.inflate(R.layout.voiceflow_ime, null)
    val mic = view.findViewById<TextView>(R.id.mic_button)
    mic.setOnClickListener { onMicTap() }
    micButton = mic
    return view
  }

  override fun onStartInput(info: EditorInfo?, restarting: Boolean) {
    super.onStartInput(info, restarting)
    recording = false
    micButton?.text = "●"
  }

  private fun onMicTap() {
    if (recording) {
      stopAndCommit()
    } else {
      startCapture()
    }
  }

  private fun startCapture() {
    recording = true
    micButton?.text = "■"
    // TODO: bind to VoiceFlowAudio service (foreground) and start Whisper streaming.
    // The audio + whisper modules already exist in :voiceflow-native.
  }

  private fun stopAndCommit() {
    recording = false
    micButton?.text = "●"
    // TODO: stop capture, await final transcript, commit to current field:
    //   currentInputConnection?.commitText(finalText, 1)
  }
}
