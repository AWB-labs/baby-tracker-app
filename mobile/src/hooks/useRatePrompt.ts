import { useCallback, useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * When the app first saw this device. Written once, on the first run that
 * finds it missing, so "how long have they had this" survives sign-outs and
 * account switches the way an install date should.
 */
const FIRST_SEEN_KEY = "babytracker_first_seen_at";
/** ISO timestamp of the last time the sheet was actually put on screen. */
const LAST_ASKED_KEY = "babytracker_rate_last_asked";
/** Set once someone taps through to the App Store. Never asked again after. */
const RATED_KEY = "babytracker_rate_done";

const DAY_MS = 86_400_000;

/**
 * Don't ask a family that has just arrived. Five days in with real history
 * behind them is roughly "this stuck", which is the moment Apple's own
 * guidance points at — ask when someone is likely to feel good about the app,
 * not the first time they open it.
 */
const MIN_DAYS_INSTALLED = 5;
/**
 * Entries logged before it's worth asking. Read off Home's already-fetched
 * page rather than counted server-side: it is capped at HOME_FETCH_LIMIT (50),
 * so this threshold has to stay comfortably under that cap or it could never
 * be reached by a family whose history has scrolled past it.
 */
const MIN_ENTRIES = 15;
/**
 * Leave it alone for a season after each ask. Apple allows three prompts a
 * year through its own API; this is the same restraint applied to ours, and
 * it means someone who dismisses it isn't nagged next week.
 */
const ASK_AGAIN_AFTER_DAYS = 90;

export interface UseRatePromptResult {
  /** True when every condition is met and the sheet should be on screen. */
  visible: boolean;
  /** Dismissed without acting — resets the 90-day clock. */
  dismiss: () => void;
  /** They went to the App Store. Never ask again. */
  markRated: () => void;
}

/**
 * Decides whether the rating sheet should appear, and remembers the answer.
 *
 * Everything lives in AsyncStorage rather than on the server: this is a
 * per-device nudge, and a family with two phones being asked once each is
 * the behaviour people expect from an app-rating prompt.
 *
 * `entryCount` is whatever the caller already knows about how much has been
 * logged; passing 0 simply means the gate is never met, which is the right
 * behaviour while Home is still loading.
 */
export function useRatePrompt(entryCount: number): UseRatePromptResult {
  const [visible, setVisible] = useState(false);
  /** Guards against re-showing after a dismissal within the same session. */
  const [settled, setSettled] = useState(false);

  useEffect(() => {
    if (settled || visible) return;
    if (entryCount < MIN_ENTRIES) return;

    let cancelled = false;

    (async () => {
      try {
        const [rated, lastAsked, firstSeen] = await Promise.all([
          AsyncStorage.getItem(RATED_KEY),
          AsyncStorage.getItem(LAST_ASKED_KEY),
          AsyncStorage.getItem(FIRST_SEEN_KEY),
        ]);
        if (cancelled) return;
        if (rated) return;

        const now = Date.now();

        // First run on this device: start the clock and ask no sooner than
        // MIN_DAYS_INSTALLED from now, however much history already synced
        // down from another device.
        if (!firstSeen) {
          await AsyncStorage.setItem(FIRST_SEEN_KEY, new Date(now).toISOString());
          return;
        }

        const installedMs = now - new Date(firstSeen).getTime();
        if (!(installedMs >= MIN_DAYS_INSTALLED * DAY_MS)) return;

        if (lastAsked) {
          const sinceAsk = now - new Date(lastAsked).getTime();
          if (sinceAsk < ASK_AGAIN_AFTER_DAYS * DAY_MS) return;
        }

        await AsyncStorage.setItem(LAST_ASKED_KEY, new Date(now).toISOString());
        if (!cancelled) setVisible(true);
      } catch {
        // Storage unavailable is not a reason to nag: stay quiet.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [entryCount, settled, visible]);

  const dismiss = useCallback(() => {
    setVisible(false);
    setSettled(true);
  }, []);

  const markRated = useCallback(() => {
    setVisible(false);
    setSettled(true);
    AsyncStorage.setItem(RATED_KEY, new Date().toISOString()).catch(() => {
      // Worst case they're asked again in 90 days, which the last-asked
      // stamp above already bounded.
    });
  }, []);

  return { visible, dismiss, markRated };
}
