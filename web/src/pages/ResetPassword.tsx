import type { FormEvent } from "react";
import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
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

export default function ResetPassword() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await api.post("/api/auth/password/reset", { token, password });
      navigate("/login", { state: { registered: true } });
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
        <h1>Choose a new password</h1>
        {!token ? (
          <Alert tone="error">This reset link is missing its token. Request a new one.</Alert>
        ) : null}
        {error ? <Alert tone="error">{error}</Alert> : null}
        <form onSubmit={onSubmit} noValidate>
          <Field
            label="New password"
            htmlFor="password"
            help="Changing your password signs out all other sessions."
          >
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
          <button className="btn block mt" disabled={busy || !token} type="submit">
            {busy ? "Updating…" : "Set new password"}
          </button>
        </form>
      </div>
    </div>
  );
}
