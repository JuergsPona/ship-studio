import { useEffect, useRef, useState } from 'react';
import { listen } from '@tauri-apps/api/event';
import {
  AUTO_START_PROJECT_SERVERS_CHANGED_EVENT,
  AUTO_START_PROJECT_SERVERS_LOCAL_CHANGED_EVENT,
  getAutoStartProjectServers,
} from '../lib/settings';

/** null means loading; only an explicit true authorizes automatic startup. */
export function useAutoStartProjectServers(): boolean | null {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const sequence = useRef(0);

  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | undefined;
    const update = (value: boolean) => {
      if (disposed || typeof value !== 'boolean') return;
      sequence.current += 1;
      setEnabled(value);
    };
    const onLocalChange = (event: Event) => update((event as CustomEvent<boolean>).detail);
    window.addEventListener(AUTO_START_PROJECT_SERVERS_LOCAL_CHANGED_EVENT, onLocalChange);
    void (async () => {
      try {
        const stop = await listen<boolean>(AUTO_START_PROJECT_SERVERS_CHANGED_EVENT, (event) =>
          update(event.payload)
        );
        if (disposed) {
          stop();
          return;
        }
        unlisten = stop;
      } catch {
        // Reading persisted state still works if event subscription is unavailable.
      }
      const beforeRead = sequence.current;
      const value = await getAutoStartProjectServers();
      if (!disposed && sequence.current === beforeRead) setEnabled(value);
    })();
    return () => {
      disposed = true;
      unlisten?.();
      window.removeEventListener(AUTO_START_PROJECT_SERVERS_LOCAL_CHANGED_EVENT, onLocalChange);
    };
  }, []);

  return enabled;
}
