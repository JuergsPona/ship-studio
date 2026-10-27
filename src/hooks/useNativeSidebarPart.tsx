import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { NativeSidebarHandler, NativeSidebarPart } from '../lib/nativeSidebar';

export interface NativeSidebarContribution {
  part: NativeSidebarPart;
  actions: ReadonlyMap<string, NativeSidebarHandler>;
}

interface PartContext {
  parts: ReadonlyMap<string, NativeSidebarContribution>;
  register: (id: string, contribution: NativeSidebarContribution) => void;
  unregister: (id: string) => void;
}

const Context = createContext<PartContext | null>(null);

export function NativeSidebarProvider({ children }: { children: ReactNode }) {
  const [parts, setParts] = useState<Map<string, NativeSidebarContribution>>(() => new Map());
  const register = useCallback((id: string, contribution: NativeSidebarContribution) => {
    setParts((previous) => new Map(previous).set(id, contribution));
  }, []);
  const unregister = useCallback((id: string) => {
    setParts((previous) => {
      if (!previous.has(id)) return previous;
      const next = new Map(previous);
      next.delete(id);
      return next;
    });
  }, []);
  const value = useMemo(() => ({ parts, register, unregister }), [parts, register, unregister]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useNativeSidebarParts() {
  return useContext(Context)?.parts;
}

/** Optional adapter: the same widget controller feeds web and AppKit renderers. */
export function useNativeSidebarPart(id: string, contribution: NativeSidebarContribution | null) {
  const context = useContext(Context);
  const register = context?.register;
  const unregister = context?.unregister;
  const latest = useRef(contribution);
  const encoded = JSON.stringify(contribution?.part ?? null);

  useLayoutEffect(() => {
    latest.current = contribution;
  }, [contribution]);

  useLayoutEffect(
    () => () => {
      latest.current = null;
    },
    []
  );

  useEffect(() => {
    if (!register || !unregister) return;
    const part = latest.current?.part;
    if (!part) {
      unregister(id);
      return;
    }
    const ids = new Set<string>();
    const collect = (value: unknown): void => {
      if (!value || typeof value !== 'object') return;
      if (
        'enabled' in value &&
        value.enabled === true &&
        'id' in value &&
        typeof value.id === 'string'
      )
        ids.add(value.id);
      for (const child of Object.values(value)) collect(child);
    };
    collect(part);
    register(id, {
      part,
      actions: new Map(
        [...ids].map((actionId) => [
          actionId,
          (value?: string) => latest.current?.actions.get(actionId)?.(value),
        ])
      ),
    });
    return () => unregister(id);
  }, [id, encoded, register, unregister]);
}
