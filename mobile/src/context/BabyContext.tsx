import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
} from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { Baby } from "../api/auth";
import { getMe } from "../api/auth";
import { createBaby } from "../api/babies";
import { useAuth } from "./AuthContext";

interface BabyContextValue {
  babies: Baby[];
  activeBaby: Baby | null;
  setActiveBaby: (baby: Baby) => Promise<void>;
  addBaby: (data: {
    name: string;
    gender: "girl" | "boy";
    dob?: string | null;
  }) => Promise<Baby>;
  refreshBabies: () => Promise<void>;
  loading: boolean;
}

export const BabyContext = createContext<BabyContextValue | null>(null);

/** Last known baby list, so a returning user doesn't wait on the network. */
const CACHE_KEY = "babytracker_babies";

export function BabyProvider({ children }: { children: React.ReactNode }) {
  const { token, loading: authLoading } = useAuth();
  const [babies, setBabies] = useState<Baby[]>([]);
  const [activeBaby, setActiveBabyState] = useState<Baby | null>(null);
  /**
   * The token whose babies `babies` actually describes.
   *
   * Load-bearing: the alternative — a boolean flipped from an effect — leaves
   * one render where a signed-in account still shows the empty initial list,
   * and the navigator reads that as "no babies yet" and flashes the Add-a-baby
   * screen before Home. Comparing against the live token is decided during
   * render, so that frame can't happen.
   */
  const [loadedFor, setLoadedFor] = useState<string | null>(null);

  const loading = token ? loadedFor !== token : false;

  const pickActive = useCallback(async (list: Baby[]) => {
    const savedId = await AsyncStorage.getItem("babytracker_activeBabyId");
    const saved = savedId ? list.find((b) => b.id === Number(savedId)) : null;
    setActiveBabyState(saved ?? list[0] ?? null);
  }, []);

  const refreshBabies = useCallback(async () => {
    if (!token) return;
    try {
      const me = await getMe();
      setBabies(me.babies);
      await pickActive(me.babies);
      AsyncStorage.setItem(CACHE_KEY, JSON.stringify(me.babies)).catch(() => {});
      setLoadedFor(token);
    } catch {
      // Offline or a hiccup. Whatever the cache gave us stays on screen; we
      // still stop blocking, because a splash that never resolves is worse than
      // a list that's briefly stale.
      setLoadedFor(token);
    }
  }, [token, pickActive]);

  useEffect(() => {
    let cancelled = false;

    // Auth hasn't finished rehydrating, so there is nothing to decide yet.
    if (authLoading) return;

    if (!token) {
      setBabies([]);
      setActiveBabyState(null);
      setLoadedFor(null);
      AsyncStorage.removeItem(CACHE_KEY).catch(() => {});
      return;
    }

    (async () => {
      // Paint from cache first: a returning user lands straight on Home while
      // the server call settles behind them.
      try {
        const raw = await AsyncStorage.getItem(CACHE_KEY);
        if (raw && !cancelled) {
          const cached = JSON.parse(raw);
          if (Array.isArray(cached) && cached.length > 0) {
            setBabies(cached);
            await pickActive(cached);
            setLoadedFor(token);
          }
        }
      } catch {
        // A corrupt cache is not worth failing over.
      }
      if (!cancelled) await refreshBabies();
    })();

    return () => {
      cancelled = true;
    };
    // refreshBabies is deliberately excluded: it changes whenever the baby list
    // does, and re-running this on every change would re-read the cache mid-use.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, authLoading, pickActive]);

  const setActiveBaby = useCallback(async (baby: Baby) => {
    setActiveBabyState(baby);
    await AsyncStorage.setItem("babytracker_activeBabyId", String(baby.id));
  }, []);

  const addBaby = useCallback(
    async (data: { name: string; gender: "girl" | "boy"; dob?: string | null }) => {
      const baby = await createBaby(data);
      setBabies((prev) => {
        const next = [...prev, baby];
        AsyncStorage.setItem(CACHE_KEY, JSON.stringify(next)).catch(() => {});
        return next;
      });
      return baby;
    },
    []
  );

  return (
    <BabyContext.Provider
      value={{ babies, activeBaby, setActiveBaby, addBaby, refreshBabies, loading }}
    >
      {children}
    </BabyContext.Provider>
  );
}

export function useBaby(): BabyContextValue {
  const ctx = useContext(BabyContext);
  if (!ctx) throw new Error("useBaby must be used inside BabyProvider");
  return ctx;
}
