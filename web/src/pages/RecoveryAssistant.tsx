import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import type { PlatformResource } from "@shared/types";

interface Step {
  id: string;
  icon: string;
  title: string;
  why: string;
  how: string[];
}

const STEPS: Step[] = [
  {
    id: "email",
    icon: "📧",
    title: "Step 1 — Secure your email first",
    why: "Your email is the master key to account recovery. If an attacker controls it, they can reset everything else.",
    how: [
      "Change your email password immediately from a device you trust.",
      "Check recovery email and phone settings on the email account itself.",
      "Review recent forwards, filters and connected apps for signs of tampering.",
      "Enable multi-factor authentication on the email account.",
    ],
  },
  {
    id: "phone",
    icon: "📱",
    title: "Step 2 — Secure phone access",
    why: "SIM-swap and lost-number scenarios block SMS recovery codes.",
    how: [
      "Contact your mobile carrier to check for SIM changes or swaps.",
      "Regain access to your number or set a new one with your carrier PIN.",
      "Update the recovery phone number once you have access again.",
    ],
  },
  {
    id: "notifications",
    icon: "🔔",
    title: "Step 3 — Check recent security notifications",
    why: "Platforms email security alerts that show exactly when and how access changed.",
    how: [
      "Search your email for security alerts from the platform.",
      "Note timestamps, IP addresses and devices mentioned in those alerts.",
      "Preserve those emails — they become evidence in your case.",
    ],
  },
  {
    id: "evidence",
    icon: "📸",
    title: "Step 4 — Preserve evidence",
    why: "Recovery requests and possible appeals are stronger with documented facts.",
    how: [
      "Screenshot every error message and status page.",
      "Save notification emails and alerts as files.",
      "Upload them to your recovery case as evidence.",
      "Record a timeline of what you observed and when.",
    ],
  },
  {
    id: "official",
    icon: "🏛️",
    title: "Step 5 — Use the official platform recovery process",
    why: "Only the platform itself can restore access. No third party can.",
    how: [
      "Use the platform's official account-recovery page (linked below).",
      "Follow the prompts exactly — try each recovery option offered.",
      "Never pay anyone who claims they can recover your account.",
    ],
  },
  {
    id: "identity",
    icon: "🪪",
    title: "Step 6 — Complete identity verification if requested",
    why: "Some platforms accept government-ID verification for recovery. Submit only through the platform's official flow.",
    how: [
      "Only upload identity documents through the platform's own official verification page.",
      "Never send ID copies to individuals, DMs, or Telegram/WhatsApp contacts.",
      "Keep a record of what you submitted and when.",
    ],
  },
  {
    id: "record",
    icon: "📝",
    title: "Step 7 — Record recovery/reference information",
    why: "Case numbers and reference IDs keep follow-ups organized.",
    how: [
      "Save any case or reference number the platform gives you.",
      "Log every support interaction in your DigitalShield case timeline.",
      "Generate a Recovery Package when you need to consolidate everything.",
    ],
  },
  {
    id: "monitor",
    icon: "👁️",
    title: "Step 8 — Monitor the case",
    why: "Recovery can take days or weeks. Keep the documentation current.",
    how: [
      "Check the platform's recovery page periodically for status changes.",
      "Watch your email (including spam) for platform responses.",
      "Add new events to your case timeline as they happen.",
    ],
  },
];

export default function RecoveryAssistant() {
  const [open, setOpen] = useState<string | null>("email");
  const [resources, setResources] = useState<PlatformResource[]>([]);

  useEffect(() => {
    api
      .get<{ resources: PlatformResource[] }>("/api/recovery/resources?platform=facebook")
      .then((r) => setResources(r.resources))
      .catch(() => setResources([]));
  }, []);

  return (
    <>
      <h1>Recovery Assistant</h1>
      <p className="muted" style={{ maxWidth: 720 }}>
        A guided sequence for account emergencies. Every step is based on standard, legitimate
        security practice — DigitalShield has no access to any platform and cannot restore accounts
        itself.
      </p>
      <div className="honesty-note mb">
        <strong>Rule one:</strong> never give your password, authentication code, recovery code, or
        session cookie to anyone claiming they can recover your account. Nobody legitimate will ever
        ask.
      </div>

      <div className="card">
        {STEPS.map((s) => (
          <div key={s.id} style={{ borderBottom: "1px solid var(--line-2)" }}>
            <button
              className="row between"
              style={{
                width: "100%",
                background: "none",
                border: "none",
                padding: "14px 0",
                cursor: "pointer",
                font: "inherit",
                textAlign: "left",
              }}
              aria-expanded={open === s.id}
              onClick={() => setOpen(open === s.id ? null : s.id)}
            >
              <strong>
                <span aria-hidden="true">{s.icon}</span> {s.title}
              </strong>
              <span aria-hidden="true">{open === s.id ? "−" : "+"}</span>
            </button>
            {open === s.id ? (
              <div style={{ paddingBottom: 16 }}>
                <p className="muted small">{s.why}</p>
                <ul className="small" style={{ lineHeight: 1.9, paddingLeft: 20, margin: 0 }}>
                  {s.how.map((h) => (
                    <li key={h}>{h}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        ))}
      </div>

      <div className="card">
        <h2>Official Facebook recovery resources</h2>
        <div className="sub">Maintained and re-verified by administrators — updated without app redeploys.</div>
        {resources.map((r) => (
          <div className="resource-item" key={r.id}>
            <a href={r.url} target="_blank" rel="noreferrer">
              <strong>{r.title}</strong>
            </a>
            <div className="small muted">{r.purpose}</div>
          </div>
        ))}
      </div>

      <div className="card">
        <h2>Keep your own records too</h2>
        <p className="muted small">
          Documenting what happened protects you beyond a single recovery attempt — it creates a
          timeline you can reuse for support requests, disputes, or insurance.
        </p>
        <div className="row">
          <Link className="btn" to="/recovery/emergency">
            🚨 Start an emergency case
          </Link>
          <Link className="btn secondary" to="/security/scam-shield">
            Check a suspicious message
          </Link>
        </div>
      </div>
    </>
  );
}
