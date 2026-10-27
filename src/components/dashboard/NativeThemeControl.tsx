import { SegmentedControl } from '../primitives/SegmentedControl';
import { useNativeThemeControl } from '../../hooks/useNativeThemeControl';
import { THEME_OPTIONS, type ThemePreference } from '../../lib/theme';

interface Props {
  value: ThemePreference;
  disabled: boolean;
  onValueChange: (value: ThemePreference) => void;
}

/** AppKit paints macOS; the shared control remains usable on other platforms. */
export function NativeThemeControl({ value, disabled, onValueChange }: Props) {
  const { ref, native, focus, blur } = useNativeThemeControl(value, disabled, onValueChange);
  return (
    <div
      ref={ref}
      className="native-theme-control"
      role={native ? 'group' : undefined}
      aria-label={native ? 'App appearance' : undefined}
      tabIndex={native && !disabled ? 0 : undefined}
      onFocus={focus}
      onBlur={blur}
    >
      {!native && (
        <SegmentedControl
          className="settings-theme-control"
          aria-label="App appearance"
          value={value}
          options={THEME_OPTIONS.map((option) => ({ ...option, disabled }))}
          onValueChange={onValueChange}
          size="default"
        />
      )}
    </div>
  );
}
