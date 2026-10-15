/** Platform registry — extensible adapter identifiers. */

export interface PlatformInfo {
  id: string;
  name: string;
  code: string; // used in case numbers
  supported: boolean; // import support in this build
  importFormats: string[];
  notes: string;
}

export const PLATFORMS: PlatformInfo[] = [
  {
    id: "facebook",
    name: "Facebook",
    code: "FB",
    supported: true,
    importFormats: ["facebook-json-v1", "facebook-html-limited"],
    notes:
      "Import your official 'Download Your Information' archive (JSON recommended). DigitalShield never asks for your Facebook password.",
  },
  {
    id: "instagram",
    name: "Instagram",
    code: "IG",
    supported: false,
    importFormats: [],
    notes: "Instagram import is planned. Use the vault upload for now.",
  },
];

export const PLATFORM_CODES: Record<string, string> = Object.fromEntries(
  PLATFORMS.map((p) => [p.id, p.code]),
);

export function platformOrThrow(id: string): PlatformInfo {
  const p = PLATFORMS.find((x) => x.id === id);
  if (!p) throw new Error(`Unknown platform: ${id}`);
  return p;
}
