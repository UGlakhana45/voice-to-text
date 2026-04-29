#import "VoiceFlowAudio.h"
#import <AVFoundation/AVFoundation.h>

@interface VoiceFlowAudio () {
    AVAudioEngine *_engine;
    AVAudioConverter *_converter;
    BOOL _recording;
    NSTimeInterval _startTs;
    BOOL _hasListeners;
}
@end

@implementation VoiceFlowAudio

RCT_EXPORT_MODULE()

- (NSArray<NSString *> *)supportedEvents { return @[@"frame"]; }
- (void)startObserving { _hasListeners = YES; }
- (void)stopObserving { _hasListeners = NO; }

+ (BOOL)requiresMainQueueSetup { return NO; }

RCT_EXPORT_METHOD(start:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
    if (_recording) { resolve(nil); return; }
    NSError *err = nil;
    AVAudioSession *session = [AVAudioSession sharedInstance];
    [session setCategory:AVAudioSessionCategoryPlayAndRecord
              withOptions:AVAudioSessionCategoryOptionDefaultToSpeaker
                    error:&err];
    [session setActive:YES error:&err];
    if (err) { reject(@"E_AUDIO", err.localizedDescription, err); return; }

    _engine = [[AVAudioEngine alloc] init];
    AVAudioInputNode *input = _engine.inputNode;
    AVAudioFormat *inputFormat = [input outputFormatForBus:0];

    AVAudioFormat *targetFormat = [[AVAudioFormat alloc]
        initWithCommonFormat:AVAudioPCMFormatFloat32
                  sampleRate:16000
                    channels:1
                 interleaved:NO];
    _converter = [[AVAudioConverter alloc] initFromFormat:inputFormat toFormat:targetFormat];

    __weak __typeof(self) weakSelf = self;
    [input installTapOnBus:0 bufferSize:1024 format:inputFormat usingBlock:^(AVAudioPCMBuffer *buf, AVAudioTime *_) {
        __strong __typeof(self) self = weakSelf;
        if (!self || !self->_recording) return;

        AVAudioPCMBuffer *out = [[AVAudioPCMBuffer alloc] initWithPCMFormat:targetFormat
            frameCapacity:(AVAudioFrameCount)(buf.frameLength * 16000.0 / inputFormat.sampleRate + 1024)];
        NSError *cerr = nil;
        AVAudioConverterInputBlock inBlock = ^AVAudioBuffer *(AVAudioPacketCount n, AVAudioConverterInputStatus *st) {
            *st = AVAudioConverterInputStatus_HaveData;
            return buf;
        };
        [self->_converter convertToBuffer:out error:&cerr withInputFromBlock:inBlock];
        if (cerr || out.frameLength == 0) return;

        const float *samples = out.floatChannelData[0];
        NSMutableArray *arr = [NSMutableArray arrayWithCapacity:out.frameLength];
        for (AVAudioFrameCount i = 0; i < out.frameLength; ++i) [arr addObject:@(samples[i])];

        if (self->_hasListeners) {
            NSTimeInterval t = [[NSDate date] timeIntervalSince1970] - self->_startTs;
            [self sendEventWithName:@"frame" body:@{
                @"samples": arr,
                @"timestampMs": @((NSInteger)(t * 1000.0)),
            }];
        }
    }];

    NSError *startErr = nil;
    [_engine prepare];
    [_engine startAndReturnError:&startErr];
    if (startErr) { reject(@"E_AUDIO", startErr.localizedDescription, startErr); return; }

    _recording = YES;
    _startTs = [[NSDate date] timeIntervalSince1970];
    resolve(nil);
}

RCT_EXPORT_METHOD(stop:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
    _recording = NO;
    [_engine.inputNode removeTapOnBus:0];
    [_engine stop];
    _engine = nil;
    resolve(nil);
}

RCT_EXPORT_METHOD(isRecording:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
    resolve(@(_recording));
}

@end
