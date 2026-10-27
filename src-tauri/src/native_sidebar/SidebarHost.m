#import "SidebarHost.h"
#import <objc/runtime.h>
#import <QuartzCore/QuartzCore.h>
#import <stdlib.h>
#import <string.h>
#import <stdbool.h>

static const void *SSSidebarAssociation = &SSSidebarAssociation;
static NSString *const SSProjectPasteboardType = @"com.shipstudio.native-sidebar-project";

@implementation SSSidebarNode
@end
@implementation SSSidebarButton
@end
@implementation SSSidebarMenuItem
@end
@implementation SSSidebarSlider
@end
static NSStackView *SSColumn(void) {
    NSStackView *stack = [NSStackView stackViewWithViews:@[]];
    stack.orientation = NSUserInterfaceLayoutOrientationVertical;
    stack.alignment = NSLayoutAttributeLeading;
    stack.spacing = 8;
    stack.translatesAutoresizingMaskIntoConstraints = NO;
    return stack;
}

@implementation SSSidebarHost
- (instancetype)initWithWebview:(WKWebView *)webview {
    self = [super init];
    if (!self) return nil;
    _webview = webview;
    _nodes = [NSMutableDictionary dictionary];
    _roots = @[];
    _content = [[NSView alloc] initWithFrame:NSZeroRect];
    _content.wantsLayer = YES;
#if __MAC_OS_X_VERSION_MAX_ALLOWED >= 260000
    if (@available(macOS 26.0, *)) {
        NSGlassEffectView *glass = [[NSGlassEffectView alloc] initWithFrame:NSZeroRect];
        glass.style = NSGlassEffectViewStyleRegular;
        glass.cornerRadius = 8;
        glass.contentView = _content;
        _surface = glass;
    } else
#endif
    {
        NSVisualEffectView *effect = [[NSVisualEffectView alloc] initWithFrame:NSZeroRect];
        effect.material = NSVisualEffectMaterialSidebar;
        effect.blendingMode = NSVisualEffectBlendingModeBehindWindow;
        effect.state = NSVisualEffectStateFollowsWindowActiveState;
        [_content setTranslatesAutoresizingMaskIntoConstraints:NO];
        [effect addSubview:_content];
        [NSLayoutConstraint activateConstraints:@[
            [_content.leadingAnchor constraintEqualToAnchor:effect.leadingAnchor],
            [_content.trailingAnchor constraintEqualToAnchor:effect.trailingAnchor],
            [_content.topAnchor constraintEqualToAnchor:effect.topAnchor],
            [_content.bottomAnchor constraintEqualToAnchor:effect.bottomAnchor]
        ]];
        _surface = effect;
    }
    _surface.accessibilityLabel = @"Processes";
    _surface.accessibilityRole = NSAccessibilityGroupRole;
    _top = SSColumn();
    _footer = SSColumn();
    _outline = ss_sidebar_outline(self);
    NSTableColumn *column = [[NSTableColumn alloc] initWithIdentifier:@"sidebar"];
    [_outline addTableColumn:column];
    _outline.outlineTableColumn = column;
    _outline.headerView = nil;
    _outline.backgroundColor = NSColor.clearColor;
    _outline.rowSizeStyle = NSTableViewRowSizeStyleCustom;
    _outline.allowsEmptySelection = YES;
    _outline.allowsMultipleSelection = NO;
    _outline.autoresizesOutlineColumn = YES;
    _outline.columnAutoresizingStyle = NSTableViewFirstColumnOnlyAutoresizingStyle;
    _outline.autoresizingMask = NSViewWidthSizable;
    column.resizingMask = NSTableColumnAutoresizingMask;
    _outline.dataSource = self;
    _outline.delegate = self;
    _outline.target = self;
    _outline.action = @selector(activateOutlineRow:);
    _outline.accessibilityLabel = @"Projects and sessions";
    if (@available(macOS 11.0, *)) _outline.style = NSTableViewStyleSourceList;
    _outline.rowHeight = SSSidebarRowHeight;
    _outline.usesAutomaticRowHeights = NO;
    [_outline registerForDraggedTypes:@[SSProjectPasteboardType]];
    [_outline setDraggingSourceOperationMask:NSDragOperationMove forLocal:YES];
    _scroll = [[NSScrollView alloc] initWithFrame:NSZeroRect];
    _scroll.translatesAutoresizingMaskIntoConstraints = NO;
    _scroll.drawsBackground = NO;
    _scroll.hasVerticalScroller = YES;
    _scroll.autohidesScrollers = YES;
    _scroll.documentView = _outline;
    for (NSView *view in @[_top, _scroll, _footer]) [_content addSubview:view];
    [NSLayoutConstraint activateConstraints:@[
        [_top.topAnchor constraintEqualToAnchor:_content.topAnchor constant:4],
        [_top.leadingAnchor constraintEqualToAnchor:_content.leadingAnchor constant:8],
        [_top.trailingAnchor constraintEqualToAnchor:_content.trailingAnchor constant:-8],
        [_scroll.topAnchor constraintEqualToAnchor:_top.bottomAnchor constant:4],
        [_scroll.leadingAnchor constraintEqualToAnchor:_content.leadingAnchor],
        [_scroll.trailingAnchor constraintEqualToAnchor:_content.trailingAnchor],
        [_scroll.bottomAnchor constraintEqualToAnchor:_footer.topAnchor constant:-4],
        [_footer.leadingAnchor constraintEqualToAnchor:_content.leadingAnchor constant:8],
        [_footer.trailingAnchor constraintEqualToAnchor:_content.trailingAnchor constant:-8],
        [_footer.bottomAnchor constraintEqualToAnchor:_content.bottomAnchor constant:-8]
    ]];
    // This system preference notification is also used by Flutter's macOS
    // embedder. The view intentionally follows macOS, independently of the
    // web content's saved light/dark preference.
    [NSDistributedNotificationCenter.defaultCenter addObserver:self
        selector:@selector(updateAppearance:) name:@"AppleInterfaceThemeChangedNotification" object:nil];
    [NSWorkspace.sharedWorkspace.notificationCenter addObserver:self
        selector:@selector(updateAppearance:) name:NSWorkspaceAccessibilityDisplayOptionsDidChangeNotification object:nil];
    [self updateAppearance:nil];
    __weak SSSidebarHost *weakSelf = self;
    _keyMonitor = [NSEvent addLocalMonitorForEventsMatchingMask:NSEventMaskKeyDown handler:^NSEvent *(NSEvent *event) {
        SSSidebarHost *host = weakSelf;
        if (!host || host.removed || event.window != host.surface.window) return event;
        NSResponder *responder = event.window.firstResponder;
        BOOL inSidebar = [responder isKindOfClass:NSView.class] &&
            ([(NSView *)responder isDescendantOf:host.surface] ||
             [(NSView *)responder isDescendantOf:host.navigationView]);
        if ([host.snapshot[@"behindWebview"] boolValue]) return event;
        if (!inSidebar || !(event.modifierFlags & (NSEventModifierFlagCommand | NSEventModifierFlagControl))) return event;
        NSString *key = event.charactersIgnoringModifiers.lowercaseString;
        if (![@[@"k", @"t", @"w", @"1", @"2", @"3", @"4", @"5", @"6", @"7", @"8", @"9"] containsObject:key]) return event;
        // Number shortcuts belong to the app's native menu; swallowing them
        // prevents its window-scoped handlers from receiving the event.
        if ([key length] == 1 && [key characterAtIndex:0] >= '1' && [key characterAtIndex:0] <= '9') return event;
        BOOL modified = (event.modifierFlags & (NSEventModifierFlagShift | NSEventModifierFlagOption)) != 0;
        BOOL letter = [@[@"k", @"t", @"w"] containsObject:key];
        if (modified || (letter && (!(event.modifierFlags & NSEventModifierFlagCommand) ||
            (event.modifierFlags & NSEventModifierFlagControl)))) return event;
        NSDictionary *shortcut = @{@"key": key,
            @"metaKey": @((event.modifierFlags & NSEventModifierFlagCommand) != 0),
            @"ctrlKey": @((event.modifierFlags & NSEventModifierFlagControl) != 0),
            @"altKey": @((event.modifierFlags & NSEventModifierFlagOption) != 0),
            @"shiftKey": @((event.modifierFlags & NSEventModifierFlagShift) != 0)};
        NSData *data = [NSJSONSerialization dataWithJSONObject:shortcut options:0 error:nil];
        [host sendAction:@{@"id": @"sidebar.shortcut", @"enabled": @YES}
            value:[[NSString alloc] initWithData:data encoding:NSUTF8StringEncoding]];
        return nil;
    }];
    return self;
}

