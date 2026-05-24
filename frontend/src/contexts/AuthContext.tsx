import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  session: null,
  loading: true,
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(() => {
    // Default to a mock session for local development
    return {
      access_token: "mock-token",
      refresh_token: "mock-refresh",
      expires_in: 3600,
      token_type: "bearer",
      user: {
        id: "test-user",
        email: "test-user@vanta.ai",
        created_at: new Date().toISOString(),
        aud: "authenticated",
        role: "authenticated",
        app_metadata: {},
        user_metadata: { full_name: "Test User" },
      } as any
    };
  });
  const [loading, setLoading] = useState(false);

  const isDummy = import.meta.env.VITE_SUPABASE_URL?.includes('dummyprojecturl');

  useEffect(() => {
    if (isDummy) {
      setLoading(false);
      return;
    }

    try {
      // Set up listener FIRST, then check existing session
      const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
        if (s) {
          setSession(s);
        } else {
          setSession(null);
        }
        setLoading(false);
      });
      supabase.auth.getSession().then(({ data }) => {
        if (data.session) {
          setSession(data.session);
        }
        setLoading(false);
      }).catch(() => {
        setLoading(false);
      });
      return () => subscription.unsubscribe();
    } catch (e) {
      console.warn("Supabase auth is disabled or misconfigured, using local mock session:", e);
      setLoading(false);
    }
  }, [isDummy]);

  return (
    <AuthContext.Provider
      value={{
        user: session?.user ?? null,
        session,
        loading,
        signOut: async () => {
          if (!isDummy) {
            try {
              await supabase.auth.signOut();
            } catch (e) {
              // ignore
            }
          }
          setSession(null);
        },
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
