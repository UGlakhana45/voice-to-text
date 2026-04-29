#include "whisper_wrapper.h"
#include "whisper.h"
#include <chrono>
#include <mutex>

namespace voiceflow {

struct WhisperEngine::Impl {
    whisper_context* ctx = nullptr;
    std::mutex mu;
};

WhisperEngine::WhisperEngine() : impl_(std::make_unique<Impl>()) {}
WhisperEngine::~WhisperEngine() { unload(); }

bool WhisperEngine::load(const std::string& model_path) {
    std::lock_guard<std::mutex> lk(impl_->mu);
    if (impl_->ctx) {
        whisper_free(impl_->ctx);
        impl_->ctx = nullptr;
    }
    whisper_context_params cparams = whisper_context_default_params();
    impl_->ctx = whisper_init_from_file_with_params(model_path.c_str(), cparams);
    return impl_->ctx != nullptr;
}

void WhisperEngine::unload() {
    std::lock_guard<std::mutex> lk(impl_->mu);
    if (impl_->ctx) {
        whisper_free(impl_->ctx);
        impl_->ctx = nullptr;
    }
}

bool WhisperEngine::is_loaded() const {
    return impl_->ctx != nullptr;
}

WhisperResult WhisperEngine::transcribe(const float* samples, int n_samples, const WhisperOptions& opts) {
    WhisperResult out;
    std::lock_guard<std::mutex> lk(impl_->mu);
    if (!impl_->ctx) return out;

    auto t0 = std::chrono::steady_clock::now();

    whisper_full_params wparams = whisper_full_default_params(WHISPER_SAMPLING_GREEDY);
    wparams.print_realtime = false;
    wparams.print_progress = false;
    wparams.print_timestamps = false;
    wparams.translate = opts.translate;
    wparams.n_threads = opts.n_threads;
    wparams.suppress_blank = true;
    wparams.single_segment = false;
    if (opts.language != "auto") wparams.language = opts.language.c_str();
    if (!opts.initial_prompt.empty()) wparams.initial_prompt = opts.initial_prompt.c_str();

    if (whisper_full(impl_->ctx, wparams, samples, n_samples) != 0) {
        return out;
    }

    const int n_segments = whisper_full_n_segments(impl_->ctx);
    std::string text;
    for (int i = 0; i < n_segments; ++i) {
        text += whisper_full_get_segment_text(impl_->ctx, i);
    }

    out.text = std::move(text);
    const int lang_id = whisper_full_lang_id(impl_->ctx);
    out.language = lang_id >= 0 ? whisper_lang_str(lang_id) : "";

    auto t1 = std::chrono::steady_clock::now();
    out.duration_ms = (int)std::chrono::duration_cast<std::chrono::milliseconds>(t1 - t0).count();
    return out;
}

} // namespace voiceflow
