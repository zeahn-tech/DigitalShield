import type { FormEvent } from "react";
import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { api, errorMessage } from "../lib/api";
import { useAuth } from "../lib/auth";
import { Alert, Field } from "../components/ui";
import { ShieldMark } from "../App";

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const { refresh } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(
    (location.state as { registered?: boolean } | null)?.registered
      ? "Account created. You can sign in now."
      : null,
  );
  const [busy, setBusy] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await api.post("/api/auth/login", { email, password });
      await refresh();
      const from = (location.state as { from?: string } | null)?.from;
      navigate(from && from !== "/login" ? from : "/dashboard", { replace: true });
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
        <h1>Sign in</h1>
        {notice ? <Alert tone="success">{notice}</Alert> : null}
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
          <Field label="Password" htmlFor="password">
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>
          <button className="btn block" disabled={busy} type="submit">
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </form>
        <p className="small muted mt">
          <Link to="/forgot">Forgot your password?</Link>
        </p>
        <p className="small muted">
          New to DigitalShield? <Link to="/register">Create an account</Link>
        </p>
      </div>
    </div>
  );
}
