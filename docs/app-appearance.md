# App appearance

Settings → Appearance provides Light, Dark, and System. System is the default
when no preference has been saved and follows live operating-system changes.
The Dock icon remains a separate setting.

On macOS, AppKit renders these choices with `NSSegmentedControl`. Its view is
clipped to the Settings scroll area and removed when the modal closes or is
covered by another modal. Tab, Shift+Tab, Escape, and app shortcuts hand back
to the existing modal keyboard handling. Other platforms and the browser
harness use the shared web segmented control.

The light palette uses white and soft gray surfaces with charcoal text and
neutral primary actions. Status, focus, and syntax colors retain their meaning.
Both themes use the same semantic and component tokens; plugins using the
published CSS token aliases inherit the selected appearance.

The native app state stores `themePreference` independently of `appIcon`.
`get_theme_preference` and `set_theme_preference` expose the setting. A successful
save broadcasts `theme-preference-changed` to all open windows. Failed saves
leave the displayed preference unchanged and surface an error toast.

The frontend caches only a successfully read or saved preference in
`shipstudio.themePreference` for the initial page paint. Native app state is
authoritative after startup. System mode caches the preference, never its
resolved appearance. Changing themes repaints terminals and code editors
without restarting sessions or replacing editor documents.

Light overrides stay in the token's owning file under `:root[data-theme='light']`.
The token inventory retains one canonical definition per token and rejects
cross-file duplicates. The harness includes `dashboard-light` and
`workspace-light` scenarios; the command palette also exposes all three modes.
