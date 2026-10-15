/**
 * Exa-backed web search for the Scam Shield module.
 *
 * Exa is called from the Worker only: `EXA_API_KEY` is a server-side secret
 * (Wrangler secret in production, `api/.dev.vars` locally) and is never given
 * a browser-visible name. Nothing under `web/src` may import this module.
 *
 * The search returns the fields the feature renders — title, source URL,
 * publication date, author and query-relevant highlights — and maps Exa
 * failures onto ApiErrors the UI can show honestly (never an empty list).
 */
import Exa from "exa-js";
import { ApiError } from "../lib/errors";
import { logWarn } from "../lib/logger";
import type { WebSearchHit, WebSearchResult } from "../../../shared/types";

const MAX_RESULTS = 5;

/**
 * Build the Exa client from the server-side key. The key always arrives from
 * the Worker environment — never a literal.
 */
export function exaClient(apiKey: string | undefined): Exa {
  if (!apiKey) {
    throw new ApiError(
      503,
      "search_unavailable",
      "Web search is not configured on this server. An administrator must set EXA_API_KEY.",
    );
  }
  return new Exa(apiKey);
}

/** Run one web search and return only the fields the Scam Shield UI shows. */
export async function searchWeb(
  apiKey: string | undefined,
  query: string,
): Promise<WebSearchResult> {
  const exa = exaClient(apiKey);
  try {
    const response = await exa.search(query, {
      type: "auto",
      numResults: MAX_RESULTS,
      contents: { highlights: true },
    });
    return {
      query,
      hits: response.results.map(
        (r): WebSearchHit => ({
          title: r.title,
          url: r.url,
          publishedDate: r.publishedDate ?? null,
          author: r.author ?? null,
          highlights: (r.highlights ?? []).filter((h) => h.trim().length > 0).slice(0, 3),
        }),
      ),
    };
  } catch (err) {
    throw exaError(err);
  }
}

/**
 * Turn an Exa failure into an ApiError with a message the feature can display.
 * 401 = key rejected, 402 = credits exhausted, 429 = rate limited.
 */
export function exaError(err: unknown): ApiError {
  if (err instanceof ApiError) return err;
  const status = typeof (err as { statusCode?: unknown })?.statusCode === "number"
    ? (err as { statusCode: number }).statusCode
    : undefined;
  if (err instanceof Error && err.name === "AbortError") {
    return new ApiError(504, "search_timeout", "The web search timed out. Please try again.");
  }
  if (status === 401 || status === 403) {
    logWarn("exa_auth_failed", { status });
    return new ApiError(
      503,
      "search_unavailable",
      "Web search is misconfigured: the server's Exa API key was rejected. An administrator must check EXA_API_KEY.",
    );
  }
  if (status === 402) {
    return new ApiError(
      503,
      "search_quota_exhausted",
      "Web search is temporarily unavailable because the server's Exa credits are exhausted.",
    );
  }
  if (status === 429) {
    return new ApiError(429, "rate_limited", "Web search is busy right now. Please try again shortly.");
  }
  logWarn("exa_search_failed", {
    status,
    message: err instanceof Error ? err.message.slice(0, 200) : String(err).slice(0, 200),
  });
  return new ApiError(502, "search_failed", "The web search failed. Please try again.");
}
