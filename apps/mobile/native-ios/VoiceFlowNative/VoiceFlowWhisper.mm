#import "VoiceFlowWhisper.h"
#import "cpp/whisper_wrapper.h"
#import <memory>

using namespace voiceflow;

@implementation VoiceFlowWhisper {
    std::unique_ptr<WhisperEngine> engine;
}

RCT_EXPORT_MODULE()

+ (BOOL)requiresMainQueueSetup { return NO; }

- (instancetype)init {
    if ((self = [super init])) {
        engine = std::make_unique<WhisperEngine>();
    }
    return self;
}

RCT_EXPORT_METHOD(loadModel:(NSString *)modelPath
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
    dispatch_async(dispatch_get_global_queue(QOS_CLASS_USER_INITIATED, 0), ^{
        bool ok = self->engine->load(std::string([modelPath UTF8String]));
        if (ok) resolve(nil);
        else reject(@"E_LOAD", @"Failed to load Whisper model", nil);
    });
}

RCT_EXPORT_METHOD(unloadModel:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
    self->engine->unload();
    resolve(nil);
}

RCT_EXPORT_METHOD(isLoaded:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
    resolve(@(self->engine->is_loaded()));
}

RCT_EXPORT_METHOD(transcribePcm:(NSArray<NSNumber *> *)samples
                  opts:(NSDictionary *)opts
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
    dispatch_async(dispatch_get_global_queue(QOS_CLASS_USER_INITIATED, 0), ^{
        if (!self->engine->is_loaded()) {
            reject(@"E_NOT_LOADED", @"Whisper model not loaded", nil);
            return;
        }
        const NSUInteger n = samples.count;
        std::vector<float> buf(n);
        for (NSUInteger i = 0; i < n; ++i) buf[i] = samples[i].floatValue;

        WhisperOptions wopts;
        NSString *lang = opts[@"language"]; if (lang) wopts.language = std::string([lang UTF8String]);
        NSString *ip = opts[@"initialPrompt"]; if (ip) wopts.initial_prompt = std::string([ip UTF8String]);
        NSNumber *tr = opts[@"translate"]; if (tr) wopts.translate = tr.boolValue;

        WhisperResult res = self->engine->transcribe(buf.data(), (int)buf.size(), wopts);
        resolve(@{
            @"text": [NSString stringWithUTF8String:res.text.c_str()],
            @"language": [NSString stringWithUTF8String:res.language.c_str()],
            @"durationMs": @(res.duration_ms),
        });
    });
}

@end
