export interface NativeSidebarMove {
  id: string;
  group: 'pinned' | 'active';
  index: number;
}

function parseObject(value: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(value);
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function parseNativeSidebarMove(value: string): NativeSidebarMove | null {
  const parsed = parseObject(value);
  if (
    !parsed ||
    typeof parsed.id !== 'string' ||
    parsed.id.length === 0 ||
    (parsed.group !== 'pinned' && parsed.group !== 'active') ||
    typeof parsed.index !== 'number' ||
    !Number.isInteger(parsed.index) ||
    parsed.index < 0
  )
    return null;
  return { id: parsed.id, group: parsed.group, index: parsed.index };
}

/** Only keyboard events forwarded by the native sidebar are accepted. */
export function parseNativeSidebarShortcut(value: string): KeyboardEventInit | null {
  const parsed = parseObject(value);
  if (
    !parsed ||
    typeof parsed.key !== 'string' ||
    !/^[ktw]$/i.test(parsed.key) ||
    parsed.metaKey !== true ||
    parsed.ctrlKey !== false ||
    parsed.altKey !== false ||
    parsed.shiftKey !== false
  )
    return null;
  return {
    key: parsed.key.toLowerCase(),
    metaKey: true,
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
  };
}
