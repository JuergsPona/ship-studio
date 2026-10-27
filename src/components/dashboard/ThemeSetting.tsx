import { NativeThemeControl } from './NativeThemeControl';
import { useAppTheme } from '../../hooks/useAppTheme';
import { useAsyncState } from '../../hooks/useAsyncState';
import { useOptionalToast } from '../../contexts/ToastContext';
import { setThemePreference } from '../../lib/theme';

/** App appearance is deliberately independent of the Dock icon setting. */
export function ThemeSetting() {
  const { preference } = useAppTheme();
  const { showToast } = useOptionalToast();
  const { execute, isLoading } = useAsyncState(setThemePreference, {
    onError: (error) => showToast(error.message, 'error'),
  });

  return (
    <div className="settings-row settings-row--stacked">
      <div className="settings-row-info">
        <span className="settings-row-label">Appearance</span>
        <span className="settings-row-description">System follows your device’s appearance.</span>
      </div>
      <NativeThemeControl
        value={preference}
        disabled={isLoading}
        onValueChange={(next) => void execute(next)}
      />
    </div>
  );
}
