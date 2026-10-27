#import <AppKit/AppKit.h>
#import <WebKit/WebKit.h>

static const CGFloat SSSidebarRowHeight = 38.0;

typedef void (*SSSidebarActionCallback)(void *, const char *);
typedef void (*SSSidebarReleaseCallback)(void *);

@class SSSidebarHost;

@interface SSSidebarNode : NSObject
@property(nonatomic, copy) NSString *identifier;
@property(nonatomic, copy) NSDictionary *data;
@property(nonatomic, copy) NSArray<SSSidebarNode *> *children;
@property(nonatomic, weak) SSSidebarNode *parent;
@end

@interface SSSidebarButton : NSButton
@property(nonatomic, copy) NSDictionary *actionSpec;
@property(nonatomic, copy) NSArray *menuSpecs;
@end

@interface SSSidebarMenuItem : NSMenuItem
@property(nonatomic, copy) NSDictionary *actionSpec;
@end

@interface SSSidebarSlider : NSSlider
@property(nonatomic, copy) NSDictionary *actionSpec;
@end

@interface SSSidebarHost : NSObject <NSOutlineViewDataSource, NSOutlineViewDelegate, NSTextFieldDelegate>
@property(nonatomic, weak) WKWebView *webview;
@property(nonatomic, strong) NSView *surface;
@property(nonatomic, strong) NSView *content;
@property(nonatomic, strong) NSView *navigationView;
@property(nonatomic, strong) NSLayoutConstraint *navigationSafeArea;
@property(nonatomic, strong) NSStackView *top;
@property(nonatomic, strong) NSStackView *footer;
@property(nonatomic, strong) NSOutlineView *outline;
@property(nonatomic, strong) NSScrollView *scroll;
@property(nonatomic, strong) NSMutableDictionary<NSString *, SSSidebarNode *> *nodes;
@property(nonatomic, copy) NSArray<SSSidebarNode *> *roots;
@property(nonatomic, copy) NSDictionary *snapshot;
@property(nonatomic, copy) NSString *mountId;
@property(nonatomic) uint64_t revision;
@property(nonatomic) BOOL applying;
@property(nonatomic) BOOL removed;
@property(nonatomic) void *callbackContext;
@property(nonatomic) SSSidebarActionCallback callback;
@property(nonatomic) SSSidebarReleaseCallback releaseCallback;
@property(nonatomic, strong) id keyMonitor;
- (instancetype)initWithWebview:(WKWebView *)webview;
- (void)applySnapshot:(NSDictionary *)snapshot;
- (void)detach;
- (void)sendAction:(NSDictionary *)action value:(NSString *)value;
- (NSView *)rowView:(SSSidebarNode *)node;
- (NSView *)rowView:(SSSidebarNode *)node outline:(BOOL)outlineRow;
- (void)activate:(id)sender;
- (void)activateOutlineRow:(NSOutlineView *)outline;
- (void)showMenu:(SSSidebarButton *)sender;
- (NSMenu *)menuForActions:(NSArray *)actions;
- (NSMenu *)menuForNode:(SSSidebarNode *)node;
- (NSArray<SSSidebarNode *> *)reconcile:(NSArray *)data parent:(SSSidebarNode *)parent seen:(NSMutableSet *)seen;
@end

NSOutlineView *ss_sidebar_outline(SSSidebarHost *host);