- (void)updateAppearance:(NSNotification *)notification {
    if (!NSThread.isMainThread) {
        __weak SSSidebarHost *weakSelf = self;
        dispatch_async(dispatch_get_main_queue(), ^{ [weakSelf updateAppearance:nil]; });
        return;
    }
    BOOL dark = [[NSUserDefaults.standardUserDefaults stringForKey:@"AppleInterfaceStyle"] isEqualToString:@"Dark"];
    BOOL contrast = NSWorkspace.sharedWorkspace.accessibilityDisplayShouldIncreaseContrast;
    NSAppearanceName name = NSAppearanceNameAqua;
    if (@available(macOS 10.14, *)) {
        name = dark ? (contrast ? NSAppearanceNameAccessibilityHighContrastDarkAqua : NSAppearanceNameDarkAqua)
            : (contrast ? NSAppearanceNameAccessibilityHighContrastAqua : NSAppearanceNameAqua);
    }
    self.surface.appearance = [NSAppearance appearanceNamed:name];
    self.navigationView.appearance = self.surface.appearance;
    void (^applyTint)(void) = ^{
        BOOL reduce = NSWorkspace.sharedWorkspace.accessibilityDisplayShouldReduceTransparency;
        self.content.layer.backgroundColor = [NSColor.windowBackgroundColor colorWithAlphaComponent:reduce ? 1.0 : (contrast ? 0.5 : 0.18)].CGColor;
#if __MAC_OS_X_VERSION_MAX_ALLOWED >= 260000
        if (@available(macOS 26.0, *)) {
            ((NSGlassEffectView *)self.surface).tintColor = [NSColor.windowBackgroundColor colorWithAlphaComponent:0.35];
        }
#endif
    };
    if (@available(macOS 11.0, *)) [self.surface.appearance performAsCurrentDrawingAppearance:applyTint];
    else {
        NSAppearance *previous = NSAppearance.currentAppearance;
        NSAppearance.currentAppearance = self.surface.appearance;
        applyTint();
        NSAppearance.currentAppearance = previous;
    }
    [self.outline setNeedsDisplay:YES];
}

