import { Link } from "react-router-dom";

export default function NotFound() {
  return (
    <div className="auth-wrap">
      <div className="auth-card" style={{ textAlign: "center" }}>
        <h1>Page not found</h1>
        <p className="muted">That page doesn't exist or has moved.</p>
        <Link className="btn block" to="/">
          Back to home
        </Link>
      </div>
    </div>
  );
}
