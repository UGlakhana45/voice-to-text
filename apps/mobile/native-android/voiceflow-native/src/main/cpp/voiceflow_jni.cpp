#include <jni.h>
#include <string>
#include <vector>
#include <memory>
#include "whisper_wrapper.h"
#include "llm_wrapper.h"

using namespace voiceflow;

static std::unique_ptr<WhisperEngine> g_whisper;
static std::unique_ptr<LlmEngine> g_llm;

static std::string j2s(JNIEnv* env, jstring s) {
    if (!s) return {};
    const char* c = env->GetStringUTFChars(s, nullptr);
    std::string out(c ? c : "");
    if (c) env->ReleaseStringUTFChars(s, c);
    return out;
}

extern "C" {

// ---- Whisper ----
JNIEXPORT jboolean JNICALL
Java_com_voiceflow_nativecore_VoiceFlowWhisperModule_nativeLoad(JNIEnv* env, jobject, jstring model_path) {
    if (!g_whisper) g_whisper = std::make_unique<WhisperEngine>();
    return g_whisper->load(j2s(env, model_path)) ? JNI_TRUE : JNI_FALSE;
}

JNIEXPORT void JNICALL
Java_com_voiceflow_nativecore_VoiceFlowWhisperModule_nativeUnload(JNIEnv*, jobject) {
    if (g_whisper) g_whisper->unload();
}

JNIEXPORT jboolean JNICALL
Java_com_voiceflow_nativecore_VoiceFlowWhisperModule_nativeIsLoaded(JNIEnv*, jobject) {
    return (g_whisper && g_whisper->is_loaded()) ? JNI_TRUE : JNI_FALSE;
}

JNIEXPORT jobjectArray JNICALL
Java_com_voiceflow_nativecore_VoiceFlowWhisperModule_nativeTranscribe(
        JNIEnv* env, jobject,
        jfloatArray samples, jstring language, jstring initial_prompt, jboolean translate) {

    if (!g_whisper || !g_whisper->is_loaded()) {
        return nullptr;
    }
    jsize n = env->GetArrayLength(samples);
    std::vector<float> buf(n);
    env->GetFloatArrayRegion(samples, 0, n, buf.data());

    WhisperOptions opts;
    opts.language = j2s(env, language);
    if (opts.language.empty()) opts.language = "auto";
    opts.initial_prompt = j2s(env, initial_prompt);
    opts.translate = translate == JNI_TRUE;

    auto res = g_whisper->transcribe(buf.data(), (int)buf.size(), opts);

    jclass strCls = env->FindClass("java/lang/String");
    jobjectArray out = env->NewObjectArray(3, strCls, nullptr);
    env->SetObjectArrayElement(out, 0, env->NewStringUTF(res.text.c_str()));
    env->SetObjectArrayElement(out, 1, env->NewStringUTF(res.language.c_str()));
    env->SetObjectArrayElement(out, 2, env->NewStringUTF(std::to_string(res.duration_ms).c_str()));
    return out;
}

// ---- LLM ----
JNIEXPORT jboolean JNICALL
Java_com_voiceflow_nativecore_VoiceFlowLlmModule_nativeLoad(JNIEnv* env, jobject, jstring model_path) {
    if (!g_llm) g_llm = std::make_unique<LlmEngine>();
    return g_llm->load(j2s(env, model_path)) ? JNI_TRUE : JNI_FALSE;
}

JNIEXPORT void JNICALL
Java_com_voiceflow_nativecore_VoiceFlowLlmModule_nativeUnload(JNIEnv*, jobject) {
    if (g_llm) g_llm->unload();
}

JNIEXPORT jboolean JNICALL
Java_com_voiceflow_nativecore_VoiceFlowLlmModule_nativeIsLoaded(JNIEnv*, jobject) {
    return (g_llm && g_llm->is_loaded()) ? JNI_TRUE : JNI_FALSE;
}

JNIEXPORT jstring JNICALL
Java_com_voiceflow_nativecore_VoiceFlowLlmModule_nativeCleanup(
        JNIEnv* env, jobject, jstring raw_text, jstring tone, jint max_tokens) {
    if (!g_llm || !g_llm->is_loaded()) {
        return raw_text;
    }
    LlmOptions opts;
    opts.tone = j2s(env, tone);
    opts.max_tokens = max_tokens;
    std::string out = g_llm->cleanup(j2s(env, raw_text), opts);
    return env->NewStringUTF(out.c_str());
}

} // extern "C"
