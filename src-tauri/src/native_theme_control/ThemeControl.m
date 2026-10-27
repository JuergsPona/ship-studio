#import <AppKit/AppKit.h>
#import <QuartzCore/QuartzCore.h>
#import <WebKit/WebKit.h>
#import <objc/runtime.h>
#include <stdbool.h>
#include <stdlib.h>
#include <string.h>

typedef void (*SSThemeCallback)(void *, const char *);
typedef void (*SSThemeRelease)(void *);
static const void *SSThemeAssociation = &SSThemeAssociation;

@class SSThemeHost;
@interface SSThemeSegments : NSSegmentedControl
@property(nonatomic, weak) SSThemeHost *host;
@end

@interface SSThemeHost : NSView
@property(nonatomic, weak) WKWebView *webview;
@property(nonatomic, strong) SSThemeSegments *control;
@property(nonatomic, copy) NSString *mountId;
@property(nonatomic, assign) void *context;
@property(nonatomic, assign) SSThemeCallback callback;
@property(nonatomic, assign) SSThemeRelease releaseContext;
- (void)sendEvent:(NSDictionary *)event;
- (void)retire;
@end

@implementation SSThemeSegments
- (BOOL)acceptsFirstResponder { return YES; }
- (void)keyDown:(NSEvent *)event {
    if (event.keyCode == 48 || event.keyCode == 53 ||
        (event.modifierFlags & NSEventModifierFlagCommand)) {
        [self.window makeFirstResponder:self.host.webview];
        NSString *kind = event.keyCode == 48 ? @"tab" : event.keyCode == 53 ? @"escape" : @"key";
        [self.host sendEvent:@{
            @"kind": kind,
            @"key": event.charactersIgnoringModifiers ?: @"",
            @"shiftKey": @((event.modifierFlags & NSEventModifierFlagShift) != 0),
            @"altKey": @((event.modifierFlags & NSEventModifierFlagOption) != 0),
            @"ctrlKey": @((event.modifierFlags & NSEventModifierFlagControl) != 0)
        }];
        return;
    }
    [super keyDown:event];
}
@end

@implementation SSThemeHost
- (BOOL)isFlipped { return YES; }
- (NSView *)hitTest:(NSPoint)point {
    NSView *hit = [super hitTest:point];
    return hit == self ? nil : hit;
}
- (instancetype)initWithFrame:(NSRect)frame {
    self = [super initWithFrame:frame];
    if (!self) return nil;
    self.wantsLayer = YES;
    self.layer.masksToBounds = YES;
    self.control = [[SSThemeSegments alloc] initWithFrame:NSZeroRect];
    self.control.host = self;
    self.control.segmentCount = 3;
    self.control.trackingMode = NSSegmentSwitchTrackingSelectOne;
    self.control.segmentStyle = NSSegmentStyleAutomatic;
    self.control.segmentDistribution = NSSegmentDistributionFillEqually;
    self.control.controlSize = NSControlSizeRegular;
    self.control.target = self;
    self.control.action = @selector(didSelect:);
    self.control.accessibilityLabel = @"App appearance";
    NSArray *labels = @[@"Light", @"Dark", @"System"];
    for (NSInteger index = 0; index < 3; index++) {
        [self.control setLabel:labels[index] forSegment:index];
    }
    [self.control sizeToFit];
    [self addSubview:self.control];
    return self;
}
- (void)sendEvent:(NSDictionary *)event {
    if (!self.context || !self.callback || !self.window) return;
    NSMutableDictionary *payload = [event mutableCopy];
    payload[@"mountId"] = self.mountId;
    NSData *data = [NSJSONSerialization dataWithJSONObject:payload options:0 error:nil];
    NSString *json = [[NSString alloc] initWithData:data encoding:NSUTF8StringEncoding];
    if (json) self.callback(self.context, json.UTF8String);
}
- (void)didSelect:(NSSegmentedControl *)sender {
    NSInteger index = sender.selectedSegment;
    if (!sender.enabled || index < 0 || index > 2) return;
    sender.enabled = NO;
    [self sendEvent:@{@"kind": @"select", @"preference": @[@"light", @"dark", @"system"][index]}];
}
- (void)clearContext {
    if (self.context && self.releaseContext) self.releaseContext(self.context);
    self.context = NULL;
}
- (void)retire {
    if (self.window.firstResponder == self.control) {
        [self.window makeFirstResponder:self.webview];
    }
    [self clearContext];
    [self removeFromSuperview];
}
- (void)viewWillMoveToWindow:(NSWindow *)newWindow {
    if (!newWindow) [self clearContext];
    [super viewWillMoveToWindow:newWindow];
}
- (void)dealloc { [self clearContext]; }
@end

