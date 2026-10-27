#import "SidebarHost.h"

static NSString *const SSProjectType = @"com.shipstudio.native-sidebar-project";
static const CGFloat SSIconButtonSize = 30.0;

@interface SSSidebarOutline : NSOutlineView
@property(nonatomic, weak) SSSidebarHost *sidebarHost;
@end

@implementation SSSidebarOutline
- (void)keyDown:(NSEvent *)event {
    if (self.selectedRow >= 0 && [@[@"\r", @" "] containsObject:event.charactersIgnoringModifiers]) {
        SSSidebarNode *node = [self itemAtRow:self.selectedRow];
        [self.sidebarHost sendAction:node.data[@"action"] value:nil];
        return;
    }
    [super keyDown:event];
}

- (NSRect)frameOfOutlineCellAtRow:(NSInteger)row {
    NSRect disclosure = [super frameOfOutlineCellAtRow:row];
    if (NSIsEmptyRect(disclosure)) return disclosure;
    NSRect rowFrame = [self rectOfRow:row];
    disclosure.origin.y = NSMidY(rowFrame) - NSHeight(disclosure) / 2.0;
    return disclosure;
}

- (NSMenu *)menuForEvent:(NSEvent *)event {
    NSPoint point = [self convertPoint:event.locationInWindow fromView:nil];
    NSInteger row = [self rowAtPoint:point];
    if (row < 0) return nil;
    SSSidebarNode *node = [self itemAtRow:row];
    return [self.sidebarHost menuForNode:node];
}
@end

// Constructed here to keep NSOutlineView's native context menu hit-testing
// separate from the window host's lifecycle and appearance handling.
NSOutlineView *ss_sidebar_outline(SSSidebarHost *host) {
    SSSidebarOutline *outline = [[SSSidebarOutline alloc] initWithFrame:NSZeroRect];
    outline.sidebarHost = host;
    return outline;
}

static NSColor *SSTextColor(NSString *tone) {
    if ([tone isEqualToString:@"secondary"]) return NSColor.secondaryLabelColor;
    if ([tone isEqualToString:@"success"]) return NSColor.systemGreenColor;
    if ([tone isEqualToString:@"warning"]) return NSColor.systemOrangeColor;
    if ([tone isEqualToString:@"error"]) return NSColor.systemRedColor;
    return NSColor.labelColor;
}

static NSImageView *SSArtwork(NSString *address) {
    NSImageView *view = [[NSImageView alloc] initWithFrame:NSZeroRect];
    view.imageScaling = NSImageScaleProportionallyUpOrDown;
    [view.widthAnchor constraintEqualToConstant:30].active = YES;
    [view.heightAnchor constraintEqualToConstant:30].active = YES;
    view.accessibilityElement = NO;
    NSURL *url = [NSURL URLWithString:address];
    if (!url || ![@[@"https", @"http"] containsObject:url.scheme.lowercaseString]) return view;
    static NSCache<NSString *, NSImage *> *cache;
    static dispatch_once_t once;
    dispatch_once(&once, ^{ cache = [[NSCache alloc] init]; cache.countLimit = 64; });
    NSImage *cached = [cache objectForKey:address];
    if (cached) { view.image = cached; return view; }
    __weak NSImageView *weakView = view;
    NSURLSessionDataTask *task = [NSURLSession.sharedSession dataTaskWithURL:url
        completionHandler:^(NSData *data, NSURLResponse *response, NSError *error) {
            if (error || !data || data.length > 8 * 1024 * 1024) return;
            dispatch_async(dispatch_get_main_queue(), ^{
                NSImage *image = [[NSImage alloc] initWithData:data];
                if (image) { [cache setObject:image forKey:address]; weakView.image = image; }
            });
        }];
    [task resume];
    return view;
}

@implementation SSSidebarHost (Outline)
- (void)activate:(id)sender {
    NSDictionary *action = [sender actionSpec];
    if ([sender isKindOfClass:NSButton.class] && action[@"selected"] != nil) {
        // AppKit toggles on click; the shared presentation owns selection.
        [(NSButton *)sender setState:[action[@"selected"] boolValue] ? NSControlStateValueOn : NSControlStateValueOff];
    }
    NSString *value = [sender isKindOfClass:NSSlider.class]
        ? [NSString stringWithFormat:@"%.3f", [(NSSlider *)sender doubleValue]] : nil;
    [self sendAction:action value:value];
}

