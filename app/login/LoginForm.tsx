"use client";

import { useState } from "react";

export function LoginForm() {
  const [pw, setPw] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: pw }),
      });
      if (res.ok) {
        window.location.href = "/";
        return;
      }
      const d = await res.json().catch(() => ({}));
      setErr(d.error || "Could not sign in.");
    } catch {
      setErr("Could not reach the server.");
    }
    setBusy(false);
  }

  return (
    <form onSubmit={submit} style={{ display: "grid", gap: 12 }}>
      <label className="field">
        <span>Password</span>
        <input className="input" type="password" name="password" autoFocus autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} required />
      </label>
      {err && <div className="err">{err}</div>}
      <button className="btn wide" style={{ minHeight: 48 }} disabled={busy || !pw}>
        {busy ? "Checking…" : "Sign in"}
      </button>
    </form>
  );
}
