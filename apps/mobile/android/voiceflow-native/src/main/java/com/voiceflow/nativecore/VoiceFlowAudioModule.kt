package com.voiceflow.nativecore

import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule
import kotlinx.coroutines.*
import java.io.File
import java.io.RandomAccessFile
import java.nio.ByteBuffer
import java.nio.ByteOrder

/**
 * 16 kHz mono Int16 PCM capture.
 *
 * Always emits a "frame" event to JS every ~100 ms with the raw Float32 samples
 * (used for VAD and on-device Whisper streaming). When `start({recordToFile:
 * true})` is called the same frames are *also* written straight to a WAV file
 * on disk — `stop()` returns `{ fileUri, durationMs }` so the JS layer can
 * upload the file directly without ever materialising a base64 buffer in the
 * JS heap. Removes the OOM risk on long cloud-mode recordings.
 */
class VoiceFlowAudioModule(private val reactCtx: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactCtx) {

    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    @Volatile private var recording = false
    private var job: Job? = null
    private var startMs: Long = 0

    // WAV file state — only populated when start({recordToFile: true})
    private var wavFile: RandomAccessFile? = null
    private var wavPath: String? = null
    @Volatile private var wavBytesWritten = 0

    override fun getName(): String = "VoiceFlowAudio"

    @ReactMethod fun start(options: ReadableMap?, promise: Promise) {
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

            val recordToFile = options?.hasKey("recordToFile") == true && options.getBoolean("recordToFile")
            if (recordToFile) {
                val outFile = File(reactCtx.cacheDir, "voiceflow_${System.currentTimeMillis()}.wav")
                val raf = RandomAccessFile(outFile, "rw")
                raf.setLength(0)
                // Write a placeholder 44-byte WAV header. Sizes are patched on stop().
                raf.write(buildWavHeader(sampleRate, dataSize = 0))
                wavFile = raf
                wavPath = outFile.absolutePath
                wavBytesWritten = 0
            }

            recording = true
            startMs = System.currentTimeMillis()
            rec.startRecording()

            job = scope.launch {
                val frameSamples = sampleRate / 10 // 100ms
                val short = ShortArray(frameSamples)
                val byteScratch = ByteBuffer.allocate(frameSamples * 2).order(ByteOrder.LITTLE_ENDIAN)
                while (isActive && recording) {
                    val read = rec.read(short, 0, short.size)
                    if (read <= 0) continue

                    // 1. Stream Int16 LE bytes to the WAV file when enabled.
                    val raf = wavFile
                    if (raf != null) {
                        byteScratch.clear()
                        for (i in 0 until read) byteScratch.putShort(short[i])
                        raf.write(byteScratch.array(), 0, read * 2)
                        wavBytesWritten += read * 2
                    }

                    // 2. Emit Float32 frame for JS-side VAD / on-device Whisper.
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
            closeWavQuietly()
            promise.reject("E_AUDIO", e)
        }
    }

    @ReactMethod fun stop(promise: Promise) {
        if (!recording && wavFile == null) {
            promise.resolve(buildStopResult(null, 0))
            return
        }
        val stopRequestedAt = System.currentTimeMillis()
        recording = false
        // Run the rest off the JS thread so we can safely await the capture
        // coroutine and patch the WAV header without blocking.
        scope.launch {
            try {
                job?.join()
                job = null

                val raf = wavFile
                val path = wavPath
                val byteCount = wavBytesWritten
                wavFile = null
                wavPath = null
                wavBytesWritten = 0

                var fileUri: String? = null
                if (raf != null && path != null) {
                    try {
                        // Patch RIFF chunk size (offset 4) and data sub-chunk size (offset 40).
                        raf.seek(4); raf.write(intToLE(36 + byteCount))
                        raf.seek(40); raf.write(intToLE(byteCount))
                        raf.close()
                        fileUri = "file://$path"
                    } catch (e: Throwable) {
                        try { raf.close() } catch (_: Throwable) {}
                        // Best effort — caller will see fileUri == null and handle.
                    }
                }
                val durationMs = if (startMs > 0) (stopRequestedAt - startMs) else 0L
                promise.resolve(buildStopResult(fileUri, durationMs))
            } catch (e: Throwable) {
                closeWavQuietly()
                promise.reject("E_AUDIO_STOP", e)
            }
        }
    }

    @ReactMethod fun isRecording(promise: Promise) = promise.resolve(recording)

    @ReactMethod fun addListener(eventName: String) {} // required for RCTEventEmitter
    @ReactMethod fun removeListeners(count: Int) {}

    // ---- helpers ----

    private fun buildStopResult(fileUri: String?, durationMs: Long): WritableMap {
        val map = Arguments.createMap()
        map.putDouble("durationMs", durationMs.toDouble())
        if (fileUri != null) map.putString("fileUri", fileUri) else map.putNull("fileUri")
        return map
    }

    private fun closeWavQuietly() {
        try { wavFile?.close() } catch (_: Throwable) {}
        wavFile = null
        wavPath = null
        wavBytesWritten = 0
    }

    private fun buildWavHeader(sampleRate: Int, dataSize: Int): ByteArray {
        val bb = ByteBuffer.allocate(44).order(ByteOrder.LITTLE_ENDIAN)
        bb.put("RIFF".toByteArray(Charsets.US_ASCII))
        bb.putInt(36 + dataSize)
        bb.put("WAVE".toByteArray(Charsets.US_ASCII))
        bb.put("fmt ".toByteArray(Charsets.US_ASCII))
        bb.putInt(16)              // PCM fmt chunk size
        bb.putShort(1)             // PCM format
        bb.putShort(1)             // mono
        bb.putInt(sampleRate)
        bb.putInt(sampleRate * 2)  // byte rate (16-bit mono)
        bb.putShort(2)             // block align
        bb.putShort(16)            // bits per sample
        bb.put("data".toByteArray(Charsets.US_ASCII))
        bb.putInt(dataSize)
        return bb.array()
    }

    private fun intToLE(v: Int): ByteArray {
        val bb = ByteBuffer.allocate(4).order(ByteOrder.LITTLE_ENDIAN)
        bb.putInt(v)
        return bb.array()
    }
}
