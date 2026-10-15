import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api, errorMessage } from "../lib/api";
import { Alert, Spinner } from "../components/ui";
import { ShieldMark } from "../App";

export default function VerifyEmail() {
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const [state, setState] = useState<"working" | "done" | "error">("working");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!token) {
      setState("error");
      setMessage("This link is missing its verification token. Request a new link from sign-in.");
      return;
    }
    api
      .post("/api/auth/verify-email", { token })
      .then(() => setState("done"))
      .catch((e) => {
        setState("error");
        setMessage(errorMessage(e));
      });
  }, [token]);

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <Link to="/" className="brand-row">
          <ShieldMark /> DigitalShield
        </Link>
        <h1>Email verification</h1>
        {state === "working" ? <Spinner label="Verifying your email…" /> : null}
        {state === "done" ? (
          <>
            <Alert tone="success">Your email is verified. You can sign in now.</Alert>
            <Link className="btn block" to="/login">
              Sign in
            </Link>
          </>
        ) : null}
        {state === "error" ? (
          <>
            <Alert tone="error">{message}</Alert>
            <Link className="btn secondary block" to="/login">
              Back to sign in
            </Link>
          </>
        ) : null}
      </div>
    </div>
  );
}
