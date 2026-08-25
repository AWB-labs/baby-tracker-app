import { useEffect, useRef } from "react";
import { AppState, type AppStateStatus } from "react-native";
import { useIsFocused } from "@react-navigation/native";

/**
 * Re-run `callback` on an interval, but only while the screen is actually being
 * looked at.
 *
 * Two conditions gate it:
 *   - the screen is the focused tab (a background tab needs no fresh data)
 *   - the app is in the foreground (a phone in a pocket needs none either)
 *
 * This matters beyond tidiness. Polling is the app's dominant source of network
 * traffic, and the hosting tier bills for outbound bandwidth past a monthly
 * allowance — an unconditional timer quietly burns that allowance all day while
 * nobody is looking at the screen.
 */
export function usePolling(
  callback: () => void,
  intervalMs: number,
  enabled = true
) {
  const isFocused = useIsFocused();
  const savedCallback = useRef(callback);
  // Whether the gating effect below has run before. On the very first run the
  // consumer's own mount fetch is already in flight, so firing again would
  // just double it — but every later run means polling was suspended (tab
  // blurred, hook disabled) and is resuming, and the data on screen is stale
  // by however long that lasted. Without an immediate call there, coming back
  // to the tab waits out a full interval before showing, say, the feed a
  // partner started meanwhile.
  const hasRunRef = useRef(false);

  // Keep the latest callback without restarting the timer on every render.
  useEffect(() => {
    savedCallback.current = callback;
  }, [callback]);

  useEffect(() => {
    if (!enabled || !isFocused) return;
    const resuming = hasRunRef.current;
    hasRunRef.current = true;

    let timer: ReturnType<typeof setInterval> | null = null;

    const start = () => {
      if (timer) return;
      timer = setInterval(() => savedCallback.current(), intervalMs);
    };
    const stop = () => {
      if (!timer) return;
      clearInterval(timer);
      timer = null;
    };

    const handleAppState = (state: AppStateStatus) => {
      if (state === "active") {
        // Coming back from the background, the data on screen is stale by
        // however long we were away — refresh immediately rather than waiting
        // out a full interval.
        savedCallback.current();
        start();
      } else {
        stop();
      }
    };

    if (AppState.currentState === "active") {
      if (resuming) savedCallback.current();
      start();
    }
    const sub = AppState.addEventListener("change", handleAppState);

    return () => {
      stop();
      sub.remove();
    };
  }, [enabled, isFocused, intervalMs]);
}
