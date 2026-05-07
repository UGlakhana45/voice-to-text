// React Native auto-discovery bridge for `VoiceFlowAudio.swift`.
// Maps the Swift class onto the RCTEventEmitter base so JS can call
// `NativeModules.VoiceFlowAudio.start()` / `.stop()` and subscribe to
// the "frame" event via NativeEventEmitter.

#import <React/RCTBridgeModule.h>
#import <React/RCTEventEmitter.h>

@interface RCT_EXTERN_MODULE(VoiceFlowAudio, RCTEventEmitter)

RCT_EXTERN_METHOD(start:(NSDictionary *)options
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(stop:(RCTPromiseResolveBlock)resolve
                 rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(isRecording:(RCTPromiseResolveBlock)resolve
                       rejecter:(RCTPromiseRejectBlock)reject)

@end
