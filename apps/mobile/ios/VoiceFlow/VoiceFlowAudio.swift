import Foundation
import AVFoundation
import React

/**
 * iOS counterpart to Android's `VoiceFlowAudioModule`.
 *
 * Captures the microphone via `AVAudioEngine`, resamples to 16 kHz mono
 * Float32, and emits `frame` events with `{ samples: number[], timestampMs }`.
 * The JS layer (`apps/mobile/src/native/AudioRecorder.ts`) consumes the
 * stream and either:
 *   - feeds it to whisper.cpp on Android `full` builds, or
 *   - buffers it for upload to `/ai/stt` on cloud / hybrid / iOS builds.
 *
 * Whisper / Llm native modules are intentionally NOT registered on iOS yet:
 * the JS bridges already handle `NativeModules.VoiceFlowWhisper === undefined`
 * by rejecting calls, which makes iOS cloud-mode the natural fallback.
 */
@objc(VoiceFlowAudio)
final class VoiceFlowAudio: RCTEventEmitter {

    // MARK: - Constants
    private let targetSampleRate: Double = 16_000
    private let bufferFrameSize: AVAudioFrameCount = 4_096

    // MARK: - State
    private let engine = AVAudioEngine()
    private var converter: AVAudioConverter?
    private var hasListeners = false
    private var isActive = false
    private var startTimestamp: TimeInterval = 0

    // MARK: - WAV file streaming (cloud-mode mic capture)
    private var wavHandle: FileHandle?
    private var wavURL: URL?
    private var wavBytesWritten: UInt32 = 0
    private let wavLock = NSLock()

    // MARK: - RCTEventEmitter overrides
    override static func requiresMainQueueSetup() -> Bool { false }

    override func supportedEvents() -> [String]! {
        return ["frame"]
    }

    override func startObserving() { hasListeners = true }
    override func stopObserving() { hasListeners = false }

    // MARK: - Public API (mirrors Android's VoiceFlowAudioModule)
    @objc(start:resolver:rejecter:)
    func start(_ options: NSDictionary?,
               resolver resolve: @escaping RCTPromiseResolveBlock,
               rejecter reject: @escaping RCTPromiseRejectBlock) {
        if isActive { resolve(nil); return }
        do {
            try configureSession()

            let input = engine.inputNode
            let inputFormat = input.outputFormat(forBus: 0)

            guard let outputFormat = AVAudioFormat(
                commonFormat: .pcmFormatFloat32,
                sampleRate: targetSampleRate,
                channels: 1,
                interleaved: false
            ) else {
                reject("E_FORMAT", "Unable to construct 16 kHz mono Float32 format", nil)
                return
            }

            converter = AVAudioConverter(from: inputFormat, to: outputFormat)
            if converter == nil {
                reject("E_CONVERTER", "Unable to build AVAudioConverter from input → 16 kHz", nil)
                return
            }

            // Open a WAV output file when requested. Mirrors Android.
            let recordToFile = (options?["recordToFile"] as? Bool) ?? false
            if recordToFile {
                try openWavFile()
            }

            input.removeTap(onBus: 0)
            input.installTap(onBus: 0, bufferSize: bufferFrameSize, format: inputFormat) {
                [weak self] buffer, _ in
                self?.process(buffer: buffer, target: outputFormat)
            }

            startTimestamp = Date().timeIntervalSince1970
            engine.prepare()
            try engine.start()
            isActive = true
            resolve(nil)
        } catch {
            closeWavFileQuietly()
            reject("E_START", "Failed to start audio engine: \(error.localizedDescription)", error)
        }
    }

    @objc(stop:rejecter:)
    func stop(_ resolve: @escaping RCTPromiseResolveBlock,
              rejecter reject: @escaping RCTPromiseRejectBlock) {
        let stoppedAt = Date().timeIntervalSince1970
        guard isActive else {
            resolve(buildStopResult(fileUri: nil, durationMs: 0))
            return
        }
        engine.inputNode.removeTap(onBus: 0)
        engine.stop()
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
        isActive = false

        let fileUri = finalizeWavFile()
        let durationMs = Int(max(0, (stoppedAt - startTimestamp) * 1000))
        resolve(buildStopResult(fileUri: fileUri, durationMs: durationMs))
    }

    @objc(isRecording:rejecter:)
    func isRecording(_ resolve: @escaping RCTPromiseResolveBlock,
                     rejecter reject: @escaping RCTPromiseRejectBlock) {
        resolve(isActive)
    }

    // MARK: - Private helpers
    private func configureSession() throws {
        let session = AVAudioSession.sharedInstance()
        try session.setCategory(
            .playAndRecord,
            mode: .measurement,
            options: [.allowBluetooth, .defaultToSpeaker, .mixWithOthers]
        )
        try session.setPreferredSampleRate(targetSampleRate)
        try session.setActive(true, options: .notifyOthersOnDeactivation)
    }

