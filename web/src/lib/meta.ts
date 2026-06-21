// Meta Pixel (browser) helpers. The pixel is loaded by <MetaPixel/> in the
// root layout; these helpers fire standard events from anywhere client-side.

declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void;
    _fbq?: unknown;
  }
}

export const META_PIXEL_ID = process.env.NEXT_PUBLIC_META_PIXEL_ID;

/**
 * Fire a standard Meta event. `eventId` enables pixel↔CAPI deduplication —
 * pass the same id from the browser and the server for one logical event.
 */
export function metaTrack(
  event: string,
  params?: Record<string, unknown>,
  eventId?: string,
) {
  if (typeof window === "undefined" || typeof window.fbq !== "function") return;
  if (eventId) window.fbq("track", event, params ?? {}, { eventID: eventId });
  else window.fbq("track", event, params ?? {});
}

export {};
