import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
} from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { signup, login, deleteAccount as deleteAccountRequest, AccountInfo } from "../api/auth";
import { setUnauthorizedHandler } from "../api/client";

interface AuthState {
  token: string | null;
  account: AccountInfo | null;
  loading: boolean;
}

interface AuthContextValue extends AuthState {
  signUp: (name: string, email: string, password: string) => Promise<number>;
  signIn: (email: string, password: string) => Promise<number>;
  signOut: () => Promise<void>;
  /** Delete the account server-side, then clear everything it left on-device. */
  deleteAccount: (password: string) => Promise<void>;
  /**
   * True for the rest of this app session once signUp() has succeeded, never
   * set by signIn(). The onboarding carousel is gated on this rather than on
   * anything persisted — an existing account logging in on a new device must
   * never see it, only someone who just created one right now.
   */
  justSignedUp: boolean;
  /** Replace the cached account after settings change. */
  setAccount: (account: AccountInfo) => void;
  /**
   * Timestamp of the last rejected token, or null. Auth can't raise a toast
   * itself — the toast layer is themed, and the theme depends on settings which
   * depend on auth. So it publishes the event and a component inside the toast
   * layer reports it.
   */
  sessionExpiredAt: number | null;
  acknowledgeSessionExpiry: () => void;
}

/** Everything auth (or account deletion) leaves on-device; cleared as a set so no path forgets one. */
const AUTH_STORAGE_KEYS = [
  "babytracker_token",
  "babytracker_account",
  "babytracker_activeBabyId",
  "babytracker_settings",
  "babytracker_babies",
  "babytracker_push_token",
];

export const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [sessionExpiredAt, setSessionExpiredAt] = useState<number | null>(null);
  const [justSignedUp, setJustSignedUp] = useState(false);
  const [state, setState] = useState<AuthState>({
    token: null,
    account: null,
    loading: true,
  });

  // Rehydrate token on mount
  useEffect(() => {
    (async () => {
      try {
        const [token, accountJson] = await AsyncStorage.multiGet([
          "babytracker_token",
          "babytracker_account",
        ]);
        const t = token[1];
        const a = accountJson[1] ? JSON.parse(accountJson[1]) : null;
        setState({ token: t, account: a, loading: false });
      } catch {
        setState({ token: null, account: null, loading: false });
      }
    })();
  }, []);

  const persist = async (token: string, account: AccountInfo) => {
    await AsyncStorage.multiSet([
      ["babytracker_token", token],
      ["babytracker_account", JSON.stringify(account)],
    ]);
    setState({ token, account, loading: false });
  };

  const signUp = useCallback(
    async (name: string, email: string, password: string) => {
      const res = await signup(name, email, password);
      await persist(res.token, res.account);
      setJustSignedUp(true);
      return res.claimedInvites ?? 0;
    },
    []
  );

  const signIn = useCallback(async (email: string, password: string) => {
    const res = await login(email, password);
    await persist(res.token, res.account);
    // Defensive: an odd sign-up-then-sign-back-in sequence in one session
    // must not leave a stale flag pointed at whoever's signing in now.
    setJustSignedUp(false);
    return res.claimedInvites ?? 0;
  }, []);

  const signOut = useCallback(async () => {
    await AsyncStorage.multiRemove(AUTH_STORAGE_KEYS);
    setState({ token: null, account: null, loading: false });
  }, []);

  // Delete server-side first, while the token still works — clearing storage
  // up front would make the request go out unauthenticated instead.
  const deleteAccount = useCallback(async (password: string) => {
    await deleteAccountRequest(password);
    await AsyncStorage.multiRemove(AUTH_STORAGE_KEYS);
    setState({ token: null, account: null, loading: false });
  }, []);

  const setAccount = useCallback((account: AccountInfo) => {
    setState((prev) => ({ ...prev, account }));
    AsyncStorage.setItem("babytracker_account", JSON.stringify(account)).catch(
      () => {}
    );
  }, []);

  // A rejected token means the session is over. Clearing it here sends the user
  // to the sign-in screen with an explanation, rather than leaving every screen
  // silently empty.
  useEffect(() => {
    setUnauthorizedHandler(() => {
      setState((prev) => {
        if (!prev.token) return prev;
        AsyncStorage.multiRemove(AUTH_STORAGE_KEYS).catch(() => {});
        setSessionExpiredAt(Date.now());
        return { token: null, account: null, loading: false };
      });
    });
    return () => setUnauthorizedHandler(null);
  }, []);

  const acknowledgeSessionExpiry = useCallback(() => setSessionExpiredAt(null), []);

  return (
    <AuthContext.Provider
      value={{
        ...state,
        signUp,
        signIn,
        signOut,
        deleteAccount,
        justSignedUp,
        setAccount,
        sessionExpiredAt,
        acknowledgeSessionExpiry,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