    private func process(buffer: AVAudioPCMBuffer, target: AVAudioFormat) {
        guard let converter = converter else { return }

        let ratio = target.sampleRate / buffer.format.sampleRate
        let outCapacity = AVAudioFrameCount(Double(buffer.frameLength) * ratio + 16)
        guard let outBuffer = AVAudioPCMBuffer(pcmFormat: target, frameCapacity: outCapacity) else {
            return
        }

        var error: NSError?
        var consumed = false
        let inputBlock: AVAudioConverterInputBlock = { _, status in
            if consumed {
                status.pointee = .noDataNow
                return nil
            }
            consumed = true
            status.pointee = .haveData
            return buffer
        }

        let result = converter.convert(to: outBuffer, error: &error, withInputFrom: inputBlock)
        if result == .error || error != nil { return }

        let frameCount = Int(outBuffer.frameLength)
        guard frameCount > 0, let channels = outBuffer.floatChannelData else { return }

        let pointer = channels[0]

        // 1. Stream Int16 LE bytes to the WAV file when enabled.
        if wavHandle != nil {
            var pcm = Data(count: frameCount * 2)
            pcm.withUnsafeMutableBytes { (raw: UnsafeMutableRawBufferPointer) in
                guard let dst = raw.baseAddress?.assumingMemoryBound(to: Int16.self) else { return }
                for i in 0..<frameCount {
                    let s = max(-1.0, min(1.0, pointer[i]))
                    dst[i] = Int16(s < 0 ? s * 32768.0 : s * 32767.0).littleEndian
                }
            }
            wavLock.lock()
            wavHandle?.write(pcm)
            wavBytesWritten = wavBytesWritten &+ UInt32(pcm.count)
            wavLock.unlock()
        }

        // 2. Emit Float32 frame for JS-side VAD / on-device Whisper.
        guard hasListeners else { return }
        var samples = [NSNumber]()
        samples.reserveCapacity(frameCount)
        for i in 0..<frameCount {
            samples.append(NSNumber(value: pointer[i]))
        }

        let elapsedMs = Int((Date().timeIntervalSince1970 - startTimestamp) * 1000)
        sendEvent(withName: "frame", body: [
            "samples": samples,
            "timestampMs": elapsedMs
        ])
    }

    // MARK: - WAV file helpers

    private func openWavFile() throws {
        let dir = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0]
        let url = dir.appendingPathComponent("voiceflow_\(Int(Date().timeIntervalSince1970 * 1000)).wav")
        FileManager.default.createFile(atPath: url.path, contents: nil, attributes: nil)
        let handle = try FileHandle(forWritingTo: url)
        // 44-byte placeholder WAV header. Sizes are patched on stop().
        handle.write(buildWavHeader(sampleRate: UInt32(targetSampleRate), dataSize: 0))
        wavHandle = handle
        wavURL = url
        wavBytesWritten = 0
    }

    /// Patches the RIFF/data sizes and closes the WAV file. Returns the
    /// resulting `file://...` URI on success, or `nil` if no file was open or
    /// finalization failed.
    private func finalizeWavFile() -> String? {
        wavLock.lock()
        defer { wavLock.unlock() }
        guard let handle = wavHandle, let url = wavURL else { return nil }
        defer {
            wavHandle = nil
            wavURL = nil
            wavBytesWritten = 0
        }
        let dataSize = wavBytesWritten
        do {
            try handle.seek(toOffset: 4)
            handle.write(uint32LE(36 &+ dataSize))
            try handle.seek(toOffset: 40)
            handle.write(uint32LE(dataSize))
            try handle.close()
        } catch {
            try? handle.close()
            return nil
        }
        return url.absoluteString
    }

    private func closeWavFileQuietly() {
        wavLock.lock()
        try? wavHandle?.close()
        wavHandle = nil
        wavURL = nil
        wavBytesWritten = 0
        wavLock.unlock()
    }

    private func buildStopResult(fileUri: String?, durationMs: Int) -> [String: Any] {
        return [
            "fileUri": fileUri as Any? ?? NSNull(),
            "durationMs": durationMs
        ]
    }

    private func buildWavHeader(sampleRate: UInt32, dataSize: UInt32) -> Data {
        var d = Data(capacity: 44)
        d.append("RIFF".data(using: .ascii)!)
        d.append(uint32LE(36 &+ dataSize))
        d.append("WAVE".data(using: .ascii)!)
        d.append("fmt ".data(using: .ascii)!)
        d.append(uint32LE(16))            // PCM fmt chunk size
        d.append(uint16LE(1))             // PCM
        d.append(uint16LE(1))             // mono
        d.append(uint32LE(sampleRate))
        d.append(uint32LE(sampleRate &* 2)) // byte rate
        d.append(uint16LE(2))             // block align
        d.append(uint16LE(16))            // bits per sample
        d.append("data".data(using: .ascii)!)
        d.append(uint32LE(dataSize))
        return d
    }

    private func uint32LE(_ v: UInt32) -> Data {
        var le = v.littleEndian
        return Data(bytes: &le, count: 4)
    }

    private func uint16LE(_ v: UInt16) -> Data {
        var le = v.littleEndian
        return Data(bytes: &le, count: 2)
    }
}
