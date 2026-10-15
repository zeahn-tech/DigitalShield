import type { FormEvent } from "react";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, errorMessage } from "../lib/api";
import { Alert, Field } from "../components/ui";
import { ShieldMark } from "../App";

const RULES = [
  { id: "len", label: "At least 12 characters", test: (p: string) => p.length >= 12 },
  { id: "lower", label: "A lowercase letter", test: (p: string) => /[a-z]/.test(p) },
  { id: "upper", label: "An uppercase letter", test: (p: string) => /[A-Z]/.test(p) },
  { id: "num", label: "A number", test: (p: string) => /[0-9]/.test(p) },
  { id: "sym", label: "A symbol", test: (p: string) => /[^A-Za-z0-9]/.test(p) },
];

export default function Register() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await api.post<{ emailVerificationRequired: boolean; message: string }>(
        "/api/auth/register",
        { email, password },
      );
      setDone(true);
      if (!res.emailVerificationRequired) navigate("/login", { state: { registered: true } });
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
        {done ? (
          <>
            <h1>Check your email</h1>
            <Alert tone="success">
              We sent a verification link to <strong>{email}</strong>. Click it to activate your account,
              then sign in.
            </Alert>
            <Link className="btn block" to="/login">
              Go to sign in
            </Link>
          </>
        ) : (
          <>
            <h1>Create your account</h1>
            <p className="muted small">Start protecting your digital assets today. Free to get started.</p>
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
              <Field label="Password" htmlFor="password" help="Used to sign in to DigitalShield only — never share it with anyone, ever.">
                <input
                  id="password"
                  type="password"
                  autoComplete="new-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </Field>
              <ul className="pw-rules" aria-label="Password requirements">
                {RULES.map((r) => (
                  <li key={r.id} className={r.test(password) ? "ok" : ""}>
                    {r.test(password) ? "✓" : "○"} {r.label}
                  </li>
                ))}
              </ul>
              <button className="btn block mt" disabled={busy} type="submit">
                {busy ? "Creating account…" : "Create account"}
              </button>
            </form>
            <p className="small muted mt">
              Already have an account? <Link to="/login">Sign in</Link>
            </p>
          </>
        )}
      </div>
    </div>
  );
}