bool ss_theme_control_update(void *view, const char *json, void *context,
                             SSThemeCallback callback, SSThemeRelease releaseContext,
                             char **error) {
    WKWebView *webview = (__bridge WKWebView *)view;
    SSThemeHost *host = objc_getAssociatedObject(webview, SSThemeAssociation);
    BOOL adopted = NO;
    @try {
        NSDictionary *snapshot = [NSJSONSerialization JSONObjectWithData:
            [[NSString stringWithUTF8String:json] dataUsingEncoding:NSUTF8StringEncoding]
            options:0 error:nil];
        NSString *mountId = snapshot[@"mountId"];
        if (![snapshot[@"visible"] boolValue]) {
            if ([host.mountId isEqualToString:mountId]) {
                [host retire];
                objc_setAssociatedObject(webview, SSThemeAssociation, nil, OBJC_ASSOCIATION_RETAIN_NONATOMIC);
            }
            releaseContext(context);
            return true;
        }
        if (host && ![host.mountId isEqualToString:mountId]) {
            [host retire];
            host = nil;
        }
        if (!host) {
            host = [[SSThemeHost alloc] initWithFrame:NSZeroRect];
            host.webview = webview;
            host.mountId = mountId;
            objc_setAssociatedObject(webview, SSThemeAssociation, host, OBJC_ASSOCIATION_RETAIN_NONATOMIC);
            [webview addSubview:host positioned:NSWindowAbove relativeTo:nil];
        }
        [host clearContext];
        host.context = context;
        host.callback = callback;
        host.releaseContext = releaseContext;
        adopted = YES;

        NSDictionary *frame = snapshot[@"frame"], *clip = snapshot[@"clip"];
        CGFloat sx = NSWidth(webview.bounds) / [snapshot[@"viewportWidth"] doubleValue];
        CGFloat sy = NSHeight(webview.bounds) / [snapshot[@"viewportHeight"] doubleValue];
        CGFloat x = [clip[@"x"] doubleValue] * sx, y = [clip[@"y"] doubleValue] * sy;
        CGFloat width = [clip[@"width"] doubleValue] * sx;
        CGFloat height = [clip[@"height"] doubleValue] * sy;
        host.frame = NSMakeRect(x, webview.isFlipped ? y : NSHeight(webview.bounds) - y - height, width, height);
        CGFloat fullHeight = [frame[@"height"] doubleValue] * sy;
        CGFloat controlHeight = host.control.intrinsicContentSize.height;
        host.control.frame = NSMakeRect(
            ([frame[@"x"] doubleValue] - [clip[@"x"] doubleValue]) * sx,
            ([frame[@"y"] doubleValue] - [clip[@"y"] doubleValue]) * sy + (fullHeight - controlHeight) / 2,
            [frame[@"width"] doubleValue] * sx, controlHeight);
        host.control.selectedSegment = [@[@"light", @"dark", @"system"] indexOfObject:snapshot[@"preference"]];
        host.control.enabled = [snapshot[@"enabled"] boolValue];
        return true;
    } @catch (NSException *exception) {
        if (adopted) {
            [host retire];
            objc_setAssociatedObject(webview, SSThemeAssociation, nil, OBJC_ASSOCIATION_RETAIN_NONATOMIC);
        }
        else releaseContext(context);
        *error = strdup(exception.reason.UTF8String ?: "Could not display the native appearance control");
        return false;
    }
}

void ss_theme_control_remove(void *view, const char *mountId) {
    WKWebView *webview = (__bridge WKWebView *)view;
    SSThemeHost *host = objc_getAssociatedObject(webview, SSThemeAssociation);
    if ([host.mountId isEqualToString:[NSString stringWithUTF8String:mountId]]) {
        [host retire];
        objc_setAssociatedObject(webview, SSThemeAssociation, nil, OBJC_ASSOCIATION_RETAIN_NONATOMIC);
    }
}

void ss_theme_control_focus(void *view, const char *mountId) {
    WKWebView *webview = (__bridge WKWebView *)view;
    SSThemeHost *host = objc_getAssociatedObject(webview, SSThemeAssociation);
    if ([host.mountId isEqualToString:[NSString stringWithUTF8String:mountId]] &&
        host.control.enabled && webview.window.isKeyWindow) {
        [webview.window makeFirstResponder:host.control];
    }
}

void ss_theme_control_free_error(char *error) { free(error); }
