package com.voiceflow.nativecore

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager

class VoiceFlowNativePackage : ReactPackage {
    override fun createNativeModules(ctx: ReactApplicationContext): List<NativeModule> = listOf(
        VoiceFlowWhisperModule(ctx),
        VoiceFlowLlmModule(ctx),
        VoiceFlowAudioModule(ctx),
    )

    override fun createViewManagers(ctx: ReactApplicationContext): List<ViewManager<*, *>> = emptyList()
}
