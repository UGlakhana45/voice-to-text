#pragma once
#include <string>
#include <vector>
#include <memory>

namespace voiceflow {

struct WhisperResult {
    std::string text;
    std::string language;
    int duration_ms = 0;
};

struct WhisperOptions {
    std::string language = "auto";       // "auto" or ISO-639-1
    std::string initial_prompt;          // hotword bias
    bool translate = false;              // translate -> English
    int n_threads = 4;
};

class WhisperEngine {
public:
    WhisperEngine();
    ~WhisperEngine();

    bool load(const std::string& model_path);
    void unload();
    bool is_loaded() const;

    /// Transcribe a buffer of mono Float32 PCM at 16 kHz.
    WhisperResult transcribe(const float* samples, int n_samples, const WhisperOptions& opts);

private:
    struct Impl;
    std::unique_ptr<Impl> impl_;
};

} // namespace voiceflow
