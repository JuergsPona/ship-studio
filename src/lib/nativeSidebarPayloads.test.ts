import { describe, expect, it } from 'vitest';
import { parseNativeSidebarMove, parseNativeSidebarShortcut } from './nativeSidebarPayloads';

describe('native sidebar action payloads', () => {
  it('accepts a valid project move and drops unrelated fields', () => {
    expect(
      parseNativeSidebarMove('{"id":"project:one","group":"pinned","index":2,"extra":true}')
    ).toEqual({ id: 'project:one', group: 'pinned', index: 2 });
  });

  it.each([
    '',
    'null',
    '[]',
    '{"id":"","group":"pinned","index":0}',
    '{"id":"one","group":"elsewhere","index":0}',
    '{"id":"one","group":"active","index":-1}',
    '{"id":"one","group":"active","index":1.5}',
    '{"id":"one","group":"active","index":"1"}',
  ])('rejects an invalid project move: %s', (value) => {
    expect(parseNativeSidebarMove(value)).toBeNull();
  });

  it('accepts a native Command shortcut with explicit modifiers', () => {
    expect(
      parseNativeSidebarShortcut(
        '{"key":"K","metaKey":true,"ctrlKey":false,"altKey":false,"shiftKey":false}'
      )
    ).toEqual({ key: 'k', metaKey: true, ctrlKey: false, altKey: false, shiftKey: false });
  });

  it.each([
    '{',
    'null',
    '{"key":"1","metaKey":true,"ctrlKey":false,"altKey":false,"shiftKey":false}',
    '{"key":"k","metaKey":true}',
    '{"key":"t","metaKey":true,"ctrlKey":false,"altKey":true,"shiftKey":false}',
    '{"key":"w","metaKey":"true","ctrlKey":false,"altKey":false,"shiftKey":false}',
  ])('rejects invalid shortcuts: %s', (value) => {
    expect(parseNativeSidebarShortcut(value)).toBeNull();
  });
});
