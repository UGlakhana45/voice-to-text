package com.voiceflow.nativecore

import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule
import kotlinx.coroutines.*
import kotlin.math.min

/**
 * 16 kHz mono Float32 PCM streamer.
 * Emits a "frame" event to JS every ~100ms with the raw samples.
 */
class VoiceFlowAudioModule(private val reactCtx: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactCtx) {

    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    @Volatile private var recording = false
    private var job: Job? = null
    private var startMs: Long = 0

    override fun getName(): String = "VoiceFlowAudio"

    @ReactMethod fun start(promise: Promise) {
        if (recording) return promise.resolve(null)
        try {
            val sampleRate = 16_000
            val channel = AudioFormat.CHANNEL_IN_MONO
            val encoding = AudioFormat.ENCODING_PCM_16BIT
            val minBuf = AudioRecord.getMinBufferSize(sampleRate, channel, encoding)
            val bufSize = maxOf(minBuf, sampleRate / 5) // ~200ms

            val rec = AudioRecord(
                MediaRecorder.AudioSource.VOICE_RECOGNITION,
                sampleRate, channel, encoding, bufSize * 2
            )
            if (rec.state != AudioRecord.STATE_INITIALIZED) {
                rec.release()
                return promise.reject("E_AUDIO", "AudioRecord init failed")
            }

            recording = true
            startMs = System.currentTimeMillis()
            rec.startRecording()

            job = scope.launch {
                val frameSamples = sampleRate / 10 // 100ms
                val short = ShortArray(frameSamples)
                while (isActive && recording) {
                    val read = rec.read(short, 0, short.size)
                    if (read <= 0) continue
                    val arr = Arguments.createArray()
                    val inv = 1.0 / 32768.0
                    for (i in 0 until read) arr.pushDouble(short[i] * inv)
                    val payload = Arguments.createMap().apply {
                        putArray("samples", arr)
                        putDouble("timestampMs", (System.currentTimeMillis() - startMs).toDouble())
                    }
                    reactCtx.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                        .emit("frame", payload)
                }
                rec.stop()
                rec.release()
            }
            promise.resolve(null)
        } catch (e: Throwable) {
            recording = false
            promise.reject("E_AUDIO", e)
        }
    }

    @ReactMethod fun stop(promise: Promise) {
        recording = false
        job?.cancel()
        job = null
        promise.resolve(null)
    }

    @ReactMethod fun isRecording(promise: Promise) = promise.resolve(recording)

    @ReactMethod fun addListener(eventName: String) {} // required for RCTEventEmitter
    @ReactMethod fun removeListeners(count: Int) {}
}
