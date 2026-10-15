/**
 * Scam-analyzer: matches user-supplied suspicious messages against known
 * account-recovery scam indicators.
 *
 * IMPORTANT: this produces *indicators*, never a verdict. Output always
 * carries a disclaimer; nothing here declares a message a scam with certainty.
 */
import type { ScamCheckResult, ScamIndicator } from "../../../shared/types";

interface IndicatorDef {
  id: string;
  label: string;
  severity: "high" | "medium";
  patterns: RegExp[];
}

const INDICATORS: IndicatorDef[] = [
  {
    id: "asks_password",
    label: "Requests your password",
    severity: "high",
    patterns: [/\b(password|passcode|login credentials)\b.{0,60}\b(send|share|provide|reply|confirm)\b/i, /\b(send|share|provide|reply with)\b.{0,60}\b(your|my|the)\b.{0,20}\b(password|passcode)\b/i],
  },
  {
    id: "asks_otp",
    label: "Requests a one-time code (OTP)",
    severity: "high",
    patterns: [/\b(otp|one[- ]time (code|password|passcode)|verification code|security code|2fa code|authenticator code)\b.{0,80}\b(send|share|provide|reply|enter|confirm)\b/i, /\b(send|share|provide|reply with|enter)\b.{0,40}\b(otp|one[- ]time|verification|security)\b.{0,20}\b(code)\b/i],
  },
  {
    id: "asks_recovery_code",
    label: "Requests a recovery code",
    severity: "high",
    patterns: [/\brecovery code\b.{0,80}\b(send|share|provide|reply)\b/i, /\b(send|share|provide)\b.{0,40}\brecovery code\b/i],
  },
  {
    id: "asks_cookie",
    label: "Requests a session cookie or token",
    severity: "high",
    patterns: [/\b(session cookie|cookie value|access token|session token|session id)\b.{0,80}\b(send|share|provide|paste)\b/i],
  },
  {
    id: "guarantees_recovery",
    label: "Guarantees account recovery",
    severity: "high",
    patterns: [/\b(guarantee|guaranteed|100%)\b.{0,40}\b(recover\w*|restore\w*|unlock\w*|get back)\b/i, /\b(recover\w*|restore\w*|unlock\w*)\b.{0,20}\b(guaranteed|100%)\b/i],
  },
  {
    id: "claims_official",
    label: "Claims to work for the platform",
    severity: "medium",
    patterns: [/\b(i am|i'm|we are|from)\b.{0,30}\b(face ?book|meta|instagram|support team|security team|official)\b/i],
  },
  {
    id: "asks_payment",
    label: "Requests payment, often cryptocurrency",
    severity: "high",
    patterns: [/\b(pay|payment|paying|fee|deposit)\b.{0,60}\b(bitcoin|btc|eth|crypto|usdt|western union|gift card|itunes|steam)\b/i, /\b(bitcoin|btc|ethereum|usdt|gift cards?)\b.{0,60}\b(pay|payment|fee|send)\b/i],
  },
  {
    id: "asks_remote_access",
    label: "Requests remote access to your device",
    severity: "high",
    patterns: [/\b(anydesk|teamviewer|remote desktop|remote access|screen share|install this (app|software))\b/i],
  },
  {
    id: "asks_identity_docs",
    label: "Requests sensitive ID documents over an untrusted channel",
    severity: "medium",
    patterns: [/\b(send|upload|email|whatsapp)\b.{0,50}\b(passport|national id|driver'?s license|id card|bank statement)\b/i],
  },
  {
    id: "urgency_pressure",
    label: "Creates urgency or pressure",
    severity: "medium",
    patterns: [/\b(immediately|urgent|act now|within \d+ (hours|minutes)|last chance|final warning)\b/i],
  },
  {
    id: "off_platform_move",
    label: "Moves the conversation off-platform",
    severity: "medium",
    patterns: [/\b(telegram|whatsapp me|text me|signal|dm me on)\b.{0,60}\b(help|recover|support|assist)\b/i],
  },
];

export function analyzeMessage(message: string): ScamCheckResult {
  const indicators: ScamIndicator[] = INDICATORS.map((def) => ({
    id: def.id,
    label: def.label,
    matched: def.patterns.some((re) => re.test(message)),
    severity: def.severity,
  }));
  const matched = indicators.filter((i) => i.matched);
  const highCount = matched.filter((i) => i.severity === "high").length;
  const riskLevel = highCount >= 2 || matched.length >= 4 ? "high" : matched.length >= 1 ? "elevated" : "low";
  return {
    indicators,
    riskLevel,
    disclaimer:
      "These indicators can be associated with account-recovery scams. This is not a verdict — verify the sender independently and use official platform recovery channels. Never share your password, authentication codes, or recovery codes with anyone.",
  };
}

export const SCAM_SHIELD_RULES = INDICATORS.map((d) => ({ id: d.id, label: d.label, severity: d.severity }));
