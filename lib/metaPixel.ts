/** Meta (Facebook) Pixel helpers for Ads Manager events */

export const META_PIXEL_ID = "1795952121574997";

export type MetaPixelParams = Record<string, unknown>;

export function trackMetaEvent(
  eventName: string,
  params?: MetaPixelParams
): void {
  if (typeof window === "undefined" || typeof window.fbq !== "function") return;
  if (params) {
    window.fbq("track", eventName, params);
  } else {
    window.fbq("track", eventName);
  }
}

export function trackMetaPageView(): void {
  trackMetaEvent("PageView");
}

export function markMetaPurchaseTracked(transactionId: string): void {
  try {
    localStorage.setItem(`tracked_meta_purchase:${transactionId}`, "1");
  } catch {
    /* ignore */
  }
}

export function wasMetaPurchaseTracked(transactionId: string): boolean {
  try {
    return localStorage.getItem(`tracked_meta_purchase:${transactionId}`) === "1";
  } catch {
    return false;
  }
}
