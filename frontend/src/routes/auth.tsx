import { createFileRoute, ClientOnly, useNavigate, useSearch, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

export const Route = createFileRoute("/auth")({
  validateSearch: (s: Record<string, unknown>) => ({
    redirect: typeof s.redirect === "string" ? s.redirect : "/",
    mode: s.mode === "signup" ? "signup" : ("signin" as "signin" | "signup"),
  }),
  head: () => ({
    meta: [
      { title: "Sign in — VANTA AI" },
      { name: "description", content: "Sign in or create your VANTA AI account to access the cinematic AI video studio." },
    ],
  }),
  component: () => (
    <ClientOnly fallback={<div style={{ minHeight: "100vh", background: "#06060c" }} />}>
      <AuthPage />
    </ClientOnly>
  ),
});

function AuthPage() {
  const { redirect, mode: initialMode } = useSearch({ from: "/auth" });
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const [mode, setMode] = useState<"signin" | "signup">(initialMode);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  // If already signed in, bounce to redirect target
  const isDummy = import.meta.env.VITE_SUPABASE_URL?.includes('dummy') || !import.meta.env.VITE_SUPABASE_URL;

  // If already signed in, bounce to redirect target
  useEffect(() => {
    if (!authLoading && user) {
      navigate({ to: redirect || "/" });
    }
  }, [user, authLoading, redirect, navigate]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (isDummy) {
        toast.success("Welcome (Mock Mode)");
        navigate({ to: redirect || "/" });
        return;
      }
      if (mode === "signup") {
        if (name.trim().length < 2) throw new Error("Please enter your full name");
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/`,
            data: { full_name: name.trim() },
          },
        });
        if (error) throw error;
        toast.success("Account created. Check your email to confirm, then sign in.");
        setMode("signin");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast.success("Welcome back");
        navigate({ to: redirect || "/" });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Something went wrong";
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  };

  const onGoogle = async () => {
    setBusy(true);
    try {
      if (isDummy) {
        toast.success("Welcome (Mock Mode)");
        navigate({ to: redirect || "/" });
        return;
      }
      const result = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: window.location.origin + (redirect || "/"),
      });
      if (result.error) throw result.error;
      if (result.redirected) return;
      navigate({ to: redirect || "/" });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Google sign-in failed";
      toast.error(msg);
      setBusy(false);
    }
  };

  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-[#06060c] text-white">
      {/* Background atmosphere matching landing */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(139,92,246,0.18),transparent_50%),radial-gradient(ellipse_at_bottom,rgba(34,211,238,0.10),transparent_60%)]" />
      <div className="absolute inset-0 vanta-page-grain opacity-40" />

      <div className="relative z-10 flex min-h-screen items-center justify-center px-6 py-16">
        <div className="w-full max-w-md">
          <Link to="/" className="mb-8 flex items-center gap-2">
            <div className="h-7 w-7 rounded-lg bg-gradient-to-br from-violet-500 via-fuchsia-500 to-cyan-400 shadow-[0_0_30px_-5px_rgba(139,92,246,0.6)]" />
            <span className="text-white font-semibold tracking-tight text-lg">
              VANTA<span className="text-violet-400"> AI</span>
            </span>
          </Link>

          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-7 backdrop-blur-xl shadow-[0_30px_80px_-20px_rgba(0,0,0,0.6)]">
            <div className="mb-6">
              <h1 className="text-2xl font-semibold tracking-tight">
                {mode === "signup" ? "Create your account" : "Welcome back"}
              </h1>
              <p className="mt-1 text-sm text-white/60">
                {mode === "signup"
                  ? "Sign up to unlock the cinematic AI video studio."
                  : "Sign in to continue to VANTA AI."}
              </p>
            </div>

            <button
              type="button"
              onClick={onGoogle}
              disabled={busy}
              className="mb-4 flex w-full items-center justify-center gap-3 rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-sm font-medium hover:bg-white/10 transition disabled:opacity-50"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
                <path fill="#EA4335" d="M12 10.2v3.9h5.5c-.2 1.4-1.6 4.1-5.5 4.1-3.3 0-6-2.7-6-6.2s2.7-6.2 6-6.2c1.9 0 3.2.8 3.9 1.5l2.7-2.6C16.9 3.1 14.7 2 12 2 6.9 2 2.8 6.1 2.8 11s4.1 9 9.2 9c5.3 0 8.8-3.7 8.8-9 0-.6-.1-1.1-.2-1.6H12z"/>
              </svg>
              Continue with Google
            </button>

            <div className="my-4 flex items-center gap-3 text-xs text-white/40">
              <div className="h-px flex-1 bg-white/10" /> or <div className="h-px flex-1 bg-white/10" />
            </div>

            <form onSubmit={onSubmit} className="space-y-3">
              {mode === "signup" && (
                <div>
                  <label className="text-xs text-white/60">Full name</label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Jane Doe"
                    className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2.5 text-sm placeholder:text-white/30 focus:border-violet-400/60 focus:outline-none"
                  />
                </div>
              )}
              <div>
                <label className="text-xs text-white/60">Email</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@studio.com"
                  className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2.5 text-sm placeholder:text-white/30 focus:border-violet-400/60 focus:outline-none"
                />
              </div>
              <div>
                <label className="text-xs text-white/60">Password</label>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2.5 text-sm placeholder:text-white/30 focus:border-violet-400/60 focus:outline-none"
                />
              </div>

              <button
                type="submit"
                disabled={busy}
                className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-medium text-black hover:bg-white/90 transition disabled:opacity-60"
              >
                {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                {mode === "signup" ? "Create account" : "Sign in"}
              </button>
            </form>

            <p className="mt-5 text-center text-xs text-white/50">
              {mode === "signup" ? (
                <>Already have an account?{" "}
                  <button onClick={() => setMode("signin")} className="text-violet-300 hover:text-violet-200">Sign in</button>
                </>
              ) : (
                <>New to VANTA?{" "}
                  <button onClick={() => setMode("signup")} className="text-violet-300 hover:text-violet-200">Create an account</button>
                </>
              )}
            </p>
          </div>

          <p className="mt-6 text-center text-[11px] text-white/40">
            Your session stays active for 30 days across this device.
          </p>
        </div>
      </div>
    </div>
  );
}