- (NSArray<SSSidebarNode *> *)reconcile:(NSArray *)data parent:(SSSidebarNode *)parent seen:(NSMutableSet *)seen {
    NSMutableArray *result = [NSMutableArray array];
    for (NSDictionary *value in data) {
        NSString *identifier = value[@"id"];
        SSSidebarNode *node = self.nodes[identifier];
        if (!node) node = [[SSSidebarNode alloc] init];
        node.identifier = identifier;
        node.data = value;
        node.parent = parent;
        self.nodes[identifier] = node;
        [seen addObject:identifier];
        NSArray *children = [value[@"children"] isKindOfClass:NSArray.class] ? value[@"children"] : @[];
        node.children = [self reconcile:children parent:node seen:seen];
        [result addObject:node];
    }
    return result;
}

- (void)replaceStack:(NSStackView *)stack nodes:(NSArray<SSSidebarNode *> *)nodes {
    for (NSView *view in stack.arrangedSubviews.copy) {
        [stack removeArrangedSubview:view];
        [view removeFromSuperview];
    }
    for (SSSidebarNode *node in nodes) {
        NSView *row = [self rowView:node];
        [stack addArrangedSubview:row];
        [row.widthAnchor constraintEqualToAnchor:stack.widthAnchor].active = YES;
    }
}

