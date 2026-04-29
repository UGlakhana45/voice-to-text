#import "VoiceFlowLlm.h"
#import "cpp/llm_wrapper.h"
#import <memory>

using namespace voiceflow;

@implementation VoiceFlowLlm {
    std::unique_ptr<LlmEngine> engine;
}

RCT_EXPORT_MODULE()

+ (BOOL)requiresMainQueueSetup { return NO; }

- (instancetype)init {
    if ((self = [super init])) {
        engine = std::make_unique<LlmEngine>();
    }
    return self;
}

RCT_EXPORT_METHOD(loadModel:(NSString *)modelPath
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
    dispatch_async(dispatch_get_global_queue(QOS_CLASS_USER_INITIATED, 0), ^{
        bool ok = self->engine->load(std::string([modelPath UTF8String]));
        if (ok) resolve(nil);
        else reject(@"E_LOAD", @"Failed to load LLM", nil);
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

RCT_EXPORT_METHOD(cleanup:(NSString *)rawText
                  opts:(NSDictionary *)opts
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
    dispatch_async(dispatch_get_global_queue(QOS_CLASS_USER_INITIATED, 0), ^{
        if (!self->engine->is_loaded()) {
            resolve(rawText);
            return;
        }
        LlmOptions lopts;
        NSString *tone = opts[@"tone"]; if (tone) lopts.tone = std::string([tone UTF8String]);
        NSNumber *mt = opts[@"maxTokens"]; if (mt) lopts.max_tokens = mt.intValue;

        std::string out = self->engine->cleanup(std::string([rawText UTF8String]), lopts);
        resolve([NSString stringWithUTF8String:out.c_str()]);
    });
}

@end
