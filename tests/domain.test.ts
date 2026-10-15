import { describe, it, expect } from "vitest";
import { computeReadiness, type ReadinessInput } from "../api/src/lib/readiness";
import { caseNumber } from "../api/src/lib/caseNumber";
import { analyzeMessage } from "../api/src/security/scam";

describe("readiness scoring", () => {
  const base: ReadinessInput = {
    hasIdentity: false,
    hasProfile: false,
    photoCount: 0,
    videoCount: 0,
    documentCount: 0,
    importantCount: 0,
    evidenceCount: 0,
    hasCase: false,
    lastImportAt: null,
    now: new Date("2026-09-20T00:00:00Z"),
  };

  it("gives 0 for a fresh account", () => {
    const r = computeReadiness(base);
    expect(r.score).toBe(0);
    expect(r.status).toBe("needs_setup");
    expect(r.checklist.every((i) => !i.satisfied)).toBe(true);
  });

  it("weights sum to 100 and every item is explainable", () => {
    const r = computeReadiness({ ...base, hasIdentity: true, hasProfile: true, photoCount: 20, videoCount: 1, evidenceCount: 3, lastImportAt: "2026-09-18T00:00:00Z" });
    expect(r.checklist.reduce((s, i) => s + i.weight, 0)).toBe(100);
    expect(r.checklist.every((i) => i.detail.length > 10)).toBe(true);
  });

  it("rewards a fully prepared account with 'protected'", () => {
    const r = computeReadiness({
      ...base,
      hasIdentity: true,
      hasProfile: true,
      photoCount: 500,
      videoCount: 10,
      documentCount: 5,
      importantCount: 4,
      evidenceCount: 2,
      hasCase: true,
      lastImportAt: "2026-09-19T00:00:00Z",
    });
    expect(r.score).toBe(100);
    expect(r.status).toBe("protected");
  });

  it("treats stale backups as unsatisfied", () => {
    const r = computeReadiness({
      ...base,
      hasIdentity: true,
      hasProfile: true,
      photoCount: 100,
      videoCount: 3,
      evidenceCount: 1,
      lastImportAt: "2026-07-01T00:00:00Z", // > 30 days before now
    });
    const recent = r.checklist.find((i) => i.id === "recent_backup")!;
    expect(recent.satisfied).toBe(false);
    expect(r.score).toBeLessThan(100);
  });

  it("shows emergency status when a case is open", () => {
    const r = computeReadiness({ ...base, hasIdentity: true }, true);
    expect(r.status).toBe("emergency");
  });
});

describe("case numbers", () => {
  it("formats DS-<CODE>-<YEAR>-<SEQ>", () => {
    expect(caseNumber("facebook", 2026, 184)).toBe("DS-FB-2026-000184");
    expect(caseNumber("facebook", 2026, 1)).toBe("DS-FB-2026-000001");
  });
  it("falls back for unknown platforms", () => {
    expect(caseNumber("mastodon", 2026, 12)).toBe("DS-MA-2026-000012");
  });
});

describe("scam analyzer", () => {
  it("flags password requests", () => {
    const r = analyzeMessage("Please reply with your password so we can restore your account.");
    const pw = r.indicators.find((i) => i.id === "asks_password")!;
    expect(pw.matched).toBe(true);
    expect(r.riskLevel).not.toBe("low");
  });

  it("flags OTP + guaranteed recovery combos as high risk", () => {
    const r = analyzeMessage(
      "I'm from Facebook support team, we guarantee recovery. Send me the OTP code from your authenticator app immediately.",
    );
    expect(r.indicators.find((i) => i.id === "asks_otp")!.matched).toBe(true);
    expect(r.indicators.find((i) => i.id === "guarantees_recovery")!.matched).toBe(true);
    expect(r.riskLevel).toBe("high");
  });

  it("flags crypto payment demands", () => {
    const r = analyzeMessage("Pay 0.05 BTC as a verification fee before we start.");
    expect(r.indicators.find((i) => i.id === "asks_payment")!.matched).toBe(true);
  });

  it("flags remote access requests", () => {
    const r = analyzeMessage("Install AnyDesk so I can access your device and fix the account.");
    expect(r.indicators.find((i) => i.id === "asks_remote_access")!.matched).toBe(true);
  });

  it("stays neutral on ordinary messages and always includes a disclaimer", () => {
    const r = analyzeMessage("Hi, how do I download my Facebook data archive?");
    expect(r.riskLevel).toBe("low");
    expect(r.indicators.some((i) => i.matched)).toBe(false);
    expect(r.disclaimer).toMatch(/official platform recovery channels/i);
  });

  it("never claims certainty", () => {
    const r = analyzeMessage("send your password now, guaranteed recovery 100%");
    expect(r.disclaimer).not.toMatch(/\b(is|definitely) a scam\b/i);
    expect(r.disclaimer).toMatch(/not a verdict/i);
  });
});
