package com.voiceflow.nativecore

import com.facebook.react.bridge.*
import kotlinx.coroutines.*

class VoiceFlowWhisperModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    companion object {
        init { System.loadLibrary("voiceflow_native") }
    }

    private val scope = CoroutineScope(Dispatchers.Default + SupervisorJob())

    override fun getName(): String = "VoiceFlowWhisper"

    private external fun nativeLoad(modelPath: String): Boolean
    private external fun nativeUnload()
    private external fun nativeIsLoaded(): Boolean
    private external fun nativeTranscribe(
        samples: FloatArray,
        language: String,
        initialPrompt: String,
        translate: Boolean
    ): Array<String>?

    @ReactMethod
    fun loadModel(modelPath: String, promise: Promise) {
        scope.launch {
            try {
                val ok = nativeLoad(modelPath)
                if (ok) promise.resolve(null)
                else promise.reject("E_LOAD", "Failed to load Whisper model at $modelPath")
            } catch (e: Throwable) { promise.reject("E_LOAD", e) }
        }
    }

    @ReactMethod
    fun unloadModel(promise: Promise) {
        scope.launch {
            try { nativeUnload(); promise.resolve(null) }
            catch (e: Throwable) { promise.reject("E_UNLOAD", e) }
        }
    }

    @ReactMethod
    fun isLoaded(promise: Promise) {
        try { promise.resolve(nativeIsLoaded()) }
        catch (e: Throwable) { promise.reject("E_STATE", e) }
    }

    @ReactMethod
    fun transcribePcm(samples: ReadableArray, opts: ReadableMap, promise: Promise) {
        scope.launch {
            try {
                val n = samples.size()
                val arr = FloatArray(n) { samples.getDouble(it).toFloat() }
                val lang = if (opts.hasKey("language")) opts.getString("language") ?: "auto" else "auto"
                val ip = if (opts.hasKey("initialPrompt")) opts.getString("initialPrompt") ?: "" else ""
                val tr = opts.hasKey("translate") && opts.getBoolean("translate")

                val res = nativeTranscribe(arr, lang, ip, tr)
                    ?: return@launch promise.reject("E_TRANSCRIBE", "Whisper not loaded")

                val out = Arguments.createMap().apply {
                    putString("text", res[0])
                    putString("language", res[1])
                    putInt("durationMs", res[2].toIntOrNull() ?: 0)
                }
                promise.resolve(out)
            } catch (e: Throwable) { promise.reject("E_TRANSCRIBE", e) }
        }
    }
}