- (void)restoreExpansion:(NSArray<SSSidebarNode *> *)nodes {
    for (SSSidebarNode *node in nodes) {
        if ([node.data[@"expanded"] boolValue]) {
            [self.outline expandItem:node];
            [self restoreExpansion:node.children];
        } else [self.outline collapseItem:node];
    }
}

- (void)applySnapshot:(NSDictionary *)snapshot {
    self.applying = YES;
    BOOL topChanged = ![self.snapshot[@"top"] isEqual:snapshot[@"top"]];
    BOOL compactChanged = [self.snapshot[@"compact"] boolValue] != [snapshot[@"compact"] boolValue];
    BOOL bodyChanged = compactChanged || ![self.snapshot[@"body"] isEqual:snapshot[@"body"]];
    topChanged = topChanged || compactChanged;
    BOOL footerChanged = ![self.snapshot[@"footer"] isEqual:snapshot[@"footer"]];
    footerChanged = footerChanged || compactChanged;
    self.snapshot = snapshot;
    self.mountId = snapshot[@"mountId"];
    self.revision = [snapshot[@"revision"] unsignedLongLongValue];
    BOOL compact = [snapshot[@"compact"] boolValue];
    self.outline.indentationPerLevel = compact ? 0 : 16;
    self.outline.outlineTableColumn = compact ? nil : self.outline.tableColumns.firstObject;
    NSDictionary *frame = snapshot[@"frame"];
    NSRect rect = NSMakeRect([frame[@"x"] doubleValue], [frame[@"y"] doubleValue],
        [frame[@"width"] doubleValue], [frame[@"height"] doubleValue]);
    if (!self.webview.isFlipped) rect.origin.y = NSHeight(self.webview.bounds) - rect.origin.y - rect.size.height;
    self.surface.frame = [self.webview convertRect:rect toView:self.webview.superview];
    [self.webview.superview addSubview:self.surface
        positioned:[snapshot[@"behindWebview"] boolValue] ? NSWindowBelow : NSWindowAbove relativeTo:self.webview];
    self.surface.accessibilityHidden = [snapshot[@"behindWebview"] boolValue];
    NSMutableSet *seen = [NSMutableSet set];
    NSArray *top = [self reconcile:snapshot[@"top"] parent:nil seen:seen];
    self.roots = [self reconcile:snapshot[@"body"] parent:nil seen:seen];
    NSArray *footer = [self reconcile:snapshot[@"footer"] parent:nil seen:seen];
    for (NSString *key in self.nodes.allKeys.copy) if (![seen containsObject:key]) [self.nodes removeObjectForKey:key];
    if (topChanged) {
        [self.navigationView removeFromSuperview];
        self.navigationView = nil;
        NSMutableArray *paneTop = [NSMutableArray array];
        for (SSSidebarNode *node in top) {
            if ([node.identifier isEqualToString:@"navigation"]) {
                self.navigationView = [self rowView:node];
                self.navigationView.translatesAutoresizingMaskIntoConstraints = YES;
                self.navigationView.appearance = self.surface.appearance;
            } else [paneTop addObject:node];
        }
        [self replaceStack:self.top nodes:paneTop];
        if (self.navigationView) {
            NSView *titlebarSpace = [[NSView alloc] initWithFrame:NSZeroRect];
            [self.top insertArrangedSubview:titlebarSpace atIndex:0];
            [titlebarSpace.heightAnchor constraintEqualToConstant:SSSidebarRowHeight].active = YES;
        }
    }
    if (self.navigationView) {
        NSButton *zoom = [self.webview.window standardWindowButton:NSWindowZoomButton];
        if (zoom) {
            NSRect controls = [zoom convertRect:zoom.bounds toView:self.webview];
            // The native controls' actual trailing edge supplies the safe
            // area. Keep one 8pt control gap; account for row inset/spacing.
            self.navigationSafeArea.constant = MAX(0, NSMaxX(controls) - [frame[@"x"] doubleValue] - 4);
        }
        // Navigation occupies the window's titlebar band, independently of
        // sidebar width. Never reduce control gaps to fit a narrow sidebar.
        NSRect navigationRect = NSMakeRect([frame[@"x"] doubleValue], [frame[@"y"] doubleValue] + 4,
            MAX([frame[@"width"] doubleValue], self.navigationView.fittingSize.width), SSSidebarRowHeight);
        if (!self.webview.isFlipped) navigationRect.origin.y = NSHeight(self.webview.bounds) - NSMaxY(navigationRect);
        self.navigationView.frame = [self.webview convertRect:navigationRect toView:self.webview.superview];
        [self.webview.superview addSubview:self.navigationView
            positioned:[snapshot[@"behindWebview"] boolValue] ? NSWindowBelow : NSWindowAbove relativeTo:self.webview];
        self.navigationView.accessibilityHidden = [snapshot[@"behindWebview"] boolValue];
    }
    if (footerChanged) [self replaceStack:self.footer nodes:footer];
    if (bodyChanged) {
        NSPoint scrollPosition = self.scroll.contentView.bounds.origin;
        [self.outline reloadData];
        [self restoreExpansion:self.roots];
        NSInteger selected = -1;
        for (NSInteger index = 0; index < self.outline.numberOfRows; index++) {
            SSSidebarNode *node = [self.outline itemAtRow:index];
            if ([node.data[@"selected"] boolValue]) selected = index;
        }
        [self.outline selectRowIndexes:selected < 0 ? NSIndexSet.indexSet : [NSIndexSet indexSetWithIndex:selected] byExtendingSelection:NO];
        [self.scroll.contentView scrollToPoint:scrollPosition];
        [self.scroll reflectScrolledClipView:self.scroll.contentView];
    }
    self.applying = NO;
}

