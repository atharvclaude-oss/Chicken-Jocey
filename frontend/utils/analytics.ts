// Thin analytics wrapper. Events are pushed to window.dataLayer so any provider
// (GA4, PostHog, Segment) can be wired in later without touching call sites.

export type AnalyticsEvent =
  | "room_opened"
  | "room_rotated"
  | "room_changed"
  | "room_entered"
  | "product_hovered"
  | "product_clicked"
  | "product_added_from_room"
  | "product_added_from_catalogue"
  | "room_bundle_started"
  | "room_bundle_purchased"
  | "cart_quantity_updated"
  | "page_error";

declare global {
  interface Window {
    dataLayer?: Record<string, unknown>[];
  }
}

export function track(event: AnalyticsEvent, props: Record<string, unknown> = {}) {
  if (typeof window === "undefined") return;
  window.dataLayer ??= [];
  window.dataLayer.push({ event, ...props });
  if (process.env.NODE_ENV === "development") {
    console.debug("[analytics]", event, props);
  }
}
