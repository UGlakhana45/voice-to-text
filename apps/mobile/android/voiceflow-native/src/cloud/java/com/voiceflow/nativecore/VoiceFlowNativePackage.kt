package com.voiceflow.nativecore

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager

/**
 * Cloud-flavor package: only the audio-capture module is registered.
 *
 * VoiceFlowWhisper / VoiceFlowLlm are intentionally absent in this build —
 * the JS layer (`apps/mobile/src/native/Whisper.ts`, `Llm.ts`) handles
 * `NativeModules.VoiceFlowWhisper === undefined` by rejecting calls with
 * a clear "native module not linked" error and `isLoaded()` returns false,
 * so transcription falls back to the cloud path automatically.
 */
class VoiceFlowNativePackage : ReactPackage {
    override fun createNativeModules(ctx: ReactApplicationContext): List<NativeModule> = listOf(
        VoiceFlowAudioModule(ctx),
    )

    override fun createViewManagers(ctx: ReactApplicationContext): List<ViewManager<*, *>> = emptyList()
}