- (void)sendAction:(NSDictionary *)action value:(NSString *)value {
    if (self.removed || self.applying || ![action[@"enabled"] boolValue] || !self.callback) return;
    NSMutableDictionary *payload = [@{@"mountId": self.mountId, @"revision": @(self.revision), @"actionId": action[@"id"]} mutableCopy];
    if (value) payload[@"value"] = value;
    if ([action[@"id"] hasSuffix:@":select"] || [action[@"id"] isEqualToString:@"sidebar.shortcut"]) {
        [self.webview.window makeFirstResponder:self.webview];
    }
    NSData *data = [NSJSONSerialization dataWithJSONObject:payload options:0 error:nil];
    NSString *json = [[NSString alloc] initWithData:data encoding:NSUTF8StringEncoding];
    if (json) self.callback(self.callbackContext, json.UTF8String);
}

- (void)detach {
    if (self.removed) return;
    self.removed = YES;
    [self.surface removeFromSuperview];
    [self.navigationView removeFromSuperview];
    [NSDistributedNotificationCenter.defaultCenter removeObserver:self];
    [NSWorkspace.sharedWorkspace.notificationCenter removeObserver:self];
    if (self.keyMonitor) [NSEvent removeMonitor:self.keyMonitor];
    self.keyMonitor = nil;
    self.outline.dataSource = nil;
    self.outline.delegate = nil;
    if (self.releaseCallback && self.callbackContext) self.releaseCallback(self.callbackContext);
    self.callbackContext = NULL;
}

- (void)dealloc { [self detach]; }
@end

// A host belongs to its WKWebView, so window closure releases all native
// resources. Retired mount IDs prevent a late update resurrecting an unmount.
static const void *SSRetiredMountsAssociation = &SSRetiredMountsAssociation;

