import { APP_NAME, TEST_COPY_LINE, testCopy } from "@/lib/config";
import { authConfigured } from "@/lib/auth";
import { connectionString, needsHostedDb } from "@/lib/db";
import { Lockup } from "@/components/Logo";
import { LoginForm } from "./LoginForm";

export const dynamic = "force-dynamic";

export default function LoginPage() {
  const ready = authConfigured();
  return (
    <>
    {testCopy() && (
      <div className="testcopy" role="note">
        {TEST_COPY_LINE}
      </div>
    )}
    <main className="login">
      <div className="login-card">
        <h1 className="brand" aria-label={APP_NAME}>
          <Lockup layout="stacked" />
        </h1>
        {needsHostedDb() ? (
          <p>
            This copy has nowhere to keep your data yet, so it stays locked. On this host it needs a hosted Postgres database: set{" "}
            <b>DATABASE_URL</b> in the host&apos;s environment settings and redeploy.
          </p>
        ) : ready ? (
          <>
            {/* The tagline (DESIGN.md, Brand). */}
            <p className="login-tag">shiny things for eyes and ears</p>
            <p>Sign in to open it.</p>
            <LoginForm />
            {/* A copy on your own machine (the embedded database): say where the password is, never what it is. */}
            {!connectionString() && <p className="login-hint">Running it on your own computer? The password is in .env.local, where the first run wrote it.</p>}
          </>
        ) : (
          <p>
            This copy has no password set, so it stays locked. Set <b>APP_PASSWORD</b> in <b>.env.local</b> (or in your host&apos;s environment
            settings) and restart.
          </p>
        )}
      </div>
    </main>
    </>
  );
}
