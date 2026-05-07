package com.voiceflow.nativecore

import com.facebook.react.bridge.*
import kotlinx.coroutines.*

class VoiceFlowLlmModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    companion object {
        init { System.loadLibrary("voiceflow_native") }
    }

    private val scope = CoroutineScope(Dispatchers.Default + SupervisorJob())

    override fun getName(): String = "VoiceFlowLlm"

    private external fun nativeLoad(modelPath: String): Boolean
    private external fun nativeUnload()
    private external fun nativeIsLoaded(): Boolean
    private external fun nativeCleanup(rawText: String, tone: String, maxTokens: Int): String?

    @ReactMethod
    fun loadModel(modelPath: String, promise: Promise) {
        scope.launch {
            try {
                if (nativeLoad(modelPath)) promise.resolve(null)
                else promise.reject("E_LOAD", "Failed to load LLM at $modelPath")
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
    fun cleanup(rawText: String, opts: ReadableMap, promise: Promise) {
        scope.launch {
            try {
                val tone = if (opts.hasKey("tone")) opts.getString("tone") ?: "neutral" else "neutral"
                val maxTokens = if (opts.hasKey("maxTokens")) opts.getInt("maxTokens") else 512
                val out = nativeCleanup(rawText, tone, maxTokens) ?: rawText
                promise.resolve(out)
            } catch (e: Throwable) { promise.reject("E_CLEANUP", e) }
        }
    }
}
