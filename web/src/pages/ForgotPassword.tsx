import type { FormEvent } from "react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { api, errorMessage } from "../lib/api";
import { Alert, Field } from "../components/ui";
import { ShieldMark } from "../App";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [devLink, setDevLink] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await api.post<{ devResetUrl?: string }>("/api/auth/password/forgot", { email });
      setSent(true);
      if (res.devResetUrl) setDevLink(res.devResetUrl);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <Link to="/" className="brand-row">
          <ShieldMark /> DigitalShield
        </Link>
        <h1>Reset your password</h1>
        {sent ? (
          <>
            <Alert tone="success">
              If an account exists for that email, a reset link has been sent. It expires in 1 hour.
            </Alert>
            {devLink ? (
              <Alert tone="info">
                Development mode: <a href={devLink}>open the reset link</a>
              </Alert>
            ) : null}
            <Link className="btn secondary block" to="/login">
              Back to sign in
            </Link>
          </>
        ) : (
          <>
            <p className="muted small">
              Enter your account email and we'll send a single-use reset link.
            </p>
            {error ? <Alert tone="error">{error}</Alert> : null}
            <form onSubmit={onSubmit} noValidate>
              <Field label="Email address" htmlFor="email">
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </Field>
              <button className="btn block" disabled={busy} type="submit">
                {busy ? "Sending…" : "Send reset link"}
              </button>
            </form>
            <p className="small muted mt">
              Remembered it? <Link to="/login">Sign in</Link>
            </p>
          </>
        )}
      </div>
    </div>
  );
}
