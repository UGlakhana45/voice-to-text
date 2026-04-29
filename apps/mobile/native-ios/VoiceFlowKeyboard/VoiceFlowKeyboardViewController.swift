// VoiceFlowKeyboardViewController.swift
// VoiceFlow iOS Keyboard Extension (Phase 3 scaffold).
//
// After `expo prebuild`:
//   1. In Xcode, File → New → Target → Custom Keyboard Extension. Name "VoiceFlowKeyboard".
//   2. Replace the auto-generated KeyboardViewController.swift with this file.
//   3. In the extension's Info.plist set:
//        NSExtension.NSExtensionAttributes.RequestsOpenAccess = YES   (required for mic)
//        NSExtension.NSExtensionAttributes.IsASCIICapable     = NO
//   4. App Groups: enable group.com.voiceflow.shared on both the host app and the
//      extension so the model files + auth token are reachable.
//   5. The user enables it in Settings → General → Keyboard → Keyboards →
//      Add New Keyboard → VoiceFlow, then turns on "Allow Full Access".
//
// Mic permission flow: iOS only grants AVAudioSession.recordPermission
// to keyboard extensions when "Allow Full Access" is on. Trigger the prompt
// from the host app the first time so users see context.

import UIKit
import AVFoundation

final class VoiceFlowKeyboardViewController: UIInputViewController {
    private let micButton = UIButton(type: .system)
    private var isRecording = false

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = UIColor(red: 0.04, green: 0.04, blue: 0.06, alpha: 1)

        micButton.translatesAutoresizingMaskIntoConstraints = false
        micButton.setTitle("●", for: .normal)
        micButton.titleLabel?.font = .systemFont(ofSize: 36, weight: .bold)
        micButton.setTitleColor(.white, for: .normal)
        micButton.backgroundColor = UIColor.systemPurple
        micButton.layer.cornerRadius = 48
        micButton.addTarget(self, action: #selector(onMicTap), for: .touchUpInside)
        view.addSubview(micButton)

        NSLayoutConstraint.activate([
            micButton.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            micButton.centerYAnchor.constraint(equalTo: view.centerYAnchor),
            micButton.widthAnchor.constraint(equalToConstant: 96),
            micButton.heightAnchor.constraint(equalToConstant: 96),
        ])
    }

    @objc private func onMicTap() {
        if isRecording { stopAndCommit() } else { startCapture() }
    }

    private func startCapture() {
        isRecording = true
        micButton.setTitle("■", for: .normal)
        // TODO: bridge to VoiceFlowAudio + VoiceFlowWhisper (shared C++ via App Group).
    }

    private func stopAndCommit() {
        isRecording = false
        micButton.setTitle("●", for: .normal)
        // TODO: stop, await transcript, then:
        //   textDocumentProxy.insertText(finalText)
    }
}
