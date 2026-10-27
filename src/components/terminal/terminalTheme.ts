import type { ITheme, ITerminalOptions, Terminal } from '@xterm/xterm';
import { getThemeSnapshot, subscribeTheme, type ResolvedTheme } from '../../lib/theme';

export type TerminalThemeVariant = 'normal' | 'onboarding' | 'build' | 'logs' | 'connection';

type TerminalVisualOptions = Pick<
  ITerminalOptions,
  | 'fontFamily'
  | 'fontSize'
  | 'lineHeight'
  | 'cursorBlink'
  | 'cursorStyle'
  | 'scrollback'
  | 'minimumContrastRatio'
>;

/*
 * These values intentionally live at the xterm API boundary. They are not CSS
 * values and cannot be represented by the app token cascade; each terminal
 * variant consumes this one palette through createTerminalOptions().
 */
const TERMINAL_THEME: ITheme = {
  background: '#141414',
  foreground: '#bcbcbc',
  cursor: '#ffffff',
  selectionBackground: '#393939',
  black: '#000000',
  red: '#cd3131',
  green: '#0dbc79',
  yellow: '#e5e510',
  blue: '#2472c8',
  magenta: '#bc3fbc',
  cyan: '#11a8cd',
  white: '#e5e5e5',
  brightBlack: '#666666',
  brightRed: '#f14c4c',
  brightGreen: '#23d18b',
  brightYellow: '#f5f543',
  brightBlue: '#3b8eea',
  brightMagenta: '#d670d6',
  brightCyan: '#29b8db',
  brightWhite: '#ffffff',
};

const LIGHT_TERMINAL_THEME: ITheme = {
  background: '#f1f1f1',
  foreground: '#282828',
  cursor: '#282828',
  cursorAccent: '#f1f1f1',
  selectionBackground: '#d5d5d5',
  black: '#282828',
  red: '#b42318',
  green: '#197b32',
  yellow: '#976412',
  blue: '#006acc',
  magenta: '#734ce0',
  cyan: '#007585',
  white: '#4e4e4e',
  brightBlack: '#606060',
  brightRed: '#b42318',
  brightGreen: '#197b32',
  brightYellow: '#976412',
  brightBlue: '#006acc',
  brightMagenta: '#734ce0',
  brightCyan: '#007585',
  brightWhite: '#282828',
};

const STANDARD_TERMINAL_OPTIONS: TerminalVisualOptions = {
  fontFamily: '"JetBrainsMono NF", Menlo, Monaco, "Courier New", monospace',
  lineHeight: 1.2,
  cursorBlink: true,
  cursorStyle: 'block',
  scrollback: 5000,
  // Match VS Code's default and keep dim ANSI text readable on dark cells.
  minimumContrastRatio: 4.5,
};

const TERMINAL_VARIANT_OPTIONS: Record<TerminalThemeVariant, TerminalVisualOptions> = {
  normal: { ...STANDARD_TERMINAL_OPTIONS, fontSize: 13 },
  onboarding: { ...STANDARD_TERMINAL_OPTIONS, fontSize: 13 },
  build: { ...STANDARD_TERMINAL_OPTIONS, fontSize: 12, cursorStyle: 'bar' },
  logs: { ...STANDARD_TERMINAL_OPTIONS, fontSize: 13, cursorBlink: false, scrollback: 10000 },
  connection: { ...STANDARD_TERMINAL_OPTIONS, fontSize: 13, scrollback: 1000 },
};

const TERMINAL_VARIANT_THEME: Record<TerminalThemeVariant, Partial<ITheme>> = {
  normal: {},
  onboarding: {},
  build: {},
  logs: { background: '#1a1a1a' },
  connection: {},
};

/**
 * Build the shared xterm options for a terminal surface.
 *
 * Callers may provide lifecycle/input overrides, but visual options and the
 * palette stay explicit and centralized here.
 */
export function createTerminalOptions(
  variant: TerminalThemeVariant,
  overrides: Partial<ITerminalOptions> = {},
  appearance: ResolvedTheme = getThemeSnapshot().resolved
): ITerminalOptions {
  const { theme: themeOverride, ...behaviorOverrides } = overrides;

  return {
    ...TERMINAL_VARIANT_OPTIONS[variant],
    ...behaviorOverrides,
    theme: {
      ...(appearance === 'light' ? LIGHT_TERMINAL_THEME : TERMINAL_THEME),
      ...(appearance === 'dark' ? TERMINAL_VARIANT_THEME[variant] : {}),
      ...(appearance === 'light' && variant === 'logs' ? { background: '#ffffff' } : {}),
      ...themeOverride,
    },
  };
}

/** Repaint existing terminals without recreating their PTY, buffer, or addons. */
export function bindTerminalTheme(
  terminal: Pick<Terminal, 'options'>,
  variant: TerminalThemeVariant
): () => void {
  let appearance = getThemeSnapshot().resolved;
  return subscribeTheme(() => {
    const next = getThemeSnapshot().resolved;
    if (next === appearance) return;
    appearance = next;
    terminal.options.theme = createTerminalOptions(variant, {}, next).theme;
  });
}
