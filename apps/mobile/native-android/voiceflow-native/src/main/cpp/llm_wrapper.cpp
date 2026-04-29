#include "llm_wrapper.h"
#include "llama.h"
#include "common.h"
#include <mutex>
#include <sstream>
#include <vector>

namespace voiceflow {

struct LlmEngine::Impl {
    llama_model* model = nullptr;
    llama_context* ctx = nullptr;
    std::mutex mu;
};

LlmEngine::LlmEngine() : impl_(std::make_unique<Impl>()) {}
LlmEngine::~LlmEngine() { unload(); }

static std::string tone_instruction(const std::string& tone) {
    if (tone == "casual") return "Rewrite casually and clearly, fixing grammar and removing filler words.";
    if (tone == "formal") return "Rewrite formally and concisely, fixing grammar and punctuation.";
    if (tone == "email")  return "Rewrite as a polite email body, fixing grammar and punctuation.";
    if (tone == "slack")  return "Rewrite as a short Slack message, fixing grammar.";
    if (tone == "notes")  return "Rewrite as terse bullet-point notes.";
    return "Rewrite to fix grammar, punctuation, and remove filler words. Preserve meaning.";
}

bool LlmEngine::load(const std::string& model_path) {
    std::lock_guard<std::mutex> lk(impl_->mu);
    if (impl_->ctx) llama_free(impl_->ctx);
    if (impl_->model) llama_free_model(impl_->model);

    llama_backend_init();

    llama_model_params mparams = llama_model_default_params();
    impl_->model = llama_load_model_from_file(model_path.c_str(), mparams);
    if (!impl_->model) return false;

    llama_context_params cparams = llama_context_default_params();
    cparams.n_ctx = 2048;
    cparams.n_batch = 512;
    impl_->ctx = llama_new_context_with_model(impl_->model, cparams);
    return impl_->ctx != nullptr;
}

void LlmEngine::unload() {
    std::lock_guard<std::mutex> lk(impl_->mu);
    if (impl_->ctx) { llama_free(impl_->ctx); impl_->ctx = nullptr; }
    if (impl_->model) { llama_free_model(impl_->model); impl_->model = nullptr; }
    llama_backend_free();
}

bool LlmEngine::is_loaded() const {
    return impl_->ctx != nullptr;
}

std::string LlmEngine::cleanup(const std::string& raw_text, const LlmOptions& opts) {
    std::lock_guard<std::mutex> lk(impl_->mu);
    if (!impl_->ctx) return raw_text;

    std::ostringstream prompt;
    prompt << "<start_of_turn>user\n"
           << tone_instruction(opts.tone) << "\n\n"
           << "Input:\n" << raw_text << "\n"
           << "Output only the rewritten text, no preamble.\n"
           << "<end_of_turn>\n<start_of_turn>model\n";

    std::string p = prompt.str();
    std::vector<llama_token> tokens(p.size() + 16);
    int n = llama_tokenize(impl_->model, p.c_str(), (int)p.size(),
                           tokens.data(), (int)tokens.size(), true, true);
    if (n < 0) return raw_text;
    tokens.resize(n);

    llama_kv_cache_clear(impl_->ctx);
    llama_batch batch = llama_batch_get_one(tokens.data(), (int)tokens.size(), 0, 0);
    if (llama_decode(impl_->ctx, batch) != 0) return raw_text;

    std::string out;
    int n_cur = (int)tokens.size();
    for (int i = 0; i < opts.max_tokens; ++i) {
        const float* logits = llama_get_logits_ith(impl_->ctx, -1);
        const int n_vocab = llama_n_vocab(impl_->model);

        // Greedy argmax (low-budget; replace with proper sampling later)
        int best = 0; float best_v = logits[0];
        for (int v = 1; v < n_vocab; ++v) {
            if (logits[v] > best_v) { best_v = logits[v]; best = v; }
        }
        llama_token tok = (llama_token)best;
        if (llama_token_is_eog(impl_->model, tok)) break;

        char piece[256];
        int np = llama_token_to_piece(impl_->model, tok, piece, sizeof(piece), 0, true);
        if (np > 0) out.append(piece, np);

        llama_batch nb = llama_batch_get_one(&tok, 1, n_cur, 0);
        if (llama_decode(impl_->ctx, nb) != 0) break;
        n_cur++;
    }

    return out;
}

} // namespace voiceflow
