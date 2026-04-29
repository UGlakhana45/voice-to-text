#pragma once
#include <string>
#include <memory>

namespace voiceflow {

struct LlmOptions {
    std::string tone = "neutral"; // neutral|casual|formal|email|slack|notes
    int max_tokens = 512;
    int n_threads = 4;
    float temperature = 0.2f;
};

class LlmEngine {
public:
    LlmEngine();
    ~LlmEngine();

    bool load(const std::string& model_path);
    void unload();
    bool is_loaded() const;

    /// Run a "polish/cleanup" pass over the raw transcript.
    std::string cleanup(const std::string& raw_text, const LlmOptions& opts);

private:
    struct Impl;
    std::unique_ptr<Impl> impl_;
};

} // namespace voiceflow
