"use client";

/**
 * Mirrors UI state (open room, selected product, view mode) into the query
 * string without adding history entries. Going to a product page and pressing
 * Back then lands on the same room with the same piece open, and reloads or
 * shared links reopen it too. Next.js syncs native history calls with
 * useSearchParams, so no router round-trip is needed.
 */
export function replaceQuery(updates: Record<string, string | null>) {
  const url = new URL(window.location.href);
  for (const [key, value] of Object.entries(updates)) {
    if (value === null) url.searchParams.delete(key);
    else url.searchParams.set(key, value);
  }
  if (url.href !== window.location.href) window.history.replaceState(null, "", url);
}
