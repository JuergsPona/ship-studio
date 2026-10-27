# Native macOS sidebar

## Rollout status

The AppKit renderer is available in development builds. Release builds keep
the web sidebar until the native parity and accessibility acceptance pass has
been completed. `RELEASE_PARITY_VERIFIED` in
`src-tauri/src/commands/native_sidebar.rs` is deliberately false.

No build, formatter, linter, or tests were run by the implementation agent;
the user approved file inspection only and prohibited Node commands.

The appearance and sidebar changes remain subject to the native acceptance
pass below. The source targets Tauri API/CLI 2.12.4 and Rust Tauri 2.12.5.
The macOS CI and release jobs require a macOS 26 SDK so the glass code is built.

## Rendering and shared behavior

`WorkspaceSidebar` derives the existing project/session state once. Its native
presentation references the same handlers as the web renderer. Spotify,
remote-access, update, and browser controllers contribute native presentation
parts without duplicating their subscriptions or backend operations.

The window-scoped bridge carries serializable presentation snapshots and
opaque action IDs. Mount IDs, revision numbers, window labels, and the live
handler registry reject stale actions. The AppKit host is owned by its
WKWebView and is removed when its sidebar unmounts or the window closes.
Updates and removals are serialized across mounts. Incoming reorder and
shortcut payloads are validated before they reach shared handlers. Numeric
shortcuts are delivered by the native menu to the focused window.

The web sidebar remains mounted for its controllers, but its contents become
invisible and inert only after native mounting succeeds. Failure restores the
web renderer. Browser previews and Windows retain the web renderer.

On macOS 26+, builds using the macOS 26 SDK or newer use `NSGlassEffectView`
and glass buttons. Earlier systems or SDKs use native sidebar vibrancy and
standard AppKit controls. The native sidebar follows system appearance
independently of the web content's appearance setting. Its tint and text use
dynamic system colors, including Increase Contrast and Reduce Transparency.

## Layout

- Icon action buttons have a 30 × 30 pt square frame and rounded-rectangle
  glass borders. Accessory groups align to the trailing edge using a flexible
  spacer and full-width outline columns.
- Adjacent controls use an 8 pt gap. These are product layout choices, not a
  claim that the HIG mandates one universal button size or spacing.
- Home navigation occupies a separate titlebar band. Its safe area is
  measured from the native traffic-light controls; narrowing the sidebar
  does not remove control spacing.
- Native outline content sits inside `NSTableCellView`, centered vertically.
  Disclosure chevrons use the same row center. Rows use one shared 38 pt
  height, including space for 30 pt action controls.
- Active navigation buttons retain an enabled, selected state. Metadata yields
  space before primary row labels when the sidebar narrows.
- The existing 8 px frame and opaque content wells remain. Native views move
  behind the transparent WKWebView while web dialogs or menus are open,
  including their accessibility hierarchy and pointer input.

Relevant Apple guidance:
[Buttons](https://developer.apple.com/design/human-interface-guidelines/buttons),
[Layout](https://developer.apple.com/design/human-interface-guidelines/layout),
[Adopting Liquid Glass](https://developer.apple.com/documentation/technologyoverviews/adopting-liquid-glass).

## Scoped checks to run

Frontend:

```bash
pnpm test:run src/lib/nativeSidebar.test.ts src/lib/nativeSidebarPayloads.test.ts src/lib/nativeSidebarQueue.test.ts src/lib/sidebarNativePresentation.test.ts src/lib/nativeSidebarOverlays.test.ts src/lib/nativeSidebarFocus.test.ts src/hooks/useNativeSidebarHost.test.tsx src/hooks/useNativeSidebarPart.test.tsx src/hooks/useAppSessionLifecycle.test.tsx src/components/workspace/WorkspaceSidebar.test.tsx
```

Backend compilation and native-sidebar tests:

```bash
cargo check --manifest-path src-tauri/Cargo.toml
cargo test --manifest-path src-tauri/Cargo.toml --lib commands::native_sidebar::tests
```

Compilation checks the backend crate; the test filter limits which tests run.
The new `cc` build dependency compiles the Objective-C host on macOS only.

After updating dependencies, regenerate the token inventory and format the
frontend before running the repository gates. These commands are for the user
to run; no watch process is needed:

```bash
pnpm install
pnpm tokens:inventory
pnpm format
pnpm check:all
pnpm test:run
pnpm rust:test
```

For a debug candidate with the native renderer enabled, run:

```bash
pnpm tauri build --debug --bundles app --config '{"bundle":{"createUpdaterArtifacts":false}}'
```

Open the resulting app. The app-only bundle avoids the Finder automation needed
for DMG packaging, and the build-only override omits signed updater artifacts.
Keep the release guard false until the checks and native acceptance pass have
succeeded.

## Native acceptance pass

Before release activation, check:

1. Home, project, blank, and multiple windows; resize, collapse, fullscreen,
   Retina displays, and compact-layout transitions. Check chevron/text centers,
   square buttons, trailing alignment, traffic-light clearance, and control gaps.
2. Every existing action: project selection, pin/unpin, drag ordering within
   and between groups, family closure, worktrees, tab selection/add/close/rename,
   agent choices, server restart/stop/logs, browser choices, and keyboard shortcuts.
3. Account switching and creation, settings/help entries, update operations,
   remote access, and Spotify artwork/playback/seeking/permission states.
   Verify polling continues while the native list has keyboard focus.
4. Web dialogs and menus over the native pane, terminal focus restoration,
   keyboard-only list navigation, VoiceOver, window inactivity, stale updates,
   rapid project switching, and window closure during an action.
5. System light/dark changes, busy and bright backgrounds behind glass,
   Increase Contrast, and Reduce Transparency. Measure ordinary text contrast
   against the 4.5:1 target; it has not yet been measured or certified.
