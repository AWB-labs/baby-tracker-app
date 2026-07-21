import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
} from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { signup, login, AccountInfo } from "../api/auth";
import { setUnauthorizedHandler } from "../api/client";
import { useToast } from "../components/Toast";

interface AuthState {
  token: string | null;
  account: AccountInfo | null;
  loading: boolean;
}

interface AuthContextValue extends AuthState {
  signUp: (name: string, email: string, password: string) => Promise<number>;
  signIn: (email: string, password: string) => Promise<number>;
  signOut: () => Promise<void>;
  /** Replace the cached account after settings change. */
  setAccount: (account: AccountInfo) => void;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const toast = useToast();
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
      return res.claimedInvites ?? 0;
    },
    []
  );

  const signIn = useCallback(async (email: string, password: string) => {
    const res = await login(email, password);
    await persist(res.token, res.account);
    return res.claimedInvites ?? 0;
  }, []);

  const signOut = useCallback(async () => {
    await AsyncStorage.multiRemove([
      "babytracker_token",
      "babytracker_account",
      "babytracker_activeBabyId",
      "babytracker_settings",
    ]);
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
        AsyncStorage.multiRemove([
          "babytracker_token",
          "babytracker_account",
          "babytracker_activeBabyId",
          "babytracker_settings",
        ]).catch(() => {});
        toast.error("Your session has expired. Please sign in again.");
        return { token: null, account: null, loading: false };
      });
    });
    return () => setUnauthorizedHandler(null);
  }, [toast]);

  return (
    <AuthContext.Provider
      value={{ ...state, signUp, signIn, signOut, setAccount }}
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
