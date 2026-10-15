import { describe, it, expect } from "vitest";
import { detectFormat, type IncomingFile } from "../api/src/import/detect";
import { parseFacebookArchive, parseProfile } from "../api/src/import/facebook";
import { normalizeTitle, kindFromFilename } from "../api/src/import/normalize";

function file(path: string, text: string): IncomingFile {
  return { path, name: path.split("/").pop() ?? path, text, size: text.length };
}

describe("format detection", () => {
  it("detects a Facebook JSON archive by known filenames", () => {
    const fmt = detectFormat([
      file("personal_information/personal_information.json", JSON.stringify([{ name: "Name", value: "Jane Doe" }])),
    ]);
    expect(fmt?.formatId).toBe("facebook-json-v1");
    expect(fmt?.platform).toBe("facebook");
  });

  it("detects Facebook posts by structure", () => {
    const posts = [{ title: "Jane Doe", timestamp: 1700000000, data: [{ post: { text: "hello" } }] }];
    const fmt = detectFormat([file("your_facebook_activity/posts/posts_v2.json", JSON.stringify(posts))]);
    expect(fmt?.formatId).toBe("facebook-json-v1");
  });

  it("reports unknown JSON as generic instead of claiming Facebook", () => {
    const fmt = detectFormat([file("data/random.json", JSON.stringify({ foo: 1 }))]);
    expect(fmt?.formatId).toBe("generic-json");
    expect(fmt?.platform).toBe("unknown");
  });

  it("detects HTML Facebook exports", () => {
    const fmt = detectFormat([file("index.html", "<html><head><title>Facebook — Download Your Information</title></head></html>")]);
    expect(fmt?.formatId).toBe("facebook-html-limited");
  });

  it("returns null for unsupported content", () => {
    expect(detectFormat([file("photo.png", "")])).toBeNull();
  });
});

describe("Facebook parser (defensive)", () => {
  it("parses posts_v2 entries", () => {
    const posts = [
      {
        title: "Life update",
        timestamp: 1712345678,
        data: [{ post: { text: "Moved to a new city!", timestamp: 1712345678 } }],
      },
    ];
    const res = parseFacebookArchive([file("posts/posts_v2.json", JSON.stringify(posts))]);
    expect(res.assets.length).toBe(1);
    expect(res.assets[0]!.kind).toBe("post");
    expect(res.assets[0]!.description).toContain("Moved to a new city");
    expect(res.assets[0]!.takenAt).toMatch(/^2024-/);
  });

  it("parses profile values", () => {
    const profile = [
      { name: "Name", value: "Jane Doe" },
      { name: "Profile URI", value: "https://facebook.com/jane" },
      { name: "Email", value: "jane@example.com" },
    ];
    const res = parseFacebookArchive([file("personal_information/personal_information.json", JSON.stringify(profile))]);
    expect(res.profile?.name).toBe("Jane Doe");
    expect(res.profile?.profileUrl).toBe("https://facebook.com/jane");
    expect(res.profile?.recoveryEmail).toBe("jane@example.com");
  });

  it("extracts media entries from nested structures", () => {
    const media = [{ media: [{ uri: "photos_and_videos/photo1.jpg", creation_timestamp: 1600000000 }] }];
    const res = parseFacebookArchive([file("photos_and_videos/media.json", JSON.stringify(media))]);
    expect(res.assets.some((a) => a.kind === "photo")).toBe(true);
  });

  it("reports invalid JSON instead of silently dropping it", () => {
    const res = parseFacebookArchive([file("broken.json", "{not json")]);
    expect(res.skippedFiles).toBe(1);
    expect(res.skippedReasons[0]?.reason).toMatch(/not valid JSON/i);
  });

  it("reports unrecognized structures", () => {
    const res = parseFacebookArchive([file("weird.json", JSON.stringify({ unrelated: true }))]);
    expect(res.skippedFiles).toBe(1);
    expect(res.skippedReasons[0]?.reason).toMatch(/unrecognized/i);
  });

  it("never throws on hostile shapes", () => {
    expect(() =>
      parseFacebookArchive([
        file("a.json", JSON.stringify({ uri: 12345, nested: { uri: null, deep: [{ uri: "x.jpg" }] } })),
        file("b.json", JSON.stringify([null, 3, "text", { data: "not-array" }])),
      ]),
    ).not.toThrow();
  });

  it("parseProfile tolerates non-profile payloads", () => {
    expect(parseProfile("plain string")).toBeNull();
    expect(parseProfile({ nope: 1 })).toBeNull();
    expect(parseProfile([1, 2, 3])).toBeNull();
  });
});

describe("normalization", () => {
  it("cleans titles", () => {
    expect(normalizeTitle("my_photo__1.png")).toBe("my photo 1.png");
    expect(normalizeTitle("   ")).toBe("Untitled item");
  });
  it("infers kinds from filenames", () => {
    expect(kindFromFilename("a.jpg")).toBe("photo");
    expect(kindFromFilename("screen-shot.png")).toBe("screenshot");
    expect(kindFromFilename("clip.mov")).toBe("video");
    expect(kindFromFilename("report.pdf")).toBe("document");
    expect(kindFromFilename("mystery.bin")).toBe("other");
  });
});
