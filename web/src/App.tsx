import { useEffect, useState } from "react";
import { NavLink, Navigate, Route, Routes, useLocation, Link } from "react-router-dom";
import { useAuth } from "./lib/auth";
import { Spinner } from "./components/ui";
import Landing from "./pages/Landing";
import Register from "./pages/Register";
import Login from "./pages/Login";
import VerifyEmail from "./pages/VerifyEmail";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import Dashboard from "./pages/Dashboard";
import Vault from "./pages/Vault";
import ImportData from "./pages/ImportData";
import RecoveryList from "./pages/RecoveryList";
import Emergency from "./pages/Emergency";
import CaseDetail from "./pages/CaseDetail";
import RecoveryAssistant from "./pages/RecoveryAssistant";
import Security from "./pages/Security";
import ScamShield from "./pages/ScamShield";
import Privacy from "./pages/Privacy";
import Settings from "./pages/Settings";
import Admin from "./pages/Admin";
import NotFound from "./pages/NotFound";

function Protected({ children }: { children: JSX.Element }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) {
    return (
      <div className="auth-wrap">
        <Spinner label="Checking your session…" />
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return children;
}

const NAV = [
  { to: "/dashboard", label: "Dashboard", icon: "🏠" },
  { to: "/vault", label: "Vault", icon: "🗃️" },
  { to: "/import", label: "Import Data", icon: "📥" },
  { section: "Recovery" },
  { to: "/recovery", label: "My Cases", icon: "📁" },
  { to: "/recovery/assistant", label: "Recovery Assistant", icon: "🧭" },
  { section: "Security" },
  { to: "/security", label: "Security Status", icon: "🛡️" },
  { to: "/security/scam-shield", label: "Scam Shield", icon: "⚠️" },
  { section: "Privacy" },
  { to: "/privacy", label: "Privacy & Data", icon: "🔒" },
  { to: "/settings", label: "Settings", icon: "⚙️" },
];

function Shell({ children }: { children: JSX.Element }) {
  const { user, setUser } = useAuth();
  const location = useLocation();
  const [navOpen, setNavOpen] = useState(false);

  useEffect(() => {
    setNavOpen(false);
  }, [location.pathname]);

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>
      <div className="app-body">
        {navOpen ? <div className="scrim" onClick={() => setNavOpen(false)} /> : null}
        <aside className={`sidebar ${navOpen ? "open" : ""}`} aria-label="Primary navigation">
          <Link to="/dashboard" className="brand">
            <ShieldMark /> DigitalShield
          </Link>
          <nav>
            {NAV.map((item, i) =>
              "section" in item ? (
                <div key={`s${i}`} className="nav-section">
                  {item.section}
                </div>
              ) : (
                <NavLink key={item.to} to={item.to!} className={({ isActive }) => (isActive ? "active" : "")}>
                  <span aria-hidden="true">{item.icon}</span> {item.label}
                </NavLink>
              ),
            )}
            {user?.role === "admin" ? (
              <NavLink to="/admin" className={({ isActive }) => (isActive ? "active" : "")}>
                <span aria-hidden="true">🛠️</span> Admin
              </NavLink>
            ) : null}
          </nav>
          <div className="emergency-link" style={{ padding: "12px" }}>
            <Link to="/recovery/emergency">
              <span aria-hidden="true">🚨</span> Account Emergency
            </Link>
          </div>
        </aside>
        <div className="main">
          <header className="topbar">
            <div className="row">
              <button
                className="mobile-nav-toggle"
                aria-label={navOpen ? "Close menu" : "Open menu"}
                aria-expanded={navOpen}
                onClick={() => setNavOpen(!navOpen)}
              >
                ☰
              </button>
              <strong>DigitalShield</strong>
            </div>
            <div className="row">
              <span className="whoami">{user?.email}</span>
              <button
                className="btn secondary sm"
                onClick={async () => {
                  try {
                    await fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" });
                  } finally {
                    setUser(null);
                    window.location.href = "/";
                  }
                }}
              >
                Sign out
              </button>
            </div>
          </header>
          <main id="main-content" className="content">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}

export function ShieldMark({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <path fill="currentColor" d="M16 2 4 7v9c0 7.5 5.1 12.4 12 14 6.9-1.6 12-6.5 12-14V7L16 2z" />
      <path fill="#fff" d="m14.5 20.5-4-4 1.8-1.8 2.2 2.2 6-6L22.3 13l-7.8 7.5z" />
    </svg>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/register" element={<Register />} />
      <Route path="/login" element={<Login />} />
      <Route path="/verify-email" element={<VerifyEmail />} />
      <Route path="/forgot" element={<ForgotPassword />} />
      <Route path="/reset" element={<ResetPassword />} />
      <Route
        path="/dashboard"
        element={
          <Protected>
            <Shell>
              <Dashboard />
            </Shell>
          </Protected>
        }
      />
      <Route
        path="/vault"
        element={
          <Protected>
            <Shell>
              <Vault />
            </Shell>
          </Protected>
        }
      />
      <Route
        path="/import"
        element={
          <Protected>
            <Shell>
              <ImportData />
            </Shell>
          </Protected>
        }
      />
      <Route
        path="/recovery"
        element={
          <Protected>
            <Shell>
              <RecoveryList />
            </Shell>
          </Protected>
        }
      />
      <Route
        path="/recovery/emergency"
        element={
          <Protected>
            <Shell>
              <Emergency />
            </Shell>
          </Protected>
        }
      />
      <Route
        path="/recovery/assistant"
        element={
          <Protected>
            <Shell>
              <RecoveryAssistant />
            </Shell>
          </Protected>
        }
      />
      <Route
        path="/recovery/case/:id"
        element={
          <Protected>
            <Shell>
              <CaseDetail />
            </Shell>
          </Protected>
        }
      />
      <Route
        path="/security"
        element={
          <Protected>
            <Shell>
              <Security />
            </Shell>
          </Protected>
        }
      />
      <Route
        path="/security/scam-shield"
        element={
          <Protected>
            <Shell>
              <ScamShield />
            </Shell>
          </Protected>
        }
      />
      <Route
        path="/privacy"
        element={
          <Protected>
            <Shell>
              <Privacy />
            </Shell>
          </Protected>
        }
      />
      <Route
        path="/settings"
        element={
          <Protected>
            <Shell>
              <Settings />
            </Shell>
          </Protected>
        }
      />
      <Route
        path="/admin"
        element={
          <Protected>
            <Shell>
              <Admin />
            </Shell>
          </Protected>
        }
      />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
