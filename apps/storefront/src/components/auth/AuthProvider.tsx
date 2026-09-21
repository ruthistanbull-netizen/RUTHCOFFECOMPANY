"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Session, User } from "@supabase/supabase-js";
import { getSupabaseBrowser } from "@/lib/supabaseBrowser";

type AuthContextValue = {
  user: User | null;
  session: Session | null;
  isLoading: boolean;
  isLoggedIn: boolean;
  signOut: () => Promise<void>;
  refreshSession: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function safeBrowserClient() {
  try {
    return getSupabaseBrowser();
  } catch (error) {
    console.error(
      "Supabase tarayıcı istemcisi başlatılamadı. Site misafir modunda çalışacak:",
      error,
    );
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refreshSession = useCallback(async () => {
    const supabase = safeBrowserClient();
    if (!supabase) {
      setSession(null);
      setIsLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase.auth.getSession();
      if (error) throw error;
      setSession(data.session || null);
    } catch (error) {
      console.error("Oturum okunamadı; misafir oturumu kullanılacak:", error);
      setSession(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const supabase = safeBrowserClient();
    if (!supabase) {
      setSession(null);
      setIsLoading(false);
      return;
    }

    let active = true;

    supabase.auth
      .getSession()
      .then(({ data, error }) => {
        if (!active) return;
        if (error) throw error;
        setSession(data.session || null);
      })
      .catch((error) => {
        if (!active) return;
        console.error("Oturum başlatılamadı; misafir oturumu kullanılacak:", error);
        setSession(null);
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!active) return;
      setSession(nextSession || null);
      window.dispatchEvent(new Event("ruth-account-change"));
    });

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  const signOut = useCallback(async () => {
    const supabase = safeBrowserClient();
    if (supabase) {
      try {
        await supabase.auth.signOut();
      } catch (error) {
        console.error("Oturum kapatılamadı:", error);
      }
    }
    setSession(null);
    window.dispatchEvent(new Event("ruth-account-change"));
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user: session?.user || null,
      session,
      isLoading,
      isLoggedIn: Boolean(session?.user),
      signOut,
      refreshSession,
    }),
    [isLoading, refreshSession, session, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth AuthProvider içinde kullanılmalı.");
  return value;
}
