Pod::Spec.new do |s|
  s.name             = "VoiceFlowNative"
  s.version          = "0.0.1"
  s.summary          = "On-device Whisper + Llama bridge for VoiceFlow"
  s.homepage         = "https://github.com/udaylakhana/voiceflow"
  s.license          = "MIT"
  s.author           = { "VoiceFlow" => "noreply@voiceflow.local" }
  s.platforms        = { :ios => "13.0" }
  s.source           = { :path => "." }
  s.source_files     = "*.{h,m,mm}", "cpp/*.{h,cpp}"
  s.public_header_files = "*.h"
  s.requires_arc     = true
  s.compiler_flags   = "-std=c++17 -O3"

  # Vendored upstream sources are added at the Xcode-project level by the
  # post-prebuild integration script (see docs/PHASE1_INTEGRATION.md).
  s.dependency "React-Core"
end