- (NSButton *)buttonForAction:(NSDictionary *)action {
    SSSidebarButton *button = [SSSidebarButton buttonWithTitle:action[@"label"] ?: @""
        target:self action:@selector(activate:)];
    button.actionSpec = action;
    button.enabled = [action[@"enabled"] boolValue];
    button.controlSize = NSControlSizeRegular;
    if (action[@"selected"] != nil) {
        [button setButtonType:NSButtonTypeOnOff];
        button.state = [action[@"selected"] boolValue] ? NSControlStateValueOn : NSControlStateValueOff;
    }
    button.bezelStyle = NSBezelStyleRounded;
#if __MAC_OS_X_VERSION_MAX_ALLOWED >= 260000
    if (@available(macOS 26.0, *)) {
        button.bezelStyle = NSBezelStyleGlass;
        button.borderShape = NSControlBorderShapeRoundedRectangle;
    }
#endif
    button.toolTip = action[@"label"];
    button.accessibilityLabel = action[@"label"];
    button.accessibilityIdentifier = action[@"id"];
    NSString *symbol = action[@"symbol"];
    if (symbol) {
        if (@available(macOS 11.0, *)) {
            NSImage *image = [NSImage imageWithSystemSymbolName:symbol accessibilityDescription:action[@"label"]];
            if (image) {
                button.image = image;
                button.imagePosition = NSImageOnly;
            }
        }
    }
    return button;
}

- (NSButton *)iconButtonForAction:(NSDictionary *)action {
    NSButton *button = [self buttonForAction:action];
    button.translatesAutoresizingMaskIntoConstraints = NO;
    [NSLayoutConstraint activateConstraints:@[
        [button.widthAnchor constraintEqualToConstant:SSIconButtonSize],
        [button.heightAnchor constraintEqualToConstant:SSIconButtonSize]
    ]];
    [button setContentHuggingPriority:NSLayoutPriorityRequired forOrientation:NSLayoutConstraintOrientationHorizontal];
    [button setContentCompressionResistancePriority:NSLayoutPriorityRequired forOrientation:NSLayoutConstraintOrientationHorizontal];
    return button;
}

- (NSMenu *)menuForActions:(NSArray *)actions {
    NSMenu *menu = [[NSMenu alloc] initWithTitle:@"Sidebar actions"];
    menu.autoenablesItems = NO;
    for (NSDictionary *action in actions) {
        SSSidebarMenuItem *item = [[SSSidebarMenuItem alloc] initWithTitle:action[@"label"] ?: @""
            action:@selector(activate:) keyEquivalent:@""];
        item.target = self;
        item.actionSpec = action;
        item.enabled = [action[@"enabled"] boolValue];
        [menu addItem:item];
    }
    return menu;
}

- (NSMenu *)menuForNode:(SSSidebarNode *)node {
    NSMutableArray *actions = [NSMutableArray arrayWithArray:node.data[@"menu"] ?: @[]];
    [actions addObjectsFromArray:node.data[@"buttons"] ?: @[]];
    NSMenu *menu = [self menuForActions:actions];
    NSDictionary *rename = node.data[@"rename"];
    if ([rename[@"enabled"] boolValue]) {
        NSMenuItem *item = [[NSMenuItem alloc] initWithTitle:@"Rename…" action:@selector(renameNode:) keyEquivalent:@""];
        item.target = self;
        item.representedObject = node;
        [menu addItem:item];
    }
    return menu;
}

- (void)showMenu:(SSSidebarButton *)sender {
    NSMenu *menu = [self menuForActions:sender.menuSpecs];
    [menu popUpMenuPositioningItem:nil atLocation:NSMakePoint(0, NSHeight(sender.bounds)) inView:sender];
}

