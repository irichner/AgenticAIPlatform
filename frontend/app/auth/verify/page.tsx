"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export default function VerifyPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const token = searchParams.get("token");
    if (token) {
      // Full browser navigation so the backend can set the httpOnly sid cookie
      window.location.href = `/api/auth/verify?token=${encodeURIComponent(token)}`;
    } else {
      router.replace("/login");
    }
  }, [router, searchParams]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface-0">
      <div className="text-center">
        <div className="w-8 h-8 border-2 border-violet border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-sm text-text-2">Signing you in…</p>
      </div>
    </div>
  );
}
