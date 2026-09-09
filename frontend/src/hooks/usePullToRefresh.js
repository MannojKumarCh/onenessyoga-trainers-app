import { useEffect, useRef, useState } from 'react';

// The currently-mounted page's own refresh function, kept outside React
// state so the single gesture handler in AppLayout (below) can call
// whichever page is on screen without every page needing to know about the
// gesture itself - each page just registers its existing load()/refetch.
let activeRefresh = null;

// Pass null/undefined (e.g. from a page with tabs that nest another
// page/component which registers its own refresh) to skip registering
// entirely for that render, without clobbering whatever a nested child just
// registered - effect cleanups (for the fn this is replacing) always run
// before any new effects on the same commit, so a no-op registration here
// never races ahead of a child's real one.
export function useRegisterPullRefresh(fn) {
  useEffect(() => {
    if (!fn) return;
    activeRefresh = fn;
    return () => { if (activeRefresh === fn) activeRefresh = null; };
  }, [fn]);
}

export const PULL_THRESHOLD = 70;
const MAX_PULL = 100;

// Touch-gesture pull-to-refresh. Scoped to whichever `.page` element the
// touch started on, and only armed when that element is already scrolled to
// top - works the same in a plain mobile browser tab and an installed/
// standalone PWA. Uses native (non-passive) listeners rather than React's
// onTouch* props because React attaches touch handlers as passive by
// default, which silently disables preventDefault() and lets the browser's
// own scroll/bounce fight our indicator.
export function usePullToRefreshGesture() {
  const containerRef = useRef(null);
  const [pullDistance, setPullDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const stateRef = useRef({ tracking: false, startY: 0, pageEl: null, distance: 0, refreshing: false });

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    function onTouchStart(e) {
      if (stateRef.current.refreshing) return;
      const pageEl = e.target.closest('.page');
      if (!pageEl || pageEl.scrollTop > 0) return;
      stateRef.current.tracking = true;
      stateRef.current.startY = e.touches[0].clientY;
      stateRef.current.pageEl = pageEl;
    }

    function onTouchMove(e) {
      if (!stateRef.current.tracking) return;
      const { startY, pageEl } = stateRef.current;
      const delta = e.touches[0].clientY - startY;
      if (delta <= 0 || pageEl.scrollTop > 0) {
        stateRef.current.tracking = false;
        stateRef.current.distance = 0;
        setPullDistance(0);
        return;
      }
      e.preventDefault(); // suppress the native bounce/scroll while our own indicator shows
      const clamped = Math.min(delta * 0.5, MAX_PULL);
      stateRef.current.distance = clamped;
      setPullDistance(clamped);
    }

    function onTouchEnd() {
      if (!stateRef.current.tracking) return;
      stateRef.current.tracking = false;
      if (stateRef.current.distance >= PULL_THRESHOLD && activeRefresh) {
        stateRef.current.refreshing = true;
        setRefreshing(true);
        Promise.resolve(activeRefresh()).catch(() => {}).finally(() => {
          stateRef.current.refreshing = false;
          setRefreshing(false);
        });
      }
      stateRef.current.distance = 0;
      setPullDistance(0);
    }

    container.addEventListener('touchstart', onTouchStart, { passive: true });
    container.addEventListener('touchmove', onTouchMove, { passive: false });
    container.addEventListener('touchend', onTouchEnd);
    container.addEventListener('touchcancel', onTouchEnd);
    return () => {
      container.removeEventListener('touchstart', onTouchStart);
      container.removeEventListener('touchmove', onTouchMove);
      container.removeEventListener('touchend', onTouchEnd);
      container.removeEventListener('touchcancel', onTouchEnd);
    };
  }, []);

  return { containerRef, pullDistance, refreshing };
}