- (void)renameNode:(NSMenuItem *)sender {
    SSSidebarNode *node = sender.representedObject;
    NSDictionary *action = node.data[@"rename"];
    if (![action[@"enabled"] boolValue] || self.removed) return;
    NSAlert *alert = [[NSAlert alloc] init];
    alert.messageText = @"Rename tab";
    alert.informativeText = @"Leave the name empty to restore the terminal-provided title.";
    [alert addButtonWithTitle:@"Rename"];
    [alert addButtonWithTitle:@"Cancel"];
    NSTextField *field = [[NSTextField alloc] initWithFrame:NSMakeRect(0, 0, 280, 24)];
    field.stringValue = node.data[@"title"] ?: @"";
    field.accessibilityLabel = @"Tab name";
    alert.accessoryView = field;
    NSString *mount = self.mountId;
    __weak SSSidebarHost *weakSelf = self;
    [alert beginSheetModalForWindow:self.surface.window completionHandler:^(NSModalResponse response) {
        SSSidebarHost *host = weakSelf;
        NSDictionary *current = host.nodes[node.identifier].data[@"rename"];
        if (response != NSAlertFirstButtonReturn || host.removed ||
            ![host.mountId isEqualToString:mount] || ![current[@"id"] isEqual:action[@"id"]]) return;
        [host sendAction:current value:[field.stringValue stringByTrimmingCharactersInSet:NSCharacterSet.whitespaceAndNewlineCharacterSet]];
    }];
    [alert.window makeFirstResponder:field];
}

- (NSView *)rowView:(SSSidebarNode *)node {
    return [self rowView:node outline:NO];
}

