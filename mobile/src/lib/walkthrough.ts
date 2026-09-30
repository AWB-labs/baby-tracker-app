import { useSyncExternalStore } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * Bump this when the walkthrough's slides change enough that people who
 * have already seen it should see the new one once. Every version gets its
 * own key, so an older install that saw v1 still gets shown v2 on its first
 * launch after updating, and then never again.
 */
export const WALKTHROUGH_VERSION = 2;
const SEEN_KEY = `babytracker_walkthrough_seen_v${WALKTHROUGH_VERSION}`;

type Seen = boolean | null; // null until storage has been read

let seen: Seen = null;
let loading: Promise<void> | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

function load() {
  if (loading) return loading;
  loading = AsyncStorage.getItem(SEEN_KEY)
    .then((v) => {
      seen = !!v;
    })
    .catch(() => {
      // Storage unavailable: don't hold the app hostage behind a tour, and
      // don't loop it either — treat it as seen for this session.
      seen = true;
    })
    .then(emit);
  return loading;
}

/** They finished (or skipped) it. Remembered per device, like a rating ask. */
export function markWalkthroughSeen() {
  seen = true;
  emit();
  AsyncStorage.setItem(SEEN_KEY, new Date().toISOString()).catch(() => {
    // Worst case it shows once more next launch.
  });
}

/** Account → "See the walkthrough again". */
export function replayWalkthrough() {
  seen = false;
  emit();
  AsyncStorage.removeItem(SEEN_KEY).catch(() => {});
}

function subscribe(l: () => void) {
  listeners.add(l);
  load();
  return () => {
    listeners.delete(l);
  };
}

/**
 * Whether this device still owes the person the walkthrough. `null` while
 * storage is being read — the navigator shows its splash for that beat
 * rather than flashing Home and then covering it.
 */
export function useWalkthroughSeen(): Seen {
  return useSyncExternalStore(
    subscribe,
    () => seen,
    () => seen
  );
}
