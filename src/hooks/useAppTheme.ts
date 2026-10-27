import { useSyncExternalStore } from 'react';
import { getThemeSnapshot, subscribeTheme } from '../lib/theme';

/** The saved preference and its current light/dark appearance. */
export function useAppTheme() {
  return useSyncExternalStore(subscribeTheme, getThemeSnapshot);
}