- (NSView *)rowView:(SSSidebarNode *)node outline:(BOOL)outlineRow {
    NSDictionary *data = node.data;
    BOOL compact = [self.snapshot[@"compact"] boolValue] && ![node.identifier isEqualToString:@"navigation"];
    NSStackView *row = [NSStackView stackViewWithViews:@[]];
    row.orientation = NSUserInterfaceLayoutOrientationHorizontal;
    row.alignment = NSLayoutAttributeCenterY;
    row.distribution = NSStackViewDistributionFill;
    row.spacing = 8;
    row.translatesAutoresizingMaskIntoConstraints = NO;
    row.edgeInsets = NSEdgeInsetsMake(4, compact ? 0 : 4, 4, compact ? 0 : 4);
    row.accessibilityLabel = [NSString stringWithFormat:@"%@ %@", data[@"title"] ?: @"", data[@"detail"] ?: @""];
    if ([node.identifier isEqualToString:@"navigation"]) {
        NSView *safeArea = [[NSView alloc] initWithFrame:NSZeroRect];
        [row addArrangedSubview:safeArea];
        self.navigationSafeArea = [safeArea.widthAnchor constraintEqualToConstant:0];
        self.navigationSafeArea.active = YES;
    }
    if (!compact && [data[@"imageUrl"] length] > 0) [row addArrangedSubview:SSArtwork(data[@"imageUrl"])];
    if (!compact && ![data[@"busy"] boolValue] &&
        [@[@"success", @"warning", @"error"] containsObject:data[@"tone"] ?: @""]) {
        if (@available(macOS 11.0, *)) {
            NSImageView *status = [[NSImageView alloc] initWithFrame:NSZeroRect];
            status.image = [NSImage imageWithSystemSymbolName:@"circle.fill" accessibilityDescription:nil];
            status.contentTintColor = SSTextColor(data[@"tone"]);
            status.accessibilityElement = NO;
            [status.widthAnchor constraintEqualToConstant:8].active = YES;
            [status.heightAnchor constraintEqualToConstant:8].active = YES;
            [row addArrangedSubview:status];
        }
    }
    NSTextField *label = [NSTextField labelWithString:data[@"title"] ?: @""];
    if (compact && label.stringValue.length > 1) label.stringValue = [label.stringValue substringToIndex:1];
    label.font = [NSFont systemFontOfSize:NSFont.systemFontSize];
    label.textColor = [data[@"tone"] isEqualToString:@"secondary"] ? NSColor.secondaryLabelColor : NSColor.labelColor;
    label.lineBreakMode = NSLineBreakByTruncatingTail;
    label.toolTip = data[@"title"];
    label.accessibilityLabel = data[@"title"];
    [label setContentCompressionResistancePriority:NSLayoutPriorityDefaultLow forOrientation:NSLayoutConstraintOrientationHorizontal];
    NSDictionary *primary = data[@"action"];
    if (primary && !outlineRow) {
        NSButton *button = [self buttonForAction:primary];
        button.title = compact && [data[@"title"] length] > 1 ? [data[@"title"] substringToIndex:1] : data[@"title"] ?: @"";
        if (!compact) button.image = nil;
        button.bordered = [node.identifier isEqualToString:@"search"];
        if (@available(macOS 10.14, *)) button.contentTintColor = NSColor.labelColor;
        if (!compact && [node.identifier isEqualToString:@"search"]) {
            [button.widthAnchor constraintEqualToAnchor:row.widthAnchor constant:-8].active = YES;
        }
        [button setContentCompressionResistancePriority:NSLayoutPriorityDefaultLow forOrientation:NSLayoutConstraintOrientationHorizontal];
        [row addArrangedSubview:button];
    } else if ([data[@"title"] length] > 0 && !(compact && [data[@"menu"] count] > 0)) {
        [row addArrangedSubview:label];
    }
    if (!compact && [data[@"detail"] length] > 0) {
        NSTextField *detail = [NSTextField labelWithString:data[@"detail"]];
        detail.textColor = NSColor.secondaryLabelColor;
        detail.font = [NSFont systemFontOfSize:NSFont.smallSystemFontSize];
        detail.lineBreakMode = NSLineBreakByTruncatingTail;
        [detail setContentCompressionResistancePriority:NSLayoutPriorityDefaultLow - 1 forOrientation:NSLayoutConstraintOrientationHorizontal];
        [row addArrangedSubview:detail];
    }
    if (!compact && [data[@"busy"] boolValue]) {
        NSProgressIndicator *progress = [[NSProgressIndicator alloc] initWithFrame:NSZeroRect];
        progress.style = NSProgressIndicatorStyleSpinning;
        progress.controlSize = NSControlSizeSmall;
        progress.accessibilityLabel = @"Working";
        [progress startAnimation:nil];
        [row addArrangedSubview:progress];
    }
    if (!compact && ![node.identifier isEqualToString:@"navigation"] &&
        ([data[@"buttons"] count] > 0 || [data[@"menu"] count] > 0)) {
        NSView *spacer = [[NSView alloc] initWithFrame:NSZeroRect];
        spacer.translatesAutoresizingMaskIntoConstraints = NO;
        [spacer setContentHuggingPriority:NSLayoutPriorityDefaultLow forOrientation:NSLayoutConstraintOrientationHorizontal];
        [spacer setContentCompressionResistancePriority:NSLayoutPriorityDefaultLow forOrientation:NSLayoutConstraintOrientationHorizontal];
        [row addArrangedSubview:spacer];
        [spacer.widthAnchor constraintGreaterThanOrEqualToConstant:0].active = YES;
    }
    if (!compact) for (NSDictionary *action in data[@"buttons"]) [row addArrangedSubview:[self iconButtonForAction:action]];
    if ([data[@"menu"] count] > 0 && (!compact || !primary)) {
        SSSidebarButton *menu = (SSSidebarButton *)[self iconButtonForAction:@{
            @"id": @"menu", @"label": @"Actions", @"symbol": @"ellipsis", @"enabled": @YES}];
        menu.menuSpecs = data[@"menu"];
        menu.action = @selector(showMenu:);
        [row addArrangedSubview:menu];
    }
    NSDictionary *sliderData = data[@"slider"];
    if (sliderData) {
        SSSidebarSlider *slider = [[SSSidebarSlider alloc] initWithFrame:NSZeroRect];
        slider.minValue = [sliderData[@"min"] doubleValue];
        slider.maxValue = [sliderData[@"max"] doubleValue];
        slider.doubleValue = [sliderData[@"value"] doubleValue];
        slider.continuous = NO;
        slider.actionSpec = sliderData[@"action"];
        slider.target = self;
        slider.action = @selector(activate:);
        slider.accessibilityLabel = slider.actionSpec[@"label"];
        [row addArrangedSubview:slider];
        [slider.widthAnchor constraintGreaterThanOrEqualToConstant:80].active = YES;
    }
    [row.heightAnchor constraintGreaterThanOrEqualToConstant:SSSidebarRowHeight].active = YES;
    return row;
}

