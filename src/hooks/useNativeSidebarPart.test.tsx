import { useEffect } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { NativeSidebarBuilder } from '../lib/nativeSidebar';
import {
  NativeSidebarProvider,
  useNativeSidebarPart,
  useNativeSidebarParts,
  type NativeSidebarContribution,
} from './useNativeSidebarPart';

function Contributor({ handler }: { handler: () => void }) {
  const builder = new NativeSidebarBuilder();
  useNativeSidebarPart('test', {
    part: {
      placement: 'footer',
      nodes: [{ id: 'test', title: 'Test', action: builder.action('test.open', 'Open', handler) }],
    },
    actions: builder.actions,
  });
  return null;
}

function Observer({ observe }: { observe: (part: NativeSidebarContribution | undefined) => void }) {
  const parts = useNativeSidebarParts();
  const part = parts?.get('test');
  useEffect(() => observe(part), [observe, part]);
  return (
    <button
      onClick={() => {
        void part?.actions.get('test.open')?.();
      }}
    >
      Invoke
    </button>
  );
}

describe('native sidebar contributions', () => {
  it('uses the latest committed handler without re-registering an unchanged presentation', async () => {
    const first = vi.fn<() => void>();
    const second = vi.fn<() => void>();
    const observe = vi.fn<(part: NativeSidebarContribution | undefined) => void>();
    const view = (handler: () => void) => (
      <NativeSidebarProvider>
        <Contributor handler={handler} />
        <Observer observe={observe} />
      </NativeSidebarProvider>
    );
    const { rerender, unmount } = render(view(first), { reactStrictMode: true });
    await waitFor(() => expect(observe.mock.lastCall?.[0]).toBeDefined());
    const registered = observe.mock.lastCall?.[0];
    rerender(view(second));
    expect(observe.mock.lastCall?.[0]).toBe(registered);
    fireEvent.click(screen.getByRole('button', { name: 'Invoke' }));
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledOnce();
    unmount();
    void registered?.actions.get('test.open')?.();
    expect(second).toHaveBeenCalledOnce();
  });
});
