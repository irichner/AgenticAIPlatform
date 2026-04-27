"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

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
                  We sent a sign-in link to <span className="text-text-2 font-medium">{email}</span>.
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
              <motion.form
                key="form"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                onSubmit={handleSubmit}
              >
                <h2 className="font-semibold text-text-1 mb-4">Sign in</h2>

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
              </motion.form>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  );
}