- (NSInteger)outlineView:(NSOutlineView *)outline numberOfChildrenOfItem:(SSSidebarNode *)item {
    return item ? item.children.count : self.roots.count;
}
- (id)outlineView:(NSOutlineView *)outline child:(NSInteger)index ofItem:(SSSidebarNode *)item {
    return item ? item.children[index] : self.roots[index];
}
- (BOOL)outlineView:(NSOutlineView *)outline isItemExpandable:(SSSidebarNode *)item {
    return item.children.count > 0 || item.data[@"toggle"] != nil;
}
- (NSView *)outlineView:(NSOutlineView *)outline viewForTableColumn:(NSTableColumn *)column item:(SSSidebarNode *)item {
    NSTableCellView *cell = [[NSTableCellView alloc] initWithFrame:NSMakeRect(0, 0, column.width, SSSidebarRowHeight)];
    NSStackView *content = (NSStackView *)[self rowView:item outline:YES];
    for (NSView *view in content.arrangedSubviews) {
        if ([view isKindOfClass:NSTextField.class]) {
            cell.textField = (NSTextField *)view;
            break;
        }
    }
    content.translatesAutoresizingMaskIntoConstraints = NO;
    [cell addSubview:content];
    [NSLayoutConstraint activateConstraints:@[
        [content.leadingAnchor constraintEqualToAnchor:cell.leadingAnchor],
        [content.trailingAnchor constraintEqualToAnchor:cell.trailingAnchor],
        [content.centerYAnchor constraintEqualToAnchor:cell.centerYAnchor]
    ]];
    return cell;
}
- (CGFloat)outlineView:(NSOutlineView *)outline heightOfRowByItem:(SSSidebarNode *)item { return SSSidebarRowHeight; }
- (BOOL)outlineView:(NSOutlineView *)outline shouldSelectItem:(SSSidebarNode *)item {
    return [item.data[@"action"][@"enabled"] boolValue];
}
- (void)activateOutlineRow:(NSOutlineView *)outline {
    if (self.applying || outline.clickedRow < 0) return;
    SSSidebarNode *node = [outline itemAtRow:outline.clickedRow];
    [self sendAction:node.data[@"action"] value:nil];
}
- (void)outlineViewItemDidExpand:(NSNotification *)notification {
    SSSidebarNode *node = notification.userInfo[@"NSObject"];
    if (![node.data[@"expanded"] boolValue]) [self sendAction:node.data[@"toggle"] value:@"true"];
}
- (void)outlineViewItemDidCollapse:(NSNotification *)notification {
    SSSidebarNode *node = notification.userInfo[@"NSObject"];
    if ([node.data[@"expanded"] boolValue]) [self sendAction:node.data[@"toggle"] value:@"false"];
}
- (id<NSPasteboardWriting>)outlineView:(NSOutlineView *)outline pasteboardWriterForItem:(SSSidebarNode *)item {
    if (!item.data[@"dragGroup"] || ![self.snapshot[@"moveAction"][@"enabled"] boolValue]) return nil;
    NSPasteboardItem *pasteboard = [[NSPasteboardItem alloc] init];
    [pasteboard setString:item.identifier forType:SSProjectType];
    return pasteboard;
}
- (NSDragOperation)outlineView:(NSOutlineView *)outline validateDrop:(id<NSDraggingInfo>)info proposedItem:(SSSidebarNode *)item proposedChildIndex:(NSInteger)index {
    if (info.draggingSource != outline || index < 0 ||
        ![@[@"group:pinned", @"group:active"] containsObject:item.identifier]) return NSDragOperationNone;
    return NSDragOperationMove;
}
- (BOOL)outlineView:(NSOutlineView *)outline acceptDrop:(id<NSDraggingInfo>)info item:(SSSidebarNode *)item childIndex:(NSInteger)index {
    NSString *identifier = [info.draggingPasteboard stringForType:SSProjectType];
    SSSidebarNode *source = self.nodes[identifier];
    if (!source || index < 0 || ![self.snapshot[@"moveAction"][@"enabled"] boolValue]) return NO;
    NSDictionary *move = @{@"id": identifier, @"group": [item.identifier substringFromIndex:6], @"index": @(index)};
    NSData *data = [NSJSONSerialization dataWithJSONObject:move options:0 error:nil];
    [self sendAction:self.snapshot[@"moveAction"] value:[[NSString alloc] initWithData:data encoding:NSUTF8StringEncoding]];
    return YES;
}
@end