static id SSWithoutNulls(id value) {
    if ([value isKindOfClass:NSDictionary.class]) {
        NSMutableDictionary *clean = [NSMutableDictionary dictionary];
        for (NSString *key in value) {
            if (value[key] != NSNull.null) clean[key] = SSWithoutNulls(value[key]);
        }
        return clean;
    }
    if ([value isKindOfClass:NSArray.class]) {
        NSMutableArray *clean = [NSMutableArray array];
        for (id child in value) if (child != NSNull.null) [clean addObject:SSWithoutNulls(child)];
        return clean;
    }
    return value;
}

bool ss_sidebar_update(void *webviewPointer, const char *json, void *context,
    SSSidebarActionCallback callback, SSSidebarReleaseCallback release, char **error) {
    @autoreleasepool {
        BOOL adopted = NO;
        @try {
            WKWebView *webview = (__bridge WKWebView *)webviewPointer;
            if (!NSThread.isMainThread || !webview.superview) {
                if (release) release(context);
                if (error) *error = strdup("Native sidebar requires an attached main-thread webview");
                return false;
            }
            NSData *data = [[NSString stringWithUTF8String:json] dataUsingEncoding:NSUTF8StringEncoding];
            NSDictionary *snapshot = SSWithoutNulls([NSJSONSerialization JSONObjectWithData:data options:0 error:nil]);
            if (![snapshot isKindOfClass:NSDictionary.class]) {
                if (release) release(context);
                if (error) *error = strdup("Invalid native sidebar snapshot");
                return false;
            }
            NSMutableSet *retired = objc_getAssociatedObject(webview, SSRetiredMountsAssociation);
            if ([retired containsObject:snapshot[@"mountId"]]) {
                if (release) release(context);
                return false;
            }
            SSSidebarHost *host = objc_getAssociatedObject(webview, SSSidebarAssociation);
            if (host && ![host.mountId isEqualToString:snapshot[@"mountId"]]) {
                [host detach];
                host = nil;
            }
            if (!host) {
                host = [[SSSidebarHost alloc] initWithWebview:webview];
                if (!host) {
                    if (release) release(context);
                    if (error) *error = strdup("Could not create the native sidebar host");
                    return false;
                }
                host.callbackContext = context;
                host.callback = callback;
                host.releaseCallback = release;
                adopted = YES;
                objc_setAssociatedObject(webview, SSSidebarAssociation, host, OBJC_ASSOCIATION_RETAIN_NONATOMIC);
            } else {
                if (release) release(context);
                adopted = YES;
            }
            if (host.revision >= [snapshot[@"revision"] unsignedLongLongValue]) return true;
            [host applySnapshot:snapshot];
            return true;
        } @catch (NSException *exception) {
            if (!adopted && release) release(context);
            if (error) *error = strdup(exception.reason.UTF8String ?: "Native sidebar failed");
            return false;
        }
    }
}

void ss_sidebar_remove(void *webviewPointer, const char *mountId) {
    @autoreleasepool {
        WKWebView *webview = (__bridge WKWebView *)webviewPointer;
        NSString *identifier = [NSString stringWithUTF8String:mountId];
        NSMutableSet *retired = objc_getAssociatedObject(webview, SSRetiredMountsAssociation);
        if (!retired) {
            retired = [NSMutableSet set];
            objc_setAssociatedObject(webview, SSRetiredMountsAssociation, retired, OBJC_ASSOCIATION_RETAIN_NONATOMIC);
        }
        [retired addObject:identifier];
        SSSidebarHost *host = objc_getAssociatedObject(webview, SSSidebarAssociation);
        if ([host.mountId isEqualToString:identifier]) {
            [host detach];
            objc_setAssociatedObject(webview, SSSidebarAssociation, nil, OBJC_ASSOCIATION_RETAIN_NONATOMIC);
        }
    }
}

void ss_sidebar_free_error(char *error) { free(error); }
