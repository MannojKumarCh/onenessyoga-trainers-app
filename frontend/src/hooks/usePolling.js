import { useEffect, useRef } from 'react';

/**
 * Polls a load function at a regular interval + on visibility change.
 * @param {Function} loadFn  — the function to call (should be stable / useCallback'd)
 * @param {number}   intervalMs — polling interval in ms (default 30 000)
 * @param {boolean}  enabled — set false to pause polling (e.g. while a modal is open)
 */
export function usePolling(loadFn, intervalMs = 30000, enabled = true) {
  const savedFn = useRef(loadFn);
  useEffect(() => { savedFn.current = loadFn; }, [loadFn]);

  useEffect(() => {
    if (!enabled) return;

    // Periodic interval
    const id = setInterval(() => savedFn.current(), intervalMs);

    // Re-fetch when user returns to the tab
    function onVisibility() {
      if (document.visibilityState === 'visible') {
        savedFn.current();
      }
    }
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [intervalMs, enabled]);
}

export default usePolling;
