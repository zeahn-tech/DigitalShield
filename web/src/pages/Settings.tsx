import type { FormEvent } from "react";
import { useEffect, useState } from "react";
import { api, errorMessage } from "../lib/api";
import type { SessionUser } from "@shared/types";
import { Alert, Field, Spinner } from "../components/ui";

export default function Settings() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api
      .get<{ user: SessionUser }>("/api/me")
      .then((r) => setUser(r.user))
      .catch((e) => setError(errorMessage(e)));
  }, []);

  const changePassword = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      // Password change reuses the reset flow with a fresh email link for safety.
      await api.post("/api/auth/password/forgot", { email: user?.email });
      setNotice("We sent a password change link to your email. Using it signs out all other sessions.");
      setPw("");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  if (!user && !error) return <Spinner label="Loading settings…" />;

  return (
    <>
      <h1>Settings</h1>

      {error ? <Alert tone="error">{error}</Alert> : null}
      {notice ? <Alert tone="success">{notice}</Alert> : null}

      <div className="card">
        <h2>Account</h2>
        <dl className="kv">
          <dt>Email</dt>
          <dd>{user?.email}</dd>
          <dt>Email verified</dt>
          <dd>{user?.emailVerified ? "✅ Verified" : "⚠️ Not verified"}</dd>
          <dt>Account created</dt>
          <dd>{user?.createdAt ? new Date(user.createdAt).toLocaleDateString() : "—"}</dd>
          <dt>Role</dt>
          <dd style={{ textTransform: "capitalize" }}>{user?.role}</dd>
        </dl>
      </div>

      <div className="card">
        <h2>Change password</h2>
        <form onSubmit={changePassword}>
          <p className="muted small">
            For safety, password changes are confirmed through an email link. Changing your password
            signs out every other session.
          </p>
          <Field label="New password" htmlFor="set-pw" help="You'll set the actual password on the secure link we email you.">
            <input id="set-pw" type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} disabled />
          </Field>
          <button className="btn" type="submit" disabled={busy}>
            {busy ? "Sending…" : "Email me a password change link"}
          </button>
        </form>
      </div>

      <div className="card">
        <h2>Multi-factor authentication</h2>
        <p className="muted small">
          MFA enrollment is not available in this build. The data model and session layer already
          support it, and it will arrive in a future release. Until then, use a strong, unique
          password and review your active sessions regularly.
        </p>
      </div>
    </>
  );
}
