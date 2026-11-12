"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { apiRequest, saveSession, type SessionUser } from "../../lib/api";

function LoginForm() {
  const router = useRouter();
  const next = useSearchParams().get("next");
  const [phone, setPhone] = useState("+91");
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await apiRequest<{ access_token: string; user: SessionUser }>("/auth/login", {
        method: "POST",
        body: JSON.stringify({ phone, code, ...(name.trim() ? { name: name.trim() } : {}) }),
      });
      saveSession(res.access_token, res.user);
      router.push(next?.startsWith("/") ? next : "/"); // only same-site paths
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not sign in");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main>
      <h1>Sign in</h1>
      <p className="muted">Demo mode: any Indian number and the code 000000.</p>
      <form onSubmit={submit}>
        <label>Phone<input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" /></label>
        <label>Code<input value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" maxLength={6} /></label>
        <label>Your name (first time only)<input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} /></label>
        {error && <p className="error">{error}</p>}
        <button type="submit" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
      </form>
    </main>
  );
}

export default function LoginPage() {
  return <Suspense><LoginForm /></Suspense>; // useSearchParams needs a Suspense boundary
}
