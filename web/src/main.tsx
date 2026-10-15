import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { AuthProvider } from "./lib/auth";
import { ErrorBoundary } from "./components/ErrorBoundary";
import "./styles.css";

// GitHub Pages serves project sites under a subpath (e.g. /DigitalShield/).
// The Pages workflow sets VITE_ROUTER_BASE so client-side routing matches the
// hosting base; local deploys/dev default to "/".
const routerBase: string =
  (import.meta.env as Record<string, string | undefined>).VITE_ROUTER_BASE ?? "/";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      <BrowserRouter basename={routerBase}>
        <AuthProvider>
          <App />
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  </StrictMode>,
);
