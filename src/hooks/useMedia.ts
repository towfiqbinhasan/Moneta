import { useSyncExternalStore } from 'react';

/** Reactive media query, e.g. useMedia('(min-width: 768px)'). */
export function useMedia(query: string) {
  return useSyncExternalStore(
    (cb) => { const m = window.matchMedia(query); m.addEventListener('change', cb); return () => m.removeEventListener('change', cb); },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

export const useIsDesktop = () => useMedia('(min-width: 768px)');
