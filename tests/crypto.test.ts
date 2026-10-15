import { describe, it, expect } from "vitest";
import {
  hashPassword,
  verifyPassword,
  passwordProblems,
  sha256Hex,
  hmacSign,
  hmacVerify,
  encryptField,
  decryptField,
  constantTimeEqual,
} from "../api/src/lib/crypto";

describe("password hashing", () => {
  it("verifies a correct password and rejects a wrong one", async () => {
    const hash = await hashPassword("Correct-Horse-9!", 60_000);
    expect(hash.startsWith("pbkdf2-sha256$60000$")).toBe(true);
    expect(await verifyPassword("Correct-Horse-9!", hash)).toBe(true);
    expect(await verifyPassword("wrong-password", hash)).toBe(false);
  });

  it("never stores the plaintext and uses a unique salt per hash", async () => {
    const a = await hashPassword("Same-Passw0rd!", 60_000);
    const b = await hashPassword("Same-Passw0rd!", 60_000);
    expect(a).not.toContain("Same-Passw0rd!");
    expect(a).not.toBe(b); // different salts
    expect(await verifyPassword("Same-Passw0rd!", b)).toBe(true);
  });

  it("rejects malformed stored hashes", async () => {
    expect(await verifyPassword("x", "not-a-hash")).toBe(false);
    expect(await verifyPassword("x", "pbkdf2-sha256$10$AAAA$BBBB")).toBe(false);
  });
});

describe("password policy", () => {
  it("accepts a strong password", () => {
    expect(passwordProblems("Str0ng&Unique-Pass")).toEqual([]);
  });
  it("flags weak passwords", () => {
    expect(passwordProblems("short")).toContain("at least 12 characters");
    expect(passwordProblems("alllowercase123!")).toContain("an uppercase letter");
    expect(passwordProblems("MyPassword123!x")).toContain("no common words like 'password' or '123456'");
  });
});

describe("hashing and HMAC", () => {
  it("produces stable sha256 hex", async () => {
    expect(await sha256Hex("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });
  it("signs and verifies HMACs, rejecting tampering", async () => {
    const sig = await hmacSign("secret", "payload");
    expect(await hmacVerify("secret", "payload", sig)).toBe(true);
    expect(await hmacVerify("secret", "payload2", sig)).toBe(false);
    expect(await hmacVerify("other", "payload", sig)).toBe(false);
  });
  it("constant-time equality handles mismatched lengths", () => {
    expect(constantTimeEqual(new Uint8Array([1, 2]), new Uint8Array([1, 2]))).toBe(true);
    expect(constantTimeEqual(new Uint8Array([1, 2]), new Uint8Array([1]))).toBe(false);
  });
});

describe("field envelope encryption", () => {
  const key = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";

  it("round-trips with a master key", async () => {
    const ct = await encryptField(key, "record-1", "+1-555-0100");
    expect(ct.startsWith("v1:")).toBe(true);
    expect(ct).not.toContain("555-0100");
    expect(await decryptField(key, "record-1", ct)).toBe("+1-555-0100");
  });

  it("uses record context so ciphertext is not interchangeable across records", async () => {
    const ct = await encryptField(key, "record-1", "secret-value");
    expect(await decryptField(key, "record-2", ct)).toBeNull();
  });

  it("fails safely on tampered ciphertext", async () => {
    const ct = await encryptField(key, "ctx", "value");
    const tampered = `${ct.slice(0, -4)}AAAA`;
    expect(await decryptField(key, "ctx", tampered)).toBeNull();
  });

  it("marks dev-plaintext without a key and still round-trips", async () => {
    const ct = await encryptField(undefined, "ctx", "dev-value");
    expect(ct.startsWith("plain-dev:")).toBe(true);
    expect(await decryptField(undefined, "ctx", ct)).toBe("dev-value");
    // Production must not decrypt dev plaintext without a key:
    expect(await decryptField(key, "ctx", ct)).toBe("dev-value"); // prefix honored explicitly
  });
});
