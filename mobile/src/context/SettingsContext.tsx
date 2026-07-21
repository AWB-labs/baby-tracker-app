import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
} from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  getSettings,
  updateSettings as updateSettingsRequest,
  type AccountSettings,
  type UnitSystem,
} from "../api/settings";
import { createUnitFormatters, type UnitFormatters } from "../lib/units";
import { useAuth } from "./AuthContext";

const CACHE_KEY = "babytracker_settings";

const DEFAULTS: Pick<
  AccountSettings,
  "unitSystem" | "themeColor" | "notificationsEnabled"
> = {
  unitSystem: "metric",
  themeColor: null,
  notificationsEnabled: true,
};

interface SettingsContextValue {
  settings: AccountSettings | null;
  unitSystem: UnitSystem;
  themeColor: string | null;
  notificationsEnabled: boolean;
  units: UnitFormatters;
  loading: boolean;
  refresh: () => Promise<void>;
  save: (patch: {
    name?: string;
    unitSystem?: UnitSystem;
    themeColor?: string | null;
    notificationsEnabled?: boolean;
  }) => Promise<AccountSettings>;
}

export const SettingsContext = createContext<SettingsContextValue | null>(null);

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const { token } = useAuth();
  const [settings, setSettings] = useState<AccountSettings | null>(null);
  const [loading, setLoading] = useState(true);

  // Settings drive the app's colours and units, so a cold start reads the last
  // known values from disk first — otherwise every launch would flash the
  // default pink theme before the network answers.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const cached = await AsyncStorage.getItem(CACHE_KEY);
        if (cached && !cancelled) setSettings(JSON.parse(cached));
      } catch {
        // ignore
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const refresh = useCallback(async () => {
    if (!token) {
      setSettings(null);
      setLoading(false);
      return;
    }
    try {
      const fresh = await getSettings();
      setSettings(fresh);
      await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(fresh));
    } catch {
      // Keep whatever we already had; a failed refresh must not reset the
      // user's theme and units to the defaults mid-session.
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (token) {
      refresh();
    } else {
      setSettings(null);
      setLoading(false);
      AsyncStorage.removeItem(CACHE_KEY).catch(() => {});
    }
  }, [token, refresh]);

  const save = useCallback(
    async (patch: Parameters<SettingsContextValue["save"]>[0]) => {
      const updated = await updateSettingsRequest(patch);
      setSettings(updated);
      await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(updated)).catch(
        () => {}
      );
      return updated;
    },
    []
  );

  const unitSystem = settings?.unitSystem ?? DEFAULTS.unitSystem;
  const units = useMemo(() => createUnitFormatters(unitSystem), [unitSystem]);

  const value: SettingsContextValue = {
    settings,
    unitSystem,
    themeColor: settings?.themeColor ?? DEFAULTS.themeColor,
    notificationsEnabled:
      settings?.notificationsEnabled ?? DEFAULTS.notificationsEnabled,
    units,
    loading,
    refresh,
    save,
  };

  return (
    <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>
  );
}

export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error("useSettings must be used inside SettingsProvider");
  return ctx;
}

/** Unit formatters on their own — the common case in display components. */
export function useUnits(): UnitFormatters {
  return useSettings().units;
}
