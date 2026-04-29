"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/contexts/auth";

const OAUTH_ERRORS: Record<string, string> = {
  google_denied: "Google sign-in was cancelled.",
  oauth_failed: "Google sign-in failed — please try again.",
  server: "Server error — please try again.",
};

function LoginForm() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState(() => {
    const code = searchParams.get("error");
    return code ? (OAUTH_ERRORS[code] ?? "Something went wrong.") : "";
  });
  const [loading, setLoading] = useState(false);

  // If the user is already authenticated (e.g. session recovered after restart),
  // send them to where they were trying to go, or the dashboard.
  useEffect(() => {
    if (!authLoading && user) {
      const next = searchParams.get("next");
      router.replace(next && next.startsWith("/") ? next : "/dashboard");
    }
  }, [user, authLoading, searchParams, router]);

  useEffect(() => {
    const code = searchParams.get("error");
    if (code) setError(OAUTH_ERRORS[code] ?? "Something went wrong.");
  }, [searchParams]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/magic-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email }),
      });
      if (res.status === 429) {
        setError("Too many requests — please wait a few minutes before trying again.");
        return;
      }
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.detail ?? "Something went wrong, please try again.");
        return;
      }
      setSent(true);
    } catch {
      setError("Network error — please check your connection.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface-0 p-4">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-sm"
      >
        {/* Logo */}
        <div className="text-center mb-8">
          <h1 className="text-2xl font-semibold text-text-1 tracking-tight">Lanara</h1>
          <p className="text-sm text-text-3 mt-1">Revenue Operations Platform</p>
        </div>

        <div className="bg-surface-1 rounded-xl border border-border p-6 shadow-sm">
          <AnimatePresence mode="wait">
            {sent ? (
              <motion.div
                key="sent"
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                className="text-center py-4"
              >
                <div className="text-4xl mb-3">✉️</div>
                <h2 className="font-semibold text-text-1 mb-1">Check your email</h2>
                <p className="text-sm text-text-3">
                  We sent a sign-in link to{" "}
                  <span className="text-text-2 font-medium">{email}</span>.
                  It expires in 15 minutes.
                </p>
                <button
                  onClick={() => { setSent(false); setEmail(""); }}
                  className="mt-4 text-sm text-violet hover:underline"
                >
                  Use a different email
                </button>
              </motion.div>
            ) : (
              <motion.div
                key="form"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
              >
                <h2 className="font-semibold text-text-1 mb-4">Sign in</h2>

                {/* Google OAuth button */}
                <a
                  href="/api/auth/google/authorize"
                  aria-label="Continue with Google"
                  className="flex items-center justify-center w-full rounded-lg border border-border
                             bg-surface-0 py-2.5 transition hover:bg-surface-2 hover:border-text-3
                             active:scale-[0.98]"
                >
                  <GoogleG />
                </a>

                {/* Divider */}
                <div className="flex items-center gap-3 my-4">
                  <div className="flex-1 h-px bg-border" />
                  <span className="text-xs text-text-3">or</span>
                  <div className="flex-1 h-px bg-border" />
                </div>

                {/* Magic link form */}
                <form onSubmit={handleSubmit}>
                  <label className="block text-sm text-text-2 mb-1">Email address</label>
                  <input
                    type="email"
                    required
                    autoFocus
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@company.com"
                    className="w-full rounded-lg border border-border bg-surface-0 px-3 py-2 text-sm
                               text-text-1 placeholder-text-3 focus:outline-none focus:ring-2
                               focus:ring-violet/50 focus:border-violet transition"
                  />

                  {error && (
                    <p className="mt-2 text-xs text-red-400">{error}</p>
                  )}

                  <button
                    type="submit"
                    disabled={loading || !email}
                    className="mt-4 w-full rounded-lg bg-violet px-4 py-2 text-sm font-semibold
                               text-white transition hover:opacity-90 disabled:opacity-50
                               disabled:cursor-not-allowed"
                  >
                    {loading ? "Sending…" : "Send sign-in link"}
                  </button>

                  <p className="mt-4 text-xs text-center text-text-3">
                    We&apos;ll send a magic link — no password needed.
                  </p>
                </form>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  );
}

function GoogleG() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        fill="#EA4335"
      />
    </svg>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
