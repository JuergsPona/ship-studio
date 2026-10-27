import { useCommands } from './useCommands';
import { useOptionalToast } from '../contexts/ToastContext';
import { SettingsIcon } from '@/components/icons';
import { asCommandError, formatCommandError } from '../lib/errors';
import { setThemePreference, THEME_OPTIONS } from '../lib/theme';

export function useThemeCommands() {
  const { showToast } = useOptionalToast();
  useCommands(
    () =>
      THEME_OPTIONS.map(({ value, label }) => ({
        id: `settings.theme.${value}`,
        title: value === 'system' ? 'Use system appearance' : `Use ${label.toLowerCase()} mode`,
        icon: <SettingsIcon size={14} />,
        category: 'settings' as const,
        keywords: ['theme', 'appearance', 'light', 'dark', 'system'],
        run: async () => {
          try {
            await setThemePreference(value);
          } catch (error) {
            showToast(formatCommandError(asCommandError(error)), 'error');
          }
        },
      })),
    [showToast]
  );
}
